# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from django.db.models import Min
from django.utils import timezone

# Module imports
from .base import BaseViewSet, BaseAPIView
from plane.app.serializers import (
    ProjectMemberSerializer,
    ProjectMemberAdminSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberPreferenceSerializer,
)

from plane.app.permissions import WorkspaceUserPermission

from plane.db.models import Project, ProjectMember, ProjectUserProperty, WorkspaceMember
from plane.bgtasks.project_add_user_email_task import project_add_user_email
from plane.utils.host import base_host
from plane.utils.internal_roles import parse_assignable_role
from plane.app.permissions.base import allow_permission, ROLE


def lock_active_project_members(*, workspace_slug, project_id):
    list(
        ProjectMember.objects.select_for_update()
        .filter(workspace__slug=workspace_slug, project_id=project_id, is_active=True)
        .order_by("id")
        .values_list("id", flat=True)
    )


class ProjectMemberViewSet(BaseViewSet):
    serializer_class = ProjectMemberAdminSerializer
    model = ProjectMember

    search_fields = ["member__display_name", "member__first_name"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(member__is_bot=False)
            .filter()
            .select_related("project")
            .select_related("member")
            .select_related("workspace", "workspace__owner")
        )

    @allow_permission([ROLE.ADMIN])
    @transaction.atomic
    def create(self, request, slug, project_id):
        # Get the list of members to be added to the project and their roles i.e. the user_id and the role
        members = request.data.get("members", [])

        # The project row serializes concurrent bulk additions for members that
        # do not have a membership row to lock yet.
        project = Project.objects.select_for_update().get(pk=project_id, workspace__slug=slug)

        # Check if the members array is empty
        if not len(members):
            return Response(
                {"error": "At least one member is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_members = []
        for member in members:
            if not isinstance(member, dict) or not member.get("member_id"):
                return Response(
                    {"error": "Each member must include a member_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                role = parse_assignable_role(member.get("role"))
            except ValueError as error:
                return Response({"role": str(error)}, status=status.HTTP_400_BAD_REQUEST)
            normalized_members.append({**member, "role": role})
        members = normalized_members

        # Create a dictionary of the member_id and their roles
        member_roles = {str(member["member_id"]): member["role"] for member in members}
        member_ids = list(member_roles)

        # Follow the same lock order as role updates: workspace memberships,
        # then every project membership. Recheck the requester's authority
        # after locking so a concurrent demotion cannot authorize this write.
        locked_workspace_members = list(
            WorkspaceMember.objects.select_for_update()
            .filter(
                workspace_id=project.workspace_id,
                member_id__in=set(member_ids) | {str(request.user.id)},
                is_active=True,
            )
            .order_by("id")
        )
        workspace_members = {
            str(workspace_member.member_id): workspace_member for workspace_member in locked_workspace_members
        }
        if any(member_id not in workspace_members for member_id in member_ids):
            return Response(
                {"error": "Every project member must be an active workspace member"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        locked_project_members = list(ProjectMember.objects.select_for_update().filter(project=project).order_by("id"))
        existing_project_members = {
            str(project_member.member_id): project_member
            for project_member in locked_project_members
            if project_member.member_id is not None
        }
        requesting_project_member = existing_project_members.get(str(request.user.id))
        requesting_workspace_member = workspace_members.get(str(request.user.id))
        if (
            requesting_project_member is None
            or not requesting_project_member.is_active
            or (
                requesting_project_member.role != ROLE.ADMIN.value
                and (requesting_workspace_member is None or requesting_workspace_member.role != ROLE.ADMIN.value)
            )
        ):
            return Response(
                {"error": "Project admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # check the workspace role of the new user
        for member_id, requested_role in member_roles.items():
            workspace_member_role = workspace_members[member_id].role
            if workspace_member_role == ROLE.ADMIN.value and requested_role != ROLE.ADMIN.value:
                return Response(
                    {"error": "You cannot add a user with role lower than the workspace role"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Existing memberships are monotonic: adding an active member at the
        # same/lower role is a no-op; reactivation keeps the higher old role.
        project_members_to_update = []
        for member_id, requested_role in member_roles.items():
            project_member = existing_project_members.get(member_id)
            if project_member is None:
                continue
            effective_role = max(project_member.role, requested_role)
            if not project_member.is_active or project_member.role != effective_role:
                project_member.role = effective_role
                project_member.is_active = True
                project_member.updated_at = timezone.now()
                project_member.updated_by = request.user
                project_members_to_update.append(project_member)

        if project_members_to_update:
            ProjectMember.objects.bulk_update(
                project_members_to_update,
                ["is_active", "role", "updated_at", "updated_by"],
                batch_size=100,
            )

        # Get the minimum sort_order for each member in the workspace
        member_sort_orders = (
            ProjectUserProperty.objects.filter(
                workspace__slug=slug,
                user_id__in=member_ids,
            )
            .values("user_id")
            .annotate(min_sort_order=Min("sort_order"))
        )
        # Convert to dictionary for easy lookup: {user_id: min_sort_order}
        sort_order_map = {str(item["user_id"]): item["min_sort_order"] for item in member_sort_orders}

        bulk_project_members = []
        bulk_issue_props = []
        for member_id, requested_role in member_roles.items():
            if member_id in existing_project_members:
                continue
            # Get the minimum sort_order for this member, or use default
            min_sort_order = sort_order_map.get(member_id)
            # Create a new project member
            bulk_project_members.append(
                ProjectMember(
                    member_id=member_id,
                    role=requested_role,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                )
            )
            # Create a new issue property
            bulk_issue_props.append(
                ProjectUserProperty(
                    user_id=member_id,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    sort_order=(min_sort_order - 10000 if min_sort_order is not None else 65535),
                    created_by=request.user,
                )
            )

        # Bulk create the project members and issue properties
        _ = ProjectMember.objects.bulk_create(bulk_project_members, batch_size=10, ignore_conflicts=True)

        _ = ProjectUserProperty.objects.bulk_create(bulk_issue_props, batch_size=10, ignore_conflicts=True)

        project_members = ProjectMember.objects.filter(
            project_id=project_id,
            member_id__in=member_ids,
        )
        # Queue notifications only after memberships are committed so workers
        # cannot race the transaction and observe a missing/stale row.
        current_site = base_host(request=request, is_app=True)
        requesting_user_id = request.user.id
        for project_member_id in project_members.values_list("id", flat=True):
            transaction.on_commit(
                lambda member_id=project_member_id, user_id=requesting_user_id: project_add_user_email.delay(
                    current_site,
                    member_id,
                    user_id,
                )
            )
        # Serialize the project members
        serializer = ProjectMemberRoleSerializer(project_members, many=True)
        # Return the serialized data
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        # Get the list of project members for the project
        project_members = ProjectMember.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            member__is_bot=False,
            is_active=True,
            member__member_workspace__workspace__slug=slug,
            member__member_workspace__is_active=True,
        ).select_related("project", "member", "workspace")

        serializer = ProjectMemberRoleSerializer(project_members, fields=("id", "member", "role"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        requesting_project_member = ProjectMember.objects.get(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        )

        project_member = (
            ProjectMember.objects.filter(
                pk=pk,
                project_id=project_id,
                workspace__slug=slug,
                member__is_bot=False,
                is_active=True,
            )
            .select_related("project", "member", "workspace")
            .first()
        )

        if not project_member:
            return Response(
                {"error": "Project member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if requesting_project_member.role > ROLE.GUEST.value:
            serializer = ProjectMemberAdminSerializer(project_member)
        else:
            serializer = ProjectMemberRoleSerializer(project_member, fields=("id", "member", "role"))

        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    @transaction.atomic
    def partial_update(self, request, slug, project_id, pk):
        if "role" not in request.data or set(request.data.keys()) - {"role"}:
            return Response(
                {"error": "Only the project member role can be updated here"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            new_role = parse_assignable_role(request.data["role"])
        except ValueError as error:
            return Response(
                {"role": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_membership = ProjectMember.objects.filter(
            pk=pk,
            workspace__slug=slug,
            project_id=project_id,
            is_active=True,
        ).first()
        if target_membership is None:
            return Response({"error": "Project member not found"}, status=status.HTTP_404_NOT_FOUND)

        # Use a consistent lock order across member lifecycle operations. Lock
        # workspace memberships first, then every active membership in the
        # project so concurrent admin downgrades cannot both pass the check.
        list(
            WorkspaceMember.objects.select_for_update()
            .filter(
                workspace__slug=slug,
                member_id__in=[target_membership.member_id, request.user.id],
                is_active=True,
            )
            .order_by("id")
            .values_list("id", flat=True)
        )
        lock_active_project_members(workspace_slug=slug, project_id=project_id)
        project_member = ProjectMember.objects.get(pk=target_membership.pk, is_active=True)

        # Workspace role limits belong to the target; elevated authority belongs
        # to the requester. Keeping them separate prevents a target admin from
        # accidentally granting edit privileges to an ordinary project member.
        target_workspace_role = WorkspaceMember.objects.get(
            workspace__slug=slug, member=project_member.member, is_active=True
        ).role
        requesting_workspace_role = WorkspaceMember.objects.get(
            workspace__slug=slug, member=request.user, is_active=True
        ).role
        is_requesting_workspace_admin = requesting_workspace_role == ROLE.ADMIN.value

        if request.user.id == project_member.member_id and not is_requesting_workspace_admin:
            return Response(
                {"error": "You cannot update your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Check while updating user roles
        requested_project_member = ProjectMember.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).first()
        if requested_project_member is None:
            return Response({"error": "Project membership is no longer active"}, status=status.HTTP_403_FORBIDDEN)

        if "role" in request.data and target_workspace_role == ROLE.ADMIN.value and new_role < ROLE.ADMIN.value:
            return Response(
                {"error": "You cannot add a workspace admin with a lower project role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if "role" in request.data and new_role > requested_project_member.role and not is_requesting_workspace_admin:
            return Response(
                {"error": "You cannot update a role that is higher than your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            "role" in request.data
            and project_member.role == ROLE.ADMIN.value
            and new_role != ROLE.ADMIN.value
            and not ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                role=ROLE.ADMIN.value,
                is_active=True,
            )
            .exclude(pk=project_member.pk)
            .exists()
        ):
            return Response(
                {"error": "Promote another project admin before changing the final admin role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProjectMemberSerializer(project_member, data={"role": new_role}, partial=True)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    @transaction.atomic
    def destroy(self, request, slug, project_id, pk):
        lock_active_project_members(workspace_slug=slug, project_id=project_id)
        project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=pk,
            member__is_bot=False,
            is_active=True,
        ).first()
        if project_member is None:
            return Response({"error": "Project member not found"}, status=status.HTTP_404_NOT_FOUND)
        requesting_project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            project_id=project_id,
            is_active=True,
        ).first()
        if requesting_project_member is None:
            return Response({"error": "Project membership is no longer active"}, status=status.HTTP_403_FORBIDDEN)
        # User cannot remove himself
        if str(project_member.id) == str(requesting_project_member.id):
            return Response(
                {"error": "You cannot remove yourself from the workspace. Please use leave workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # User cannot deactivate higher role
        if requesting_project_member.role < project_member.role:
            return Response(
                {"error": "You cannot remove a user having role higher than you"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    @transaction.atomic
    def leave(self, request, slug, project_id):
        lock_active_project_members(workspace_slug=slug, project_id=project_id)
        project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        ).first()
        if project_member is None:
            return Response({"error": "Project membership is no longer active"}, status=status.HTTP_403_FORBIDDEN)

        # Check if the leaving user is the only admin of the project
        if (
            project_member.role == 20
            and not ProjectMember.objects.filter(
                workspace__slug=slug, project_id=project_id, role=20, is_active=True
            ).count()
            > 1
        ):
            return Response(
                {
                    "error": "You cannot leave the project as your the only admin of the project you will have to either delete the project or create an another admin"  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Deactivate the user
        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMemberUserEndpoint(BaseAPIView):
    def get(self, request, slug, project_id):
        project_member = ProjectMember.objects.get(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        )
        serializer = ProjectMemberSerializer(project_member)

        return Response(serializer.data, status=status.HTTP_200_OK)


class UserProjectRolesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]
    use_read_replica = True

    def get(self, request, slug):
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug,
            member_id=request.user.id,
            is_active=True,
            member__member_workspace__workspace__slug=slug,
            member__member_workspace__is_active=True,
        ).values("project_id", "role")

        project_members = {str(member["project_id"]): member["role"] for member in project_members}
        return Response(project_members, status=status.HTTP_200_OK)


class ProjectMemberPreferenceEndpoint(BaseAPIView):
    def get_queryset(self, slug, project_id, member_id):
        return ProjectMember.objects.get(
            project_id=project_id,
            member_id=member_id,
            workspace__slug=slug,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, member_id):
        project_member = self.get_queryset(slug, project_id, member_id)

        serializer = ProjectMemberPreferenceSerializer(project_member, {"preferences": request.data}, partial=True)

        if serializer.is_valid():
            serializer.save()

            return Response({"preferences": serializer.data["preferences"]}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, member_id):
        project_member = self.get_queryset(slug, project_id, member_id)

        serializer = ProjectMemberPreferenceSerializer(project_member)

        return Response(serializer.data, status=status.HTTP_200_OK)
