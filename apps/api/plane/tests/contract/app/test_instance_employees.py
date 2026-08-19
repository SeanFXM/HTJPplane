# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import uuid
from unittest.mock import patch

import pytest

# Django imports
from django.db import IntegrityError, close_old_connections
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.test import APIClient

# Module imports
from plane.db.models import (
    Profile,
    Project,
    ProjectMember,
    ProjectMemberInvite,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.license.models import Instance, InstanceAdmin


@pytest.mark.contract
@pytest.mark.django_db
class TestInstanceEmployees:
    @pytest.fixture
    def instance(self):
        return Instance.objects.create(
            instance_name="Hotone Japan",
            instance_id=uuid.uuid4().hex,
            current_version="test",
            last_checked_at=timezone.now(),
            is_setup_done=True,
        )

    @pytest.fixture
    def instance_admin_client(self, api_client, create_user, instance):
        InstanceAdmin.objects.create(instance=instance, user=create_user, role=20)
        api_client.force_authenticate(user=create_user)
        return api_client

    def test_instance_admin_creates_onboarded_employee_and_get_lists_active_members(
        self,
        instance_admin_client,
        workspace,
    ):
        url = f"/api/instances/workspaces/{workspace.id}/employees/"
        pending_project = Project.objects.create(
            name="Pending employee invite",
            identifier="PEI",
            workspace=workspace,
        )
        workspace_invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email="employee@example.com",
            token="pending-employee-workspace-token",
            role=20,
        )
        project_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=pending_project,
            email="employee@example.com",
            token="pending-employee-project-token",
            role=20,
        )
        response = instance_admin_client.post(
            url,
            {
                "display_name": "  Hotone Employee  ",
                "email": "EMPLOYEE@EXAMPLE.COM",
                "initial_password": "Internal password 2026!",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert set(response.data) == {
            "id",
            "display_name",
            "email",
            "role",
            "is_active",
            "created_at",
        }
        assert response.data["display_name"] == "Hotone Employee"
        assert response.data["email"] == "employee@example.com"
        assert response.data["role"] == 15
        assert response.data["is_active"] is True

        employee_user = User.objects.get(email="employee@example.com")
        assert employee_user.password != "Internal password 2026!"
        assert employee_user.check_password("Internal password 2026!") is True
        assert employee_user.is_password_autoset is False

        profile = Profile.objects.get(user=employee_user)
        assert profile.is_onboarded is True
        assert profile.last_workspace_id == workspace.id
        assert profile.onboarding_step == {
            "profile_complete": True,
            "workspace_create": True,
            "workspace_invite": True,
            "workspace_join": True,
        }

        membership = WorkspaceMember.objects.get(workspace=workspace, member=employee_user)
        assert str(membership.id) == str(response.data["id"])
        assert membership.role == 15
        assert membership.created_by_id == workspace.owner_id
        assert not InstanceAdmin.objects.filter(user=employee_user).exists()
        assert not WorkspaceMemberInvite.objects.filter(id=workspace_invitation.id).exists()
        assert not ProjectMemberInvite.objects.filter(id=project_invitation.id).exists()

        list_response = instance_admin_client.get(url)
        assert list_response.status_code == status.HTTP_200_OK
        assert isinstance(list_response.data, list)
        listed_employee = next(item for item in list_response.data if item["email"] == "employee@example.com")
        assert listed_employee == response.data

    @pytest.mark.parametrize("role", [15, 20])
    def test_supported_workspace_roles_are_created(
        self,
        instance_admin_client,
        workspace,
        role,
    ):
        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": f"Role {role}",
                "email": f"role-{role}@example.com",
                "initial_password": "Internal password 2026!",
                "role": role,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == role
        employee_user = User.objects.get(email=f"role-{role}@example.com")
        assert not InstanceAdmin.objects.filter(user=employee_user).exists()

    @pytest.mark.parametrize("role", [5, 10, 19, 21, "not-a-role"])
    def test_retired_or_unknown_workspace_roles_are_rejected(
        self,
        instance_admin_client,
        workspace,
        role,
    ):
        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Invalid role",
                "email": f"invalid-{role}@example.com",
                "initial_password": "Internal password 2026!",
                "role": role,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not User.objects.filter(email=f"invalid-{role}@example.com").exists()

    def test_blank_initial_password_is_rejected(self, instance_admin_client, workspace):
        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Blank password",
                "email": "blank-password@example.com",
                "initial_password": "   ",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not User.objects.filter(email="blank-password@example.com").exists()

    def test_short_initial_password_is_rejected(self, instance_admin_client, workspace):
        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Short password",
                "email": "short-password@example.com",
                "initial_password": "1234567",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not User.objects.filter(email="short-password@example.com").exists()

    def test_non_instance_admin_is_forbidden(self, api_client, instance, workspace):
        regular_user = User.objects.create_user(
            username="regular-user",
            email="regular-user@example.com",
            password="Existing password 2026!",
        )
        api_client.force_authenticate(user=regular_user)

        response = api_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Forbidden employee",
                "email": "forbidden@example.com",
                "initial_password": "Internal password 2026!",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not User.objects.filter(email="forbidden@example.com").exists()

    def test_instance_admin_without_workspace_membership_can_create_employee(
        self,
        api_client,
        instance,
        workspace,
    ):
        secondary_admin = User.objects.create_user(
            username="secondary-instance-admin",
            email="secondary-instance-admin@example.com",
            password="Existing password 2026!",
        )
        InstanceAdmin.objects.create(instance=instance, user=secondary_admin, role=20)
        api_client.force_authenticate(user=secondary_admin)

        response = api_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Created by secondary admin",
                "email": "secondary-created@example.com",
                "initial_password": "Internal password 2026!",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        membership = WorkspaceMember.objects.get(member__email="secondary-created@example.com")
        assert membership.workspace_id == workspace.id
        assert membership.created_by_id == secondary_admin.id

    def test_anonymous_user_is_unauthorized(self, api_client, instance, workspace):
        response = api_client.get(f"/api/instances/workspaces/{workspace.id}/employees/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_workspace_returns_404(self, instance_admin_client):
        url = f"/api/instances/workspaces/{uuid.uuid4()}/employees/"
        get_response = instance_admin_client.get(url)
        post_response = instance_admin_client.post(
            url,
            {
                "display_name": "Missing workspace",
                "email": "missing-workspace@example.com",
                "initial_password": "Internal password 2026!",
            },
            format="json",
        )

        assert get_response.status_code == status.HTTP_404_NOT_FOUND
        assert post_response.status_code == status.HTTP_404_NOT_FOUND
        assert not User.objects.filter(email="missing-workspace@example.com").exists()

    def test_get_includes_inactive_memberships_but_omits_bots_and_inactive_users(
        self,
        instance_admin_client,
        workspace,
    ):
        inactive_user = User.objects.create_user(
            username="inactive-employee",
            email="inactive-employee@example.com",
            password="Existing password 2026!",
        )
        bot_user = User.objects.create_user(
            username="employee-bot",
            email="employee-bot@example.com",
            password="Existing password 2026!",
            is_bot=True,
        )
        inactive_account = User.objects.create_user(
            username="inactive-account",
            email="inactive-account@example.com",
            password="Existing password 2026!",
            is_active=False,
        )
        WorkspaceMember.objects.create(workspace=workspace, member=inactive_user, role=15, is_active=False)
        WorkspaceMember.objects.create(workspace=workspace, member=bot_user, role=15, is_active=True)
        WorkspaceMember.objects.create(workspace=workspace, member=inactive_account, role=15, is_active=True)

        response = instance_admin_client.get(f"/api/instances/workspaces/{workspace.id}/employees/")

        assert response.status_code == status.HTTP_200_OK
        employees_by_email = {employee["email"]: employee for employee in response.data}
        assert employees_by_email["inactive-employee@example.com"]["is_active"] is False
        assert "employee-bot@example.com" not in employees_by_email
        assert "inactive-account@example.com" not in employees_by_email

    def test_patch_updates_role_and_membership_lifecycle(
        self,
        instance_admin_client,
        workspace,
    ):
        employee_user = User.objects.create_user(
            username="managed-employee",
            email="managed-employee@example.com",
            password="Existing password 2026!",
        )
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee_user,
            role=15,
            is_active=True,
        )
        detail_url = f"/api/instances/workspaces/{workspace.id}/employees/{membership.id}/"

        promote_response = instance_admin_client.patch(detail_url, {"role": 20}, format="json")
        deactivate_response = instance_admin_client.patch(detail_url, {"is_active": False}, format="json")

        assert promote_response.status_code == status.HTTP_200_OK
        assert promote_response.data["role"] == 20
        assert deactivate_response.status_code == status.HTTP_200_OK
        assert deactivate_response.data["is_active"] is False
        assert set(deactivate_response.data) == {
            "id",
            "display_name",
            "email",
            "role",
            "is_active",
            "created_at",
        }

        list_response = instance_admin_client.get(f"/api/instances/workspaces/{workspace.id}/employees/")
        listed_employee = next(item for item in list_response.data if str(item["id"]) == str(membership.id))
        assert listed_employee["is_active"] is False

        reactivate_response = instance_admin_client.patch(detail_url, {"is_active": True}, format="json")
        assert reactivate_response.status_code == status.HTTP_200_OK
        assert reactivate_response.data["is_active"] is True
        membership.refresh_from_db()
        assert membership.role == 20
        assert membership.is_active is True
        assert membership.updated_by_id == workspace.owner_id

    def test_deactivation_cascades_to_all_project_memberships_without_restoring_them(
        self,
        instance_admin_client,
        workspace,
    ):
        employee_user = User.objects.create_user(
            username="project-access-employee",
            email="project-access-employee@example.com",
            password="Existing password 2026!",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee_user,
            role=15,
            is_active=True,
        )
        member_project = Project.objects.create(
            name="Employee member project",
            identifier="EMPM",
            workspace=workspace,
            network=0,
        )
        admin_project = Project.objects.create(
            name="Employee admin project",
            identifier="EMPA",
            workspace=workspace,
            network=0,
        )
        ProjectMember.objects.create(
            project=member_project,
            member=workspace.owner,
            role=20,
            is_active=True,
        )
        member_project_membership = ProjectMember.objects.create(
            project=member_project,
            member=employee_user,
            role=15,
            is_active=True,
        )
        ProjectMember.objects.create(
            project=admin_project,
            member=workspace.owner,
            role=20,
            is_active=True,
        )
        admin_project_membership = ProjectMember.objects.create(
            project=admin_project,
            member=employee_user,
            role=20,
            is_active=True,
        )
        workspace_invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email=employee_user.email,
            token="deactivated-workspace-token",
            role=15,
        )
        project_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=member_project,
            email=employee_user.email,
            token="deactivated-project-token",
            role=15,
        )
        detail_url = f"/api/instances/workspaces/{workspace.id}/employees/{workspace_membership.id}/"

        deactivate_response = instance_admin_client.patch(detail_url, {"is_active": False}, format="json")

        assert deactivate_response.status_code == status.HTTP_200_OK
        member_project_membership.refresh_from_db()
        admin_project_membership.refresh_from_db()
        assert member_project_membership.is_active is False
        assert admin_project_membership.is_active is False
        assert member_project_membership.updated_by_id == workspace.owner_id
        assert admin_project_membership.updated_by_id == workspace.owner_id
        assert not WorkspaceMemberInvite.objects.filter(id=workspace_invitation.id).exists()
        assert not ProjectMemberInvite.objects.filter(id=project_invitation.id).exists()

        reactivate_response = instance_admin_client.patch(detail_url, {"is_active": True}, format="json")
        assert reactivate_response.status_code == status.HTTP_200_OK
        member_project_membership.refresh_from_db()
        admin_project_membership.refresh_from_db()
        assert member_project_membership.is_active is False
        assert admin_project_membership.is_active is False

        employee_client = APIClient()
        employee_client.force_authenticate(user=employee_user)
        project_response = employee_client.get(f"/api/workspaces/{workspace.slug}/projects/{member_project.id}/")
        assert project_response.status_code == status.HTTP_403_FORBIDDEN

    def test_last_project_admin_blocks_workspace_deactivation_atomically(
        self,
        instance_admin_client,
        workspace,
    ):
        employee_user = User.objects.create_user(
            username="last-project-admin",
            email="last-project-admin@example.com",
            password="Existing password 2026!",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee_user,
            role=15,
            is_active=True,
        )
        protected_project = Project.objects.create(
            name="Protected project",
            identifier="PROT",
            workspace=workspace,
        )
        safe_project = Project.objects.create(
            name="Safe project",
            identifier="SAFE",
            workspace=workspace,
        )
        protected_project_membership = ProjectMember.objects.create(
            project=protected_project,
            member=employee_user,
            role=20,
            is_active=True,
        )
        safe_project_membership = ProjectMember.objects.create(
            project=safe_project,
            member=employee_user,
            role=15,
            is_active=True,
        )

        response = instance_admin_client.patch(
            f"/api/instances/workspaces/{workspace.id}/employees/{workspace_membership.id}/",
            {"is_active": False},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "LAST_PROJECT_ADMIN"
        workspace_membership.refresh_from_db()
        protected_project_membership.refresh_from_db()
        safe_project_membership.refresh_from_db()
        assert workspace_membership.is_active is True
        assert protected_project_membership.is_active is True
        assert safe_project_membership.is_active is True

    def test_workspace_owner_cannot_be_downgraded_or_deactivated(
        self,
        instance_admin_client,
        workspace,
    ):
        owner_membership = WorkspaceMember.objects.get(workspace=workspace, member=workspace.owner)
        detail_url = f"/api/instances/workspaces/{workspace.id}/employees/{owner_membership.id}/"

        downgrade_response = instance_admin_client.patch(detail_url, {"role": 15}, format="json")
        deactivate_response = instance_admin_client.patch(detail_url, {"is_active": False}, format="json")

        assert downgrade_response.status_code == status.HTTP_409_CONFLICT
        assert downgrade_response.data["code"] == "WORKSPACE_OWNER_PROTECTED"
        assert deactivate_response.status_code == status.HTTP_409_CONFLICT
        assert deactivate_response.data["code"] == "WORKSPACE_OWNER_PROTECTED"
        owner_membership.refresh_from_db()
        assert owner_membership.role == 20
        assert owner_membership.is_active is True

    @pytest.mark.parametrize("payload", [{"role": 15}, {"is_active": False}])
    def test_last_active_workspace_admin_cannot_be_downgraded_or_deactivated(
        self,
        instance_admin_client,
        workspace,
        payload,
    ):
        WorkspaceMember.objects.filter(workspace=workspace, member=workspace.owner).update(is_active=False)
        final_admin = User.objects.create_user(
            username=f"final-admin-{next(iter(payload))}",
            email=f"final-admin-{next(iter(payload))}@example.com",
            password="Existing password 2026!",
        )
        final_admin_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=final_admin,
            role=20,
            is_active=True,
        )

        response = instance_admin_client.patch(
            f"/api/instances/workspaces/{workspace.id}/employees/{final_admin_membership.id}/",
            payload,
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "LAST_WORKSPACE_ADMIN"
        final_admin_membership.refresh_from_db()
        assert final_admin_membership.role == 20
        assert final_admin_membership.is_active is True

    def test_patch_rejects_retired_role_non_boolean_and_extra_fields(
        self,
        instance_admin_client,
        workspace,
    ):
        employee_user = User.objects.create_user(
            username="invalid-update-employee",
            email="invalid-update-employee@example.com",
            password="Existing password 2026!",
        )
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee_user,
            role=15,
            is_active=True,
        )
        detail_url = f"/api/instances/workspaces/{workspace.id}/employees/{membership.id}/"

        retired_role_response = instance_admin_client.patch(detail_url, {"role": 5}, format="json")
        non_boolean_response = instance_admin_client.patch(detail_url, {"is_active": "false"}, format="json")
        extra_field_response = instance_admin_client.patch(
            detail_url,
            {"role": 20, "display_name": "Not allowed"},
            format="json",
        )

        assert retired_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert non_boolean_response.status_code == status.HTTP_400_BAD_REQUEST
        assert extra_field_response.status_code == status.HTTP_400_BAD_REQUEST
        membership.refresh_from_db()
        assert membership.role == 15
        assert membership.is_active is True

    def test_patch_membership_from_another_workspace_returns_404(
        self,
        instance_admin_client,
        workspace,
    ):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            slug="other-workspace-employees",
            owner=workspace.owner,
        )
        other_user = User.objects.create_user(
            username="other-workspace-employee",
            email="other-workspace-employee@example.com",
            password="Existing password 2026!",
        )
        other_membership = WorkspaceMember.objects.create(
            workspace=other_workspace,
            member=other_user,
            role=15,
            is_active=True,
        )

        response = instance_admin_client.patch(
            f"/api/instances/workspaces/{workspace.id}/employees/{other_membership.id}/",
            {"role": 20},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        other_membership.refresh_from_db()
        assert other_membership.role == 15

    def test_non_instance_admin_cannot_patch_employee(self, api_client, instance, workspace):
        regular_user = User.objects.create_user(
            username="regular-employee-editor",
            email="regular-employee-editor@example.com",
            password="Existing password 2026!",
        )
        employee_user = User.objects.create_user(
            username="protected-employee",
            email="protected-employee@example.com",
            password="Existing password 2026!",
        )
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee_user,
            role=15,
            is_active=True,
        )
        api_client.force_authenticate(user=regular_user)

        response = api_client.patch(
            f"/api/instances/workspaces/{workspace.id}/employees/{membership.id}/",
            {"role": 20},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        membership.refresh_from_db()
        assert membership.role == 15

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_downgrades_preserve_one_active_workspace_admin(
        self,
        instance_admin_client,
        workspace,
        create_user,
    ):
        WorkspaceMember.objects.filter(workspace=workspace, member=workspace.owner).update(is_active=False)
        first_admin = User.objects.create_user(
            username="employee-api-first-admin",
            email="employee-api-first-admin@example.com",
            password="Existing password 2026!",
        )
        second_admin = User.objects.create_user(
            username="employee-api-second-admin",
            email="employee-api-second-admin@example.com",
            password="Existing password 2026!",
        )
        first_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=first_admin,
            role=20,
            is_active=True,
        )
        second_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=second_admin,
            role=20,
            is_active=True,
        )
        ready = Barrier(2)

        def downgrade_employee(membership_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=create_user)
                ready.wait(timeout=10)
                response = client.patch(
                    f"/api/instances/workspaces/{workspace.id}/employees/{membership_id}/",
                    {"role": 15},
                    format="json",
                )
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(downgrade_employee, [first_membership.id, second_membership.id]))

        assert sorted(results) == [status.HTTP_200_OK, status.HTTP_409_CONFLICT]
        assert (
            WorkspaceMember.objects.filter(
                workspace=workspace,
                role=20,
                is_active=True,
            ).count()
            == 1
        )

    def test_existing_user_conflict_does_not_overwrite_password(
        self,
        instance_admin_client,
        workspace,
    ):
        existing_user = User.objects.create_user(
            username="existing-user",
            email="existing-user@example.com",
            password="Original password 2026!",
        )
        original_password_hash = existing_user.password

        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Existing user",
                "email": "EXISTING-USER@EXAMPLE.COM",
                "initial_password": "Replacement password 2026!",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "USER_ALREADY_EXISTS"
        existing_user.refresh_from_db()
        assert existing_user.password == original_password_hash
        assert existing_user.check_password("Original password 2026!") is True
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=existing_user).exists()

    def test_active_member_conflict_has_explicit_code(
        self,
        instance_admin_client,
        workspace,
    ):
        existing_member = User.objects.create_user(
            username="existing-member",
            email="existing-member@example.com",
            password="Original password 2026!",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=existing_member, role=15, is_active=True)
        original_password_hash = existing_member.password

        response = instance_admin_client.post(
            f"/api/instances/workspaces/{workspace.id}/employees/",
            {
                "display_name": "Existing member",
                "email": "existing-member@example.com",
                "initial_password": "Replacement password 2026!",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "ACTIVE_MEMBER_EXISTS"
        existing_member.refresh_from_db()
        assert existing_member.password == original_password_hash

    def test_employee_creation_is_atomic_when_membership_insert_fails(
        self,
        instance_admin_client,
        workspace,
    ):
        email = "atomic-rollback@example.com"

        with patch(
            "plane.license.api.views.employee.WorkspaceMember.save",
            side_effect=IntegrityError("forced membership failure"),
        ):
            response = instance_admin_client.post(
                f"/api/instances/workspaces/{workspace.id}/employees/",
                {
                    "display_name": "Atomic rollback",
                    "email": email,
                    "initial_password": "Internal password 2026!",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "EMPLOYEE_CREATION_CONFLICT"
        assert not User.objects.filter(email=email).exists()
        assert not Profile.objects.filter(user__email=email).exists()
