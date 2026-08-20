# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from django.db import transaction
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import (
    extend_schema,
    OpenApiResponse,
    OpenApiRequest,
)

# Module imports
from .base import BaseAPIView
from plane.api.serializers import UserLiteSerializer, ProjectMemberSerializer
from plane.db.models import Project, ProjectMember, User, Workspace, WorkspaceMember
from plane.utils.permissions import ProjectMemberPermission, WorkSpaceAdminPermission, ProjectAdminPermission
from plane.utils.internal_roles import ADMIN_ROLE, MEMBER_ROLE
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    PROJECT_ID_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
    PROJECT_NOT_FOUND_RESPONSE,
    WORKSPACE_MEMBER_EXAMPLE,
    PROJECT_MEMBER_EXAMPLE,
)


class WorkspaceMemberAPIEndpoint(BaseAPIView):
    permission_classes = [WorkSpaceAdminPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="get_workspace_members",
        summary="List workspace members",
        description="Retrieve all users who are members of the specified workspace.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(
                description="List of workspace members with their roles",
                response={
                    "type": "array",
                    "items": {
                        "allOf": [
                            {"$ref": "#/components/schemas/UserLite"},
                            {
                                "type": "object",
                                "properties": {
                                    "role": {
                                        "type": "integer",
                                        "description": "Member role in the workspace",
                                    }
                                },
                            },
                        ]
                    },
                },
                examples=[WORKSPACE_MEMBER_EXAMPLE],
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    # Get all the users that are present inside the workspace
    def get(self, request, slug):
        """List workspace members

        Retrieve all users who are members of the specified workspace.
        Returns user profiles with their respective workspace roles and permissions.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_members = WorkspaceMember.objects.filter(workspace__slug=slug).select_related("member")

        # Get all the users with their roles
        users_with_roles = []
        for workspace_member in workspace_members:
            user_data = UserLiteSerializer(workspace_member.member).data
            user_data["role"] = workspace_member.role
            users_with_roles.append(user_data)

        return Response(users_with_roles, status=status.HTTP_200_OK)


class ProjectMemberListCreateAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectMemberPermission]
    use_read_replica = True

    def get_permissions(self):
        if self.request.method == "GET":
            return [ProjectMemberPermission()]
        return [ProjectAdminPermission()]

    @extend_schema(
        operation_id="get_project_members",
        summary="List project members",
        description="Retrieve all users who are members of the specified project.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            200: OpenApiResponse(
                description="List of project members with their roles",
                response=UserLiteSerializer,
                examples=[PROJECT_MEMBER_EXAMPLE],
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    # Get all the users that are present inside the workspace
    def get(self, request, slug, project_id):
        """List project members

        Retrieve all users who are members of the specified project.
        Returns user profiles with their project-specific roles and access levels.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace members that are present inside the workspace
        project_members = ProjectMember.objects.filter(project_id=project_id, workspace__slug=slug).values_list(
            "member_id", flat=True
        )

        # Get all the users that are present inside the workspace
        users = UserLiteSerializer(User.objects.filter(id__in=project_members), many=True).data
        return Response(users, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="create_project_member",
        summary="Create project member",
        description="Create a new project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={201: OpenApiResponse(description="Project member created", response=ProjectMemberSerializer)},
        request=OpenApiRequest(request=ProjectMemberSerializer),
    )
    @transaction.atomic
    def post(self, request, slug, project_id):
        workspace = Workspace.objects.select_for_update().get(slug=slug)
        project = Project.objects.select_for_update().get(id=project_id, workspace=workspace)
        serializer = ProjectMemberSerializer(data=request.data, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        target_member = serializer.validated_data["member"]
        requested_role = serializer.validated_data.get("role", MEMBER_ROLE)

        locked_workspace_members = list(
            WorkspaceMember.objects.select_for_update()
            .filter(
                workspace_id=project.workspace_id,
                member_id__in=[request.user.id, target_member.id],
                is_active=True,
            )
            .order_by("id")
        )
        workspace_members = {
            workspace_member.member_id: workspace_member for workspace_member in locked_workspace_members
        }
        requesting_workspace_member = workspace_members.get(request.user.id)
        target_workspace_member = workspace_members.get(target_member.id)
        if requesting_workspace_member is None:
            return Response(
                {"error": "Active workspace membership is required"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if target_workspace_member is None:
            return Response(
                {"error": "The project member must be an active workspace member"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        locked_project_members = list(ProjectMember.objects.select_for_update().filter(project=project).order_by("id"))
        project_members = {
            project_member.member_id: project_member
            for project_member in locked_project_members
            if project_member.member_id is not None
        }
        requesting_project_member = project_members.get(request.user.id)
        if (
            requesting_project_member is None
            or not requesting_project_member.is_active
            or requesting_project_member.role != ADMIN_ROLE
        ):
            return Response(
                {"error": "Project admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target_workspace_member.role == ADMIN_ROLE and requested_role != ADMIN_ROLE:
            return Response(
                {"error": "A workspace admin must be a project admin"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_member = project_members.get(target_member.id)
        if project_member is None:
            project_member = serializer.save(project=project, role=requested_role)
        else:
            project_member.role = max(project_member.role, requested_role)
            project_member.is_active = True
            project_member.save()

        return Response(ProjectMemberSerializer(project_member).data, status=status.HTTP_201_CREATED)


# API endpoint to get and update a project member
class ProjectMemberDetailAPIEndpoint(ProjectMemberListCreateAPIEndpoint):
    @staticmethod
    def _locked_project_members(request, slug, project_id):
        workspace = Workspace.objects.select_for_update().get(slug=slug)
        project = Project.objects.select_for_update().get(id=project_id, workspace=workspace)
        workspace_members = {
            workspace_member.member_id: workspace_member
            for workspace_member in WorkspaceMember.objects.select_for_update()
            .filter(workspace=workspace)
            .order_by("id")
        }
        requesting_workspace_member = workspace_members.get(request.user.id)
        if requesting_workspace_member is not None and not requesting_workspace_member.is_active:
            requesting_workspace_member = None
        project_members = list(
            ProjectMember.objects.select_for_update().filter(project=project, workspace=workspace).order_by("id")
        )
        requesting_project_member = next(
            (
                project_member
                for project_member in project_members
                if project_member.member_id == request.user.id
                and project_member.is_active
                and project_member.role == ADMIN_ROLE
            ),
            None,
        )
        return workspace_members, requesting_workspace_member, requesting_project_member, project_members

    @staticmethod
    def _is_last_active_admin(project_members, target):
        return (
            target.is_active
            and target.role == ADMIN_ROLE
            and not any(
                project_member.id != target.id and project_member.is_active and project_member.role == ADMIN_ROLE
                for project_member in project_members
            )
        )

    @staticmethod
    def _admin_conflict_response():
        return Response(
            {
                "code": "LAST_PROJECT_ADMIN",
                "error": "Promote another active project admin before changing this member.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    @extend_schema(
        operation_id="get_project_member",
        summary="Get project member",
        description="Retrieve a project member by ID.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            200: OpenApiResponse(description="Project member", response=ProjectMemberSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    # Get a project member by ID
    def get(self, request, slug, project_id, pk):
        """Get project member

        Retrieve a project member by ID.
        Returns a project member with their project-specific roles and access levels.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace members that are present inside the workspace
        project_members = ProjectMember.objects.get(project_id=project_id, workspace__slug=slug, pk=pk)
        user = User.objects.get(id=project_members.member_id)
        user = UserLiteSerializer(user).data
        return Response(user, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_project_member",
        summary="Update project member",
        description="Update a project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={200: OpenApiResponse(description="Project member updated", response=ProjectMemberSerializer)},
        request=OpenApiRequest(request=ProjectMemberSerializer),
    )
    @transaction.atomic
    def patch(self, request, slug, project_id, pk):
        if "role" not in request.data or set(request.data) - {"role"}:
            return Response(
                {"error": "Only the project member role can be updated"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_members, requesting_workspace_member, requesting_project_member, project_members = (
            self._locked_project_members(
                request=request,
                slug=slug,
                project_id=project_id,
            )
        )
        if requesting_workspace_member is None or requesting_project_member is None:
            return Response(
                {"error": "Project admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )
        project_member = next((member for member in project_members if member.id == pk), None)
        if project_member is None:
            raise ProjectMember.DoesNotExist

        serializer = ProjectMemberSerializer(project_member, data=request.data, partial=True, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        target_role = serializer.validated_data.get("role", project_member.role)
        target_workspace_member = workspace_members.get(project_member.member_id)
        if target_workspace_member is None or not target_workspace_member.is_active:
            return Response(
                {"error": "The project member must be an active workspace member"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_workspace_member.role == ADMIN_ROLE and target_role != ADMIN_ROLE:
            return Response(
                {"error": "A workspace admin must remain a project admin"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_role != ADMIN_ROLE and self._is_last_active_admin(project_members, project_member):
            return self._admin_conflict_response()

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="delete_project_member",
        summary="Delete project member",
        description="Delete a project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={204: OpenApiResponse(description="Project member deleted")},
    )
    @transaction.atomic
    def delete(self, request, slug, project_id, pk):
        _, requesting_workspace_member, requesting_project_member, project_members = self._locked_project_members(
            request=request, slug=slug, project_id=project_id
        )
        if requesting_workspace_member is None or requesting_project_member is None:
            return Response(
                {"error": "Project admin permission is no longer active"},
                status=status.HTTP_403_FORBIDDEN,
            )
        project_member = next((member for member in project_members if member.id == pk), None)
        if project_member is None:
            raise ProjectMember.DoesNotExist
        if self._is_last_active_admin(project_members, project_member):
            return self._admin_conflict_response()

        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
