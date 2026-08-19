# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from rest_framework import status

from plane.db.models import Project, ProjectMember, User, WorkspaceMember, WorkspaceMemberInvite


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Public API members",
        identifier="PAM",
        workspace=workspace,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=20,
        is_active=True,
    )
    return project


@pytest.mark.contract
class TestProjectMemberPublicAPI:
    @staticmethod
    def detail_url(workspace, project, membership):
        return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/members/{membership.id}/"

    @staticmethod
    def list_url(workspace, project):
        return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/members/"

    @pytest.mark.django_db
    def test_inactive_admin_cannot_create_workspace_invite(
        self,
        api_key_client,
        workspace,
        create_user,
    ):
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(is_active=False)

        response = api_key_client.post(
            f"/api/v1/workspaces/{workspace.slug}/invitations/",
            {"email": "blocked-inactive-admin@example.com", "role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not WorkspaceMemberInvite.objects.filter(email="blocked-inactive-admin@example.com").exists()

    @pytest.mark.django_db
    def test_sole_admin_cannot_downgrade_self(self, api_key_client, workspace, project, create_user):
        membership = ProjectMember.objects.get(project=project, member=create_user)

        response = api_key_client.patch(
            self.detail_url(workspace, project, membership),
            {"role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "LAST_PROJECT_ADMIN"
        membership.refresh_from_db()
        assert (membership.role, membership.is_active) == (20, True)

    @pytest.mark.django_db
    def test_sole_admin_cannot_delete_self(self, api_key_client, workspace, project, create_user):
        membership = ProjectMember.objects.get(project=project, member=create_user)

        response = api_key_client.delete(self.detail_url(workspace, project, membership))

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "LAST_PROJECT_ADMIN"
        membership.refresh_from_db()
        assert (membership.role, membership.is_active) == (20, True)

    @pytest.mark.django_db
    def test_patch_rejects_member_reassignment(self, api_key_client, workspace, project, create_user):
        membership = ProjectMember.objects.get(project=project, member=create_user)
        replacement_user = User.objects.create_user(
            email="public-member-reassignment@example.com",
            username="public-member-reassignment",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=replacement_user, role=15, is_active=True)

        response = api_key_client.patch(
            self.detail_url(workspace, project, membership),
            {"member": str(replacement_user.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        membership.refresh_from_db()
        assert membership.member_id == create_user.id
        assert (membership.role, membership.is_active) == (20, True)

    @pytest.mark.django_db
    def test_patch_cannot_downgrade_workspace_admin_in_project(self, api_key_client, workspace, project):
        workspace_admin = User.objects.create_user(
            email="public-admin-downgrade@example.com",
            username="public-admin-downgrade",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=workspace_admin, role=20, is_active=True)
        membership = ProjectMember.objects.create(
            project=project,
            member=workspace_admin,
            role=20,
            is_active=True,
        )

        response = api_key_client.patch(
            self.detail_url(workspace, project, membership),
            {"role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        membership.refresh_from_db()
        assert (membership.role, membership.is_active) == (20, True)

    @pytest.mark.django_db
    def test_post_rejects_inactive_workspace_member(self, api_key_client, workspace, project):
        inactive_user = User.objects.create_user(
            email="inactive-public-member@example.com",
            username="inactive-public-member",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=inactive_user,
            role=15,
            is_active=False,
        )

        response = api_key_client.post(
            self.list_url(workspace, project),
            {"member": str(inactive_user.id), "role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ProjectMember.objects.filter(project=project, member=inactive_user).exists()

    @pytest.mark.django_db
    def test_post_rejects_workspace_admin_as_project_member(self, api_key_client, workspace, project):
        workspace_admin = User.objects.create_user(
            email="public-workspace-admin@example.com",
            username="public-workspace-admin",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=workspace_admin,
            role=20,
            is_active=True,
        )

        response = api_key_client.post(
            self.list_url(workspace, project),
            {"member": str(workspace_admin.id), "role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ProjectMember.objects.filter(project=project, member=workspace_admin).exists()

    @pytest.mark.django_db
    def test_post_never_downgrades_and_reactivates_with_higher_existing_role(
        self,
        api_key_client,
        workspace,
        project,
    ):
        existing_admin = User.objects.create_user(
            email="public-existing-admin@example.com",
            username="public-existing-admin",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=existing_admin, role=15, is_active=True)
        membership = ProjectMember.objects.create(
            project=project,
            member=existing_admin,
            role=20,
            is_active=False,
        )

        response = api_key_client.post(
            self.list_url(workspace, project),
            {"member": str(existing_admin.id), "role": 15},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        membership.refresh_from_db()
        assert (membership.role, membership.is_active) == (20, True)
