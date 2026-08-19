# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count, Exists, IntegerField, OuterRef, Subquery
from django.utils import timezone
from django.db.models.functions import Coalesce

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission, allow_permission, ROLE

# Module imports
from plane.app.serializers import (
    ProjectMemberRoleSerializer,
    WorkspaceMemberAdminSerializer,
    WorkspaceMemberMeSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import DraftIssue, ProjectMember, Workspace, WorkspaceMember
from plane.utils.cache import invalidate_cache
from plane.utils.internal_roles import parse_assignable_role

from .. import BaseViewSet


def is_only_active_project_admin(*, workspace_slug, member_id):
    other_active_admin = ProjectMember.objects.filter(
        project_id=OuterRef("project_id"),
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exclude(member_id=member_id)

    return (
        ProjectMember.objects.filter(
            workspace__slug=workspace_slug,
            member_id=member_id,
            role=ROLE.ADMIN.value,
            is_active=True,
        )
        .annotate(has_other_active_admin=Exists(other_active_admin))
        .filter(has_other_active_admin=False)
        .exists()
    )


def lock_active_memberships_for_admin_projects(*, workspace_slug, member_id):
    admin_project_ids = list(
        ProjectMember.objects.filter(
            workspace__slug=workspace_slug,
            member_id=member_id,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).values_list("project_id", flat=True)
    )
    list(
        ProjectMember.objects.select_for_update()
        .filter(project_id__in=admin_project_ids, is_active=True)
        .order_by("project_id", "id")
        .values_list("id", flat=True)
    )


def lock_active_workspace_memberships(*, workspace_slug):
    list(
        WorkspaceMember.objects.select_for_update()
        .filter(workspace__slug=workspace_slug, is_active=True)
        .order_by("id")
        .values_list("id", flat=True)
    )


class WorkSpaceMemberViewSet(BaseViewSet):
    serializer_class = WorkspaceMemberAdminSerializer
    model = WorkspaceMember

    search_fields = ["member__display_name", "member__first_name"]
    use_read_replica = True

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("member", "member__avatar_asset")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        # Get all active workspace members
        workspace_members = self.get_queryset()
        if workspace_member.role > 5:
            serializer = WorkspaceMemberAdminSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        else:
            serializer = WorkSpaceMemberSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        try:
            # Get the specific workspace member by pk
            member = self.get_queryset().get(pk=pk)
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "Workspace member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if workspace_member.role > ROLE.GUEST.value:
            serializer = WorkspaceMemberAdminSerializer(member, fields=("id", "member", "role"))
        else:
            serializer = WorkSpaceMemberSerializer(member, fields=("id", "member", "role"))
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def partial_update(self, request, slug, pk):
        if "role" not in request.data or set(request.data.keys()) - {"role"}:
            return Response(
                {"error": "Only the workspace member role can be updated here"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            new_role = parse_assignable_role(request.data["role"])
        except ValueError as error:
            return Response(
                {"role": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.select_for_update().get(slug=slug)
        lock_active_workspace_memberships(workspace_slug=slug)
        workspace_member = WorkspaceMember.objects.filter(
            pk=pk,
            workspace__slug=slug,
            member__is_bot=False,
            is_active=True,
        ).first()
        if workspace_member is None:
            return Response({"error": "Workspace member not found"}, status=status.HTTP_404_NOT_FOUND)
        requesting_workspace_member = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).first()
        if requesting_workspace_member is None:
            return Response(
                {"error": "Workspace admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if workspace_member.member_id == workspace.owner_id:
            return Response(
                {
                    "code": "WORKSPACE_OWNER_PROTECTED",
                    "error": "The workspace owner cannot be downgraded or deactivated.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if request.user.id == workspace_member.member_id:
            return Response(
                {"error": "You cannot update your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkSpaceMemberSerializer(workspace_member, data={"role": new_role}, partial=True)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    @transaction.atomic
    def destroy(self, request, slug, pk):
        workspace = Workspace.objects.select_for_update().get(slug=slug)
        lock_active_workspace_memberships(workspace_slug=slug)
        workspace_member = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            pk=pk,
            member__is_bot=False,
            is_active=True,
        ).first()
        if workspace_member is None:
            return Response({"error": "Workspace member not found"}, status=status.HTTP_404_NOT_FOUND)

        requesting_workspace_member = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).first()
        if requesting_workspace_member is None:
            return Response(
                {"error": "Workspace admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if workspace_member.member_id == workspace.owner_id:
            return Response(
                {
                    "code": "WORKSPACE_OWNER_PROTECTED",
                    "error": "The workspace owner cannot be downgraded or deactivated.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if str(workspace_member.id) == str(requesting_workspace_member.id):
            return Response(
                {"error": "You cannot remove yourself from the workspace. Please use leave workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requesting_workspace_member.role < workspace_member.role:
            return Response(
                {"error": "You cannot remove a user having role higher than you"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lock_active_memberships_for_admin_projects(
            workspace_slug=slug,
            member_id=workspace_member.member_id,
        )
        if is_only_active_project_admin(workspace_slug=slug, member_id=workspace_member.member_id):
            return Response(
                {
                    "error": "User is a part of some projects where they are the only admin, they should either leave that project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        workspace_member.is_active = False
        workspace_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        url_params=True,
        user=False,
        multiple=True,
    )
    @invalidate_cache(path="/api/users/me/settings/")
    @invalidate_cache(path="api/users/me/workspaces/", user=False, multiple=True)
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    @transaction.atomic
    def leave(self, request, slug):
        workspace = Workspace.objects.select_for_update().get(slug=slug)
        lock_active_workspace_memberships(workspace_slug=slug)
        workspace_member = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).first()
        if workspace_member is None:
            return Response({"error": "Workspace membership is no longer active"}, status=status.HTTP_403_FORBIDDEN)

        if workspace_member.member_id == workspace.owner_id:
            return Response(
                {
                    "code": "WORKSPACE_OWNER_PROTECTED",
                    "error": "The workspace owner cannot leave the workspace.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Check if the leaving user is the only admin of the workspace
        if (
            workspace_member.role == 20
            and not WorkspaceMember.objects.filter(workspace__slug=slug, role=20, is_active=True).count() > 1
        ):
            return Response(
                {
                    "error": "You cannot leave the workspace as you are the only admin of the workspace you will have to either delete the workspace or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        lock_active_memberships_for_admin_projects(
            workspace_slug=slug,
            member_id=request.user.id,
        )
        if is_only_active_project_admin(workspace_slug=slug, member_id=request.user.id):
            return Response(
                {
                    "error": "You are a part of some projects where you are the only admin, you should either leave the project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        # # Deactivate the user
        workspace_member.is_active = False
        workspace_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserViewsEndpoint(BaseAPIView):
    def post(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)
        workspace_member.view_props = request.data.get("view_props", {})
        workspace_member.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserEndpoint(BaseAPIView):
    use_read_replica = True

    def get(self, request, slug):
        draft_issue_count = (
            DraftIssue.objects.filter(created_by=request.user, workspace_id=OuterRef("workspace_id"))
            .values("workspace_id")
            .annotate(count=Count("id"))
            .values("count")
        )

        workspace_member = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .annotate(draft_issue_count=Coalesce(Subquery(draft_issue_count, output_field=IntegerField()), 0))
            .first()
        )
        serializer = WorkspaceMemberMeSerializer(workspace_member)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceProjectMemberEndpoint(BaseAPIView):
    serializer_class = ProjectMemberRoleSerializer
    model = ProjectMember

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        # Fetch all project IDs where the user is involved
        project_ids = (
            ProjectMember.objects.filter(member=request.user, is_active=True)
            .values_list("project_id", flat=True)
            .distinct()
        )

        # Get all the project members in which the user is involved
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug, project_id__in=project_ids, is_active=True
        ).select_related("project", "member", "workspace")
        project_members = ProjectMemberRoleSerializer(project_members, many=True).data

        project_members_dict = dict()

        # Construct a dictionary with project_id as key and project_members as value
        for project_member in project_members:
            project_id = project_member.pop("project")
            if str(project_id) not in project_members_dict:
                project_members_dict[str(project_id)] = []
            project_members_dict[str(project_id)].append(project_member)

        return Response(project_members_dict, status=status.HTTP_200_OK)
