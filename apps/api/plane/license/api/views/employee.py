# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import (
    Profile,
    ProjectMember,
    ProjectMemberInvite,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.license.api.permissions import InstanceAdminPermission
from plane.license.api.serializers import (
    InstanceEmployeeCreateSerializer,
    InstanceEmployeeSerializer,
    InstanceEmployeeUpdateSerializer,
)
from plane.utils.internal_roles import ADMIN_ROLE

from .base import BaseAPIView


def _lock_project_memberships_for_deactivation(*, workspace, member_id):
    admin_project_ids = list(
        ProjectMember.objects.filter(
            workspace=workspace,
            member_id=member_id,
            role=ADMIN_ROLE,
            is_active=True,
        )
        .order_by("project_id")
        .values_list("project_id", flat=True)
    )

    locked_memberships = list(
        ProjectMember.objects.select_for_update()
        .filter(workspace=workspace, is_active=True)
        .filter(Q(member_id=member_id) | Q(project_id__in=admin_project_ids))
        .order_by("project_id", "id")
        .values("project_id", "member_id", "role")
    )

    projects_with_other_admins = {
        membership["project_id"]
        for membership in locked_memberships
        if membership["role"] == ADMIN_ROLE and membership["member_id"] != member_id
    }
    return bool(set(admin_project_ids) - projects_with_other_admins)


class InstanceWorkspaceEmployeeEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    @staticmethod
    def _conflict_response(workspace, email):
        existing_user = User.objects.filter(email__iexact=email).first()
        if (
            existing_user
            and WorkspaceMember.objects.filter(
                workspace=workspace,
                member=existing_user,
                is_active=True,
            ).exists()
        ):
            return Response(
                {
                    "code": "ACTIVE_MEMBER_EXISTS",
                    "error": "An active employee with this email already belongs to the workspace.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if existing_user:
            return Response(
                {
                    "code": "USER_ALREADY_EXISTS",
                    "error": "A user with this email already exists. The existing password was not changed.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "code": "EMPLOYEE_CREATION_CONFLICT",
                "error": "The employee could not be created because the data changed concurrently.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    def get(self, request, workspace_id):
        workspace = get_object_or_404(Workspace.objects, pk=workspace_id)
        employees = (
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member__is_active=True,
                member__is_bot=False,
            )
            .select_related("member")
            .order_by("-is_active", "member__display_name", "member__email")
        )
        return Response(InstanceEmployeeSerializer(employees, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, workspace_id):
        workspace = get_object_or_404(Workspace.objects, pk=workspace_id)
        serializer = InstanceEmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        display_name = serializer.validated_data["display_name"]
        initial_password = serializer.validated_data["initial_password"]
        role = serializer.validated_data["role"]

        existing_user = User.objects.filter(email__iexact=email).first()
        if existing_user:
            return self._conflict_response(workspace=workspace, email=email)

        try:
            with transaction.atomic():
                # Recheck inside the transaction to narrow the duplicate-email race window.
                if User.objects.select_for_update().filter(email__iexact=email).exists():
                    return self._conflict_response(workspace=workspace, email=email)

                WorkspaceMemberInvite.objects.filter(workspace=workspace, email__iexact=email).delete()
                ProjectMemberInvite.objects.filter(workspace=workspace, email__iexact=email).delete()

                user = User(
                    username=uuid.uuid4().hex,
                    email=email,
                    display_name=display_name,
                    is_active=True,
                    is_password_autoset=False,
                )
                user.set_password(initial_password)
                user.save()

                Profile.objects.create(
                    user=user,
                    is_onboarded=True,
                    onboarding_step={
                        "profile_complete": True,
                        "workspace_create": True,
                        "workspace_invite": True,
                        "workspace_join": True,
                    },
                    last_workspace_id=workspace.id,
                )

                employee = WorkspaceMember(
                    workspace=workspace,
                    member=user,
                    role=role,
                    is_active=True,
                )
                employee.save(created_by_id=request.user.id)
        except IntegrityError:
            return self._conflict_response(workspace=workspace, email=email)

        return Response(InstanceEmployeeSerializer(employee).data, status=status.HTTP_201_CREATED)


class InstanceWorkspaceEmployeeDetailEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def patch(self, request, workspace_id, pk):
        serializer = InstanceEmployeeUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            # The workspace row is the stable mutex for all employee lifecycle updates.
            # Lock it before the membership rows so concurrent admin demotions serialize.
            workspace = get_object_or_404(Workspace.objects.select_for_update(), pk=workspace_id)
            employee = get_object_or_404(
                WorkspaceMember.objects.select_for_update().select_related("member"),
                pk=pk,
                workspace=workspace,
                member__is_active=True,
                member__is_bot=False,
            )

            target_role = serializer.validated_data.get("role", employee.role)
            target_is_active = serializer.validated_data.get("is_active", employee.is_active)

            if employee.member_id == workspace.owner_id and (target_role != ADMIN_ROLE or target_is_active is False):
                return Response(
                    {
                        "code": "WORKSPACE_OWNER_PROTECTED",
                        "error": "The workspace owner cannot be downgraded or deactivated.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            removes_active_admin = (
                employee.is_active
                and employee.role == ADMIN_ROLE
                and (target_role != ADMIN_ROLE or target_is_active is False)
            )
            if removes_active_admin:
                active_admin_ids = list(
                    WorkspaceMember.objects.select_for_update()
                    .filter(
                        workspace=workspace,
                        role=ADMIN_ROLE,
                        is_active=True,
                        member__is_active=True,
                        member__is_bot=False,
                    )
                    .order_by("id")
                    .values_list("id", flat=True)
                )
                if len(active_admin_ids) <= 1:
                    return Response(
                        {
                            "code": "LAST_WORKSPACE_ADMIN",
                            "error": "Promote another active workspace admin before changing this employee.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

            deactivates_workspace_membership = employee.is_active and target_is_active is False
            if deactivates_workspace_membership:
                if _lock_project_memberships_for_deactivation(
                    workspace=workspace,
                    member_id=employee.member_id,
                ):
                    return Response(
                        {
                            "code": "LAST_PROJECT_ADMIN",
                            "error": "Promote another active admin in every project before deactivating this employee.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                ProjectMember.objects.filter(
                    workspace=workspace,
                    member_id=employee.member_id,
                    is_active=True,
                ).update(
                    is_active=False,
                    updated_at=timezone.now(),
                    updated_by_id=request.user.id,
                )

                # Retire every invitation that could otherwise be replayed to
                # restore access outside the administrator-controlled flow.
                WorkspaceMemberInvite.objects.filter(
                    workspace=workspace,
                    email__iexact=employee.member.email,
                ).delete()
                ProjectMemberInvite.objects.filter(
                    workspace=workspace,
                    email__iexact=employee.member.email,
                ).delete()

            employee.role = target_role
            employee.is_active = target_is_active
            employee.updated_by_id = request.user.id
            employee.save(
                disable_auto_set_user=True,
                update_fields=["role", "is_active", "updated_by", "updated_at"],
            )

        return Response(InstanceEmployeeSerializer(employee).data, status=status.HTTP_200_OK)
