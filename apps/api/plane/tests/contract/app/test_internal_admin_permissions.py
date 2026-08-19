# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, State, User, WorkspaceMember


@pytest.mark.contract
class TestInternalAdminPermissions:
    @pytest.fixture
    def member(self, workspace):
        user = User.objects.create_user(email="member-permissions@example.com", username="member-permissions")
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
        return user

    @pytest.fixture
    def project(self, workspace, create_user, member):
        project = Project.objects.create(name="Permission Project", identifier="PERM", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
        return project

    @pytest.fixture
    def state(self, workspace, project):
        return State.objects.create(
            name="To do",
            color="#60646C",
            group="unstarted",
            default=True,
            workspace=workspace,
            project=project,
        )

    @pytest.mark.django_db
    def test_member_cannot_change_workspace_settings_or_invite_users(
        self,
        session_client,
        workspace,
        member,
    ):
        session_client.force_authenticate(user=member)

        update_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/",
            {"name": "Unauthorized change"},
            format="json",
        )
        invite_response = session_client.post(
            f"/api/workspaces/{workspace.slug}/invitations/",
            {"emails": [{"email": "new-user@example.com", "role": 15}]},
            format="json",
        )

        assert update_response.status_code == status.HTTP_403_FORBIDDEN
        assert invite_response.status_code == status.HTTP_403_FORBIDDEN
        workspace.refresh_from_db()
        assert workspace.name != "Unauthorized change"

    @pytest.mark.django_db
    def test_member_cannot_edit_project_workflow_states(
        self,
        session_client,
        workspace,
        project,
        state,
        member,
    ):
        session_client.force_authenticate(user=member)

        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/{state.id}/",
            {"name": "Unauthorized state"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        state.refresh_from_db()
        assert state.name == "To do"

    @pytest.mark.django_db
    def test_workspace_admin_cannot_remove_only_project_admin_when_other_members_exist(
        self,
        session_client,
        workspace,
        create_user,
        member,
    ):
        project_admin = User.objects.create_user(
            email="only-project-admin@example.com",
            username="only-project-admin",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=project_admin,
            role=15,
            is_active=True,
        )
        project = Project.objects.create(name="Admin continuity", identifier="CONT", workspace=workspace)
        ProjectMember.objects.create(project=project, member=project_admin, role=20, is_active=True)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)

        blocked_response = session_client.delete(f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/")

        assert blocked_response.status_code == status.HTTP_400_BAD_REQUEST
        workspace_membership.refresh_from_db()
        assert workspace_membership.is_active is True
        assert ProjectMember.objects.get(project=project, member=project_admin).is_active is True

        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        removed_response = session_client.delete(f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/")

        assert removed_response.status_code == status.HTTP_204_NO_CONTENT
        workspace_membership.refresh_from_db()
        assert workspace_membership.is_active is False
        assert ProjectMember.objects.get(project=project, member=project_admin).is_active is False

    @pytest.mark.django_db
    def test_member_cannot_leave_when_they_are_only_project_admin(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project_admin = User.objects.create_user(
            email="leaving-project-admin@example.com",
            username="leaving-project-admin",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=project_admin,
            role=15,
            is_active=True,
        )
        project = Project.objects.create(name="Leave continuity", identifier="LEAV", workspace=workspace)
        ProjectMember.objects.create(project=project, member=project_admin, role=20, is_active=True)
        ProjectMember.objects.create(project=project, member=create_user, role=15, is_active=True)
        session_client.force_authenticate(user=project_admin)

        response = session_client.post(f"/api/workspaces/{workspace.slug}/members/leave/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        workspace_membership.refresh_from_db()
        assert workspace_membership.is_active is True
        assert ProjectMember.objects.get(project=project, member=project_admin).is_active is True

    @pytest.mark.django_db
    def test_workspace_owner_cannot_be_downgraded_removed_or_leave(
        self,
        session_client,
        workspace,
        create_user,
    ):
        owner_membership = WorkspaceMember.objects.get(workspace=workspace, member=create_user)
        member_url = f"/api/workspaces/{workspace.slug}/members/{owner_membership.id}/"

        downgrade_response = session_client.patch(member_url, {"role": 15}, format="json")
        remove_response = session_client.delete(member_url)
        leave_response = session_client.post(f"/api/workspaces/{workspace.slug}/members/leave/")

        assert downgrade_response.status_code == status.HTTP_409_CONFLICT
        assert downgrade_response.data["code"] == "WORKSPACE_OWNER_PROTECTED"
        assert remove_response.status_code == status.HTTP_409_CONFLICT
        assert remove_response.data["code"] == "WORKSPACE_OWNER_PROTECTED"
        assert leave_response.status_code == status.HTTP_409_CONFLICT
        assert leave_response.data["code"] == "WORKSPACE_OWNER_PROTECTED"
        owner_membership.refresh_from_db()
        assert (owner_membership.role, owner_membership.is_active) == (20, True)

    @pytest.mark.django_db
    def test_regular_project_member_cannot_change_another_members_role(
        self,
        session_client,
        workspace,
        project,
        member,
    ):
        target = User.objects.create_user(email="role-target@example.com", username="role-target")
        WorkspaceMember.objects.create(workspace=workspace, member=target, role=15, is_active=True)
        target_membership = ProjectMember.objects.create(
            project=project,
            member=target,
            role=15,
            is_active=True,
        )
        session_client.force_authenticate(user=member)

        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{target_membership.id}/",
            {"role": 5},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        target_membership.refresh_from_db()
        assert target_membership.role == 15

    @pytest.mark.django_db
    def test_final_project_admin_cannot_be_downgraded_from_project_or_workspace(
        self,
        session_client,
        workspace,
        create_user,
        member,
    ):
        project_admin = User.objects.create_user(
            email="downgrade-project-admin@example.com",
            username="downgrade-project-admin",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=project_admin,
            role=15,
            is_active=True,
        )
        project = Project.objects.create(name="Downgrade continuity", identifier="DOWN", workspace=workspace)
        target_project_membership = ProjectMember.objects.create(
            project=project,
            member=project_admin,
            role=20,
            is_active=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=15, is_active=True)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)

        project_lifecycle_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{target_project_membership.id}/",
            {"is_active": False},
            format="json",
        )
        workspace_lifecycle_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/",
            {"is_active": False},
            format="json",
        )
        invalid_project_role_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{target_project_membership.id}/",
            {"role": None},
            format="json",
        )
        invalid_workspace_role_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/",
            {"role": "not-a-role"},
            format="json",
        )
        project_role_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{target_project_membership.id}/",
            {"role": 15},
            format="json",
        )
        workspace_role_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/",
            {"role": 5},
            format="json",
        )

        assert project_lifecycle_response.status_code == status.HTTP_400_BAD_REQUEST
        assert workspace_lifecycle_response.status_code == status.HTTP_400_BAD_REQUEST
        assert invalid_project_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert invalid_workspace_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert project_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert workspace_role_response.status_code == status.HTTP_400_BAD_REQUEST
        target_project_membership.refresh_from_db()
        workspace_membership.refresh_from_db()
        assert target_project_membership.is_active is True
        assert workspace_membership.is_active is True
        assert target_project_membership.role == 20
        assert workspace_membership.role == 15

        ProjectMember.objects.filter(project=project, member=create_user).update(role=20)
        retired_workspace_role_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/members/{workspace_membership.id}/",
            {"role": 5},
            format="json",
        )

        assert retired_workspace_role_response.status_code == status.HTTP_400_BAD_REQUEST
        target_project_membership.refresh_from_db()
        workspace_membership.refresh_from_db()
        assert target_project_membership.role == 20
        assert workspace_membership.role == 15

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_retired_workspace_role_updates_are_rejected(
        self,
        workspace,
        create_user,
    ):
        first_admin = User.objects.create_user(email="concurrent-first@example.com", username="concurrent-first")
        second_admin = User.objects.create_user(email="concurrent-second@example.com", username="concurrent-second")
        first_workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=first_admin,
            role=15,
            is_active=True,
        )
        second_workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=second_admin,
            role=15,
            is_active=True,
        )
        project = Project.objects.create(name="Concurrent continuity", identifier="CONC", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=15, is_active=True)
        ProjectMember.objects.create(project=project, member=first_admin, role=20, is_active=True)
        ProjectMember.objects.create(project=project, member=second_admin, role=20, is_active=True)
        ready = Barrier(2)

        def downgrade_workspace_member(membership_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=create_user)
                ready.wait(timeout=10)
                response = client.patch(
                    f"/api/workspaces/{workspace.slug}/members/{membership_id}/",
                    {"role": 5},
                    format="json",
                )
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(
                executor.map(
                    downgrade_workspace_member,
                    [first_workspace_membership.id, second_workspace_membership.id],
                )
            )

        assert results == [status.HTTP_400_BAD_REQUEST, status.HTTP_400_BAD_REQUEST]
        assert ProjectMember.objects.filter(project=project, role=20, is_active=True).count() == 2

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_project_role_updates_preserve_one_project_admin(
        self,
        workspace,
        create_user,
    ):
        first_admin = User.objects.create_user(email="project-first@example.com", username="project-first")
        second_admin = User.objects.create_user(email="project-second@example.com", username="project-second")
        WorkspaceMember.objects.create(workspace=workspace, member=first_admin, role=15, is_active=True)
        WorkspaceMember.objects.create(workspace=workspace, member=second_admin, role=15, is_active=True)
        project = Project.objects.create(name="Concurrent project roles", identifier="CPRJ", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=15, is_active=True)
        first_membership = ProjectMember.objects.create(project=project, member=first_admin, role=20, is_active=True)
        second_membership = ProjectMember.objects.create(project=project, member=second_admin, role=20, is_active=True)
        ready = Barrier(2)

        def downgrade_project_member(membership_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=create_user)
                ready.wait(timeout=10)
                response = client.patch(
                    f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{membership_id}/",
                    {"role": 15},
                    format="json",
                )
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(
                executor.map(
                    downgrade_project_member,
                    [first_membership.id, second_membership.id],
                )
            )

        assert sorted(results) == [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
        assert ProjectMember.objects.filter(project=project, role=20, is_active=True).count() == 1
