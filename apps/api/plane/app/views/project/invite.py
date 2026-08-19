# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import UUID

# Django imports
from django.db import transaction
from django.utils import timezone

# Third Party imports
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

# Module imports
from .base import BaseViewSet, BaseAPIView
from plane.app.serializers import ProjectMemberInviteSerializer
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import (
    ProjectMember,
    ProjectMemberInvite,
    WorkspaceMember,
    Workspace,
    Project,
    ProjectUserProperty,
)
from plane.db.models.project import ProjectNetwork
from plane.utils.internal_roles import ADMIN_ROLE, MEMBER_ROLE, normalize_legacy_internal_role


class ProjectInvitationsViewset(BaseViewSet):
    serializer_class = ProjectMemberInviteSerializer
    model = ProjectMemberInvite

    search_fields = []

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .select_related("project")
            .select_related("workspace", "workspace__owner")
        )


class UserProjectInvitationsViewset(BaseViewSet):
    serializer_class = ProjectMemberInviteSerializer
    model = ProjectMemberInvite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(email=self.request.user.email)
            .select_related("workspace", "workspace__owner", "project")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    @transaction.atomic
    def create(self, request, slug):
        raw_project_ids = request.data.get("project_ids", [])
        if not isinstance(raw_project_ids, list) or not raw_project_ids:
            return Response(
                {"error": "At least one project is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            requested_project_ids = {UUID(str(project_id)) for project_id in raw_project_ids}
        except (AttributeError, TypeError, ValueError):
            return Response(
                {"error": "Every project ID must be a valid UUID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Use the workspace row as the membership lifecycle mutex, then lock
        # projects and memberships in a deterministic order. This matches the
        # administrator-driven membership flows and prevents a stale public
        # self-join from racing an administrator removal.
        workspace = Workspace.objects.select_for_update().get(slug=slug)

        # Resolve every requested project inside the workspace before writing any
        # denormalized workspace/project relationship rows.
        projects = list(
            Project.objects.select_for_update()
            .filter(
                id__in=requested_project_ids,
                workspace=workspace,
                archived_at__isnull=True,
            )
            .only("id", "network")
            .order_by("id")
        )
        if len(projects) != len(requested_project_ids):
            return Response(
                {"error": "Every project must exist in this workspace and be active"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project_ids = [project.id for project in projects]

        workspace_member = (
            WorkspaceMember.objects.select_for_update()
            .filter(member=request.user, workspace=workspace, is_active=True)
            .first()
        )
        if workspace_member is None:
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if user has permission to join each project
        for project in projects:
            if project.network == ProjectNetwork.SECRET.value and workspace_member.role != ROLE.ADMIN.value:
                return Response(
                    {"error": "Only workspace admins can join private project"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        project_memberships = list(
            ProjectMember.objects.select_for_update()
            .filter(
                workspace=workspace,
                project_id__in=project_ids,
                member=request.user,
            )
            .order_by("project_id")
        )
        if any(not membership.is_active for membership in project_memberships):
            return Response(
                {
                    "code": "PROJECT_ADMIN_REACTIVATION_REQUIRED",
                    "error": "A project administrator must reactivate this member.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        existing_project_ids = {membership.project_id for membership in project_memberships}
        new_project_ids = [project_id for project_id in project_ids if project_id not in existing_project_ids]

        ProjectMember.objects.bulk_create(
            [
                ProjectMember(
                    project_id=project_id,
                    member=request.user,
                    role=workspace_member.role,
                    workspace=workspace,
                    created_by=request.user,
                )
                for project_id in new_project_ids
            ],
            ignore_conflicts=True,
        )

        ProjectUserProperty.objects.bulk_create(
            [
                ProjectUserProperty(
                    project_id=project_id,
                    user=request.user,
                    workspace=workspace,
                    created_by=request.user,
                )
                for project_id in project_ids
            ],
            ignore_conflicts=True,
        )

        return Response({"message": "Projects joined successfully"}, status=status.HTTP_201_CREATED)


class ProjectJoinEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request, slug, project_id, pk):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Sign in with the invited email address before responding"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        accepted = request.data.get("accepted", False)

        with transaction.atomic():
            # Match the membership lifecycle lock order used elsewhere:
            # workspace, invitation, workspace membership, project membership.
            workspace = Workspace.objects.select_for_update().get(slug=slug)
            project_invite = ProjectMemberInvite.objects.select_for_update().get(
                pk=pk, project_id=project_id, workspace=workspace
            )

            if request.user.email.strip().casefold() != project_invite.email.strip().casefold():
                return Response(
                    {"error": "Sign in with the email address that received this invitation"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if project_invite.responded_at is not None:
                return Response(
                    {"error": "You have already responded to the invitation request"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if accepted:
                try:
                    invitation_role = normalize_legacy_internal_role(project_invite.role)
                except ValueError:
                    return Response(
                        {"error": "The invitation has an invalid role"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Check if user is a part of workspace
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

                # Lock and validate the project membership before writing any
                # workspace membership state. A rejected project reactivation
                # must be a zero-write transaction.
                project_member = (
                    ProjectMember.objects.select_for_update()
                    .filter(
                        workspace_id=project_invite.workspace_id,
                        project_id=project_id,
                        member=request.user,
                    )
                    .first()
                )
                if project_member is not None and not project_member.is_active:
                    return Response(
                        {
                            "code": "PROJECT_ADMIN_REACTIVATION_REQUIRED",
                            "error": "A project administrator must reactivate this member.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                # Add him to workspace
                if workspace_member is None:
                    workspace_member = WorkspaceMember.objects.create(
                        workspace_id=project_invite.workspace_id,
                        member=request.user,
                        role=ADMIN_ROLE if workspace.owner_id == request.user.id else MEMBER_ROLE,
                        created_by=request.user,
                    )
                else:
                    # Else make him active
                    workspace_member.is_active = True
                    if workspace.owner_id == request.user.id:
                        workspace_member.role = ADMIN_ROLE
                    workspace_member.save()

                is_workspace_admin = workspace_member.role == ADMIN_ROLE
                effective_role = (
                    ADMIN_ROLE
                    if is_workspace_admin
                    else project_member.role
                    if project_member is not None
                    else invitation_role
                )
                if project_member is None:
                    # Create a Project Member
                    ProjectMember.objects.create(
                        project_id=project_id,
                        member=request.user,
                        role=effective_role,
                        created_by=request.user,
                    )
                else:
                    project_member.is_active = True
                    project_member.role = effective_role
                    project_member.save()

                project_invite.accepted = True
                project_invite.responded_at = timezone.now()
                project_invite.save()
            else:
                project_invite.accepted = False
                project_invite.responded_at = timezone.now()
                project_invite.save()

        if accepted:
            return Response(
                {"message": "Project Invitation Accepted"},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"message": "Project Invitation was not accepted"},
            status=status.HTTP_200_OK,
        )

    def get(self, request, slug, project_id, pk):
        project_invitation = ProjectMemberInvite.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        serializer = ProjectMemberInviteSerializer(project_invitation)
        return Response(serializer.data, status=status.HTTP_200_OK)
