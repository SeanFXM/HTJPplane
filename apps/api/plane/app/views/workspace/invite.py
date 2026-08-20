# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime

import jwt

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkSpaceAdminPermission
from plane.app.serializers import (
    WorkSpaceMemberInviteSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.event_tracking_task import track_event
from plane.bgtasks.workspace_invitation_task import workspace_invitation
from plane.db.models import Profile, Workspace, WorkspaceMember, WorkspaceMemberInvite
from plane.utils.cache import invalidate_cache, invalidate_cache_directly
from plane.utils.host import base_host
from plane.utils.analytics_events import USER_JOINED_WORKSPACE, USER_INVITED_TO_WORKSPACE
from plane.utils.internal_roles import ADMIN_ROLE, normalize_legacy_internal_role, parse_assignable_role
from .. import BaseViewSet


class WorkspaceInvitationsViewset(BaseViewSet):
    """Endpoint for creating, listing and  deleting workspaces"""

    serializer_class = WorkSpaceMemberInviteSerializer
    model = WorkspaceMemberInvite

    permission_classes = [WorkSpaceAdminPermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "workspace__owner", "created_by")
        )

    @transaction.atomic
    def create(self, request, slug):
        emails = request.data.get("emails", [])
        # Check if email is provided
        if not emails:
            return Response({"error": "Emails are required"}, status=status.HTTP_400_BAD_REQUEST)

        normalized_emails = {}
        for email in emails:
            if not isinstance(email, dict):
                return Response({"error": "Each invitation must be an object"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                role = parse_assignable_role(email.get("role"))
            except ValueError as error:
                return Response({"role": str(error)}, status=status.HTTP_400_BAD_REQUEST)
            raw_email = email.get("email")
            try:
                validate_email(raw_email)
            except (TypeError, ValidationError):
                return Response(
                    {"error": f"Invalid email - {raw_email}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            normalized_email = raw_email.strip().lower()
            existing_payload = normalized_emails.get(normalized_email)
            if existing_payload is not None and existing_payload["role"] != role:
                return Response(
                    {"error": f"Conflicting roles were provided for {normalized_email}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            normalized_emails[normalized_email] = {"email": normalized_email, "role": role}
        emails = list(normalized_emails.values())

        # The workspace row serializes invitation creation and membership
        # lifecycle checks, including duplicate requests.
        workspace = Workspace.objects.select_for_update().get(slug=slug)
        locked_workspace_members = list(
            WorkspaceMember.objects.select_for_update(of=("self",))
            .filter(workspace=workspace)
            .select_related("member", "member__avatar_asset")
            .order_by("id")
        )

        # check for role level of the requesting user
        requesting_user = next(
            (
                workspace_member
                for workspace_member in locked_workspace_members
                if workspace_member.member_id == request.user.id and workspace_member.is_active
            ),
            None,
        )
        if requesting_user is None:
            return Response(
                {"error": "Workspace admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if any invited user has an higher role
        if any(email["role"] > requesting_user.role for email in emails):
            return Response(
                {"error": "You cannot invite a user with higher role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requested_emails = {email["email"] for email in emails}
        workspace_members = [
            workspace_member
            for workspace_member in locked_workspace_members
            if workspace_member.member.email.strip().casefold() in requested_emails
        ]

        if any(not workspace_member.is_active for workspace_member in workspace_members):
            return Response(
                {
                    "code": "ADMIN_REACTIVATION_REQUIRED",
                    "error": "Reactivate existing employees from the employee administration page.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        active_workspace_members = [
            workspace_member for workspace_member in workspace_members if workspace_member.is_active
        ]
        if active_workspace_members:
            return Response(
                {
                    "error": "Some users are already member of workspace",
                    "workspace_users": WorkSpaceMemberSerializer(active_workspace_members, many=True).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_invitations = {
            invitation.email.strip().casefold(): invitation
            for invitation in WorkspaceMemberInvite.objects.select_for_update()
            .filter(workspace=workspace)
            .order_by("id")
        }
        workspace_invitations = []
        for email in emails:
            if email["email"] in existing_invitations:
                continue
            workspace_invitations.append(
                WorkspaceMemberInvite.objects.create(
                    email=email["email"],
                    workspace=workspace,
                    token=jwt.encode(
                        {"email": email, "timestamp": datetime.now().timestamp()},
                        settings.SECRET_KEY,
                        algorithm="HS256",
                    ),
                    role=email["role"],
                    created_by=request.user,
                )
            )

        current_site = base_host(request=request, is_app=True)

        # Send only invitations persisted by this request, and only after the
        # transaction commits.
        for invitation in workspace_invitations:
            transaction.on_commit(
                lambda persisted_invitation=invitation: (
                    workspace_invitation.delay(
                        persisted_invitation.email,
                        workspace.id,
                        persisted_invitation.token,
                        current_site,
                        request.user.email,
                    ),
                    track_event.delay(
                        user_id=request.user.id,
                        event_name=USER_INVITED_TO_WORKSPACE,
                        slug=slug,
                        event_properties={
                            "user_id": request.user.id,
                            "workspace_id": workspace.id,
                            "workspace_slug": workspace.slug,
                            "invitee_role": persisted_invitation.role,
                            "invited_at": str(timezone.now()),
                            "invitee_email": persisted_invitation.email,
                        },
                    ),
                )
            )

        return Response(
            {
                "message": "Invitations created and email delivery queued",
                "created_count": len(workspace_invitations),
                "existing_count": len(emails) - len(workspace_invitations),
            },
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, slug, pk):
        workspace_member_invite = WorkspaceMemberInvite.objects.get(pk=pk, workspace__slug=slug)
        workspace_member_invite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceJoinEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    """Invitation response endpoint the user can respond to the invitation"""

    @invalidate_cache(path="/api/workspaces/", user=False)
    @invalidate_cache(path="/api/users/me/workspaces/", multiple=True)
    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        user=False,
        multiple=True,
        url_params=True,
    )
    @invalidate_cache(path="/api/users/me/settings/", multiple=True)
    def post(self, request, slug, pk):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Sign in with the invited email address before responding"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token = request.data.get("token", "")
        accepted = request.data.get("accepted", False)

        with transaction.atomic():
            # The workspace row is the stable mutex for membership lifecycle
            # changes. Lock it before the invitation and membership so a stale
            # invitation cannot race a current role update and lower access.
            workspace = Workspace.objects.select_for_update().get(slug=slug)
            workspace_invite = WorkspaceMemberInvite.objects.select_for_update().get(pk=pk, workspace=workspace)

            if not token or workspace_invite.token != token:
                return Response(
                    {"error": "You do not have permission to join the workspace"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if request.user.email.strip().casefold() != workspace_invite.email.strip().casefold():
                return Response(
                    {"error": "Sign in with the email address that received this invitation"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if workspace_invite.responded_at is not None:
                return Response(
                    {"error": "You have already responded to the invitation request"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if accepted:
                try:
                    invitation_role = normalize_legacy_internal_role(workspace_invite.role)
                except ValueError:
                    return Response(
                        {"error": "The invitation has an invalid role"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                workspace_member = (
                    WorkspaceMember.objects.select_for_update().filter(workspace=workspace, member=request.user).first()
                )
                if workspace_member is not None and not workspace_member.is_active:
                    return Response(
                        {
                            "code": "ADMIN_REACTIVATION_REQUIRED",
                            "error": "A workspace administrator must reactivate this employee.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                effective_role = (
                    ADMIN_ROLE
                    if workspace.owner_id == request.user.id
                    else workspace_member.role
                    if workspace_member is not None
                    else invitation_role
                )
                if workspace_member is not None:
                    workspace_member.is_active = True
                    workspace_member.role = effective_role
                    workspace_member.save()
                else:
                    WorkspaceMember.objects.create(
                        workspace=workspace,
                        member=request.user,
                        role=effective_role,
                        created_by=request.user,
                    )

                Profile.objects.filter(user=request.user).update(last_workspace_id=workspace.id)
                workspace_invite.accepted = True
                workspace_invite.responded_at = timezone.now()
                workspace_invite.save()

                event_properties = {
                    "user_id": request.user.id,
                    "workspace_id": workspace.id,
                    "workspace_slug": workspace.slug,
                    "role": effective_role,
                    "joined_at": str(timezone.now()),
                }
                workspace_invite.delete()
            else:
                workspace_invite.accepted = False
                workspace_invite.responded_at = timezone.now()
                workspace_invite.save()

        if accepted:
            track_event.delay(
                user_id=request.user.id,
                event_name=USER_JOINED_WORKSPACE,
                slug=slug,
                event_properties=event_properties,
            )
            return Response(
                {"message": "Workspace Invitation Accepted"},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"message": "Workspace Invitation was not accepted"},
            status=status.HTTP_200_OK,
        )

    def get(self, request, slug, pk):
        workspace_invitation = WorkspaceMemberInvite.objects.get(workspace__slug=slug, pk=pk)
        serializer = WorkSpaceMemberInviteSerializer(workspace_invitation)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserWorkspaceInvitationsViewSet(BaseViewSet):
    serializer_class = WorkSpaceMemberInviteSerializer
    model = WorkspaceMemberInvite

    def get_queryset(self):
        return self.filter_queryset(
            super().get_queryset().filter(email=self.request.user.email).select_related("workspace")
        )

    @invalidate_cache(path="/api/workspaces/", user=False)
    @invalidate_cache(path="/api/users/me/workspaces/", multiple=True)
    @transaction.atomic
    def create(self, request):
        invitations = request.data.get("invitations", [])
        invitation_scope = WorkspaceMemberInvite.objects.filter(pk__in=invitations, email=request.user.email)

        # Serialize every membership create/reactivation for the selected
        # workspaces, then lock the invites and existing memberships in a
        # deterministic order.
        workspace_ids = list(invitation_scope.values_list("workspace_id", flat=True))
        workspaces = {
            workspace.id: workspace
            for workspace in Workspace.objects.select_for_update().filter(id__in=workspace_ids).order_by("id")
        }
        workspace_invitations = list(invitation_scope.select_for_update().order_by("workspace_id", "id"))

        try:
            invitation_roles = {
                invitation.id: normalize_legacy_internal_role(invitation.role) for invitation in workspace_invitations
            }
        except ValueError:
            return Response({"error": "An invitation has an invalid role"}, status=status.HTTP_400_BAD_REQUEST)

        workspace_members = {
            workspace_member.workspace_id: workspace_member
            for workspace_member in WorkspaceMember.objects.select_for_update()
            .filter(workspace_id__in=workspace_ids, member=request.user)
            .order_by("workspace_id", "id")
        }
        if any(
            workspace_member is not None and not workspace_member.is_active
            for workspace_member in (
                workspace_members.get(invitation.workspace_id) for invitation in workspace_invitations
            )
        ):
            return Response(
                {
                    "code": "ADMIN_REACTIVATION_REQUIRED",
                    "error": "A workspace administrator must reactivate this employee.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        effective_roles = {}

        for invitation in workspace_invitations:
            workspace = workspaces[invitation.workspace_id]
            workspace_member = workspace_members.get(invitation.workspace_id)
            effective_role = (
                ADMIN_ROLE
                if workspace.owner_id == request.user.id
                else workspace_member.role
                if workspace_member is not None
                else invitation_roles[invitation.id]
            )
            effective_roles[invitation.id] = effective_role

            if workspace_member is None:
                workspace_member = WorkspaceMember.objects.create(
                    workspace=workspace,
                    member=request.user,
                    role=effective_role,
                    created_by=request.user,
                )
                workspace_members[invitation.workspace_id] = workspace_member
            else:
                workspace_member.is_active = True
                workspace_member.role = effective_role
                workspace_member.save()

            invalidate_cache_directly(
                path=f"/api/workspaces/{workspace.slug}/members/",
                user=False,
                request=request,
                multiple=True,
            )

            # Track event
            track_event.delay(
                user_id=request.user.id,
                event_name=USER_JOINED_WORKSPACE,
                slug=workspace.slug,
                event_properties={
                    "user_id": request.user.id,
                    "workspace_id": workspace.id,
                    "workspace_slug": workspace.slug,
                    "role": effective_roles[invitation.id],
                    "joined_at": str(timezone.now()),
                },
            )

        # Delete joined workspace invites
        WorkspaceMemberInvite.objects.filter(id__in=[invitation.id for invitation in workspace_invitations]).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
