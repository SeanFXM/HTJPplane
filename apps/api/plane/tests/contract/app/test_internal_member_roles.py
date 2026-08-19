# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest

from rest_framework import status
from rest_framework.test import APIClient

from plane.authentication.utils.workspace_project_join import process_workspace_project_invitations
from plane.db.models import (
    Profile,
    Project,
    ProjectMember,
    ProjectMemberInvite,
    ProjectUserProperty,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
)


@pytest.mark.contract
class TestInternalMemberRoles:
    @pytest.mark.django_db
    def test_workspace_invites_default_to_member_and_reject_retired_role(self, session_client, workspace):
        invite_url = f"/api/workspaces/{workspace.slug}/invitations/"

        retired_role_response = session_client.post(
            invite_url,
            {"emails": [{"email": "retired-role@example.com", "role": 5}]},
            format="json",
        )
        default_member_response = session_client.post(
            invite_url,
            {"emails": [{"email": "employee@example.com"}]},
            format="json",
        )

        assert retired_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert default_member_response.status_code == status.HTTP_200_OK
        assert not WorkspaceMemberInvite.objects.filter(email="retired-role@example.com").exists()
        invitation = WorkspaceMemberInvite.objects.get(email="employee@example.com")
        assert invitation.role == 15

        update_response = session_client.patch(
            f"{invite_url}{invitation.id}/",
            {"role": 5},
            format="json",
        )
        assert update_response.status_code == status.HTTP_400_BAD_REQUEST
        invitation.refresh_from_db()
        assert invitation.role == 15

    @pytest.mark.django_db
    def test_duplicate_workspace_invite_reports_existing_without_redelivery(
        self,
        session_client,
        workspace,
        mocker,
        django_capture_on_commit_callbacks,
    ):
        invite_url = f"/api/workspaces/{workspace.slug}/invitations/"
        delivery = mocker.patch("plane.app.views.workspace.invite.workspace_invitation.delay")
        tracking = mocker.patch("plane.app.views.workspace.invite.track_event.delay")
        payload = {"emails": [{"email": "duplicate-invite@example.com", "role": 15}]}

        with django_capture_on_commit_callbacks(execute=True):
            first_response = session_client.post(invite_url, payload, format="json")
        invitation = WorkspaceMemberInvite.objects.get(email="duplicate-invite@example.com")
        original_token = invitation.token
        with django_capture_on_commit_callbacks(execute=True):
            duplicate_response = session_client.post(invite_url, payload, format="json")

        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["created_count"] == 1
        assert first_response.data["existing_count"] == 0
        assert duplicate_response.status_code == status.HTTP_200_OK
        assert duplicate_response.data["created_count"] == 0
        assert duplicate_response.data["existing_count"] == 1
        assert WorkspaceMemberInvite.objects.filter(email="duplicate-invite@example.com").count() == 1
        invitation.refresh_from_db()
        assert invitation.token == original_token
        assert delivery.call_count == 1
        assert tracking.call_count == 1

    @pytest.mark.django_db
    def test_workspace_invite_can_only_be_consumed_by_matching_authenticated_employee(
        self,
        session_client,
        workspace,
    ):
        invited_user = User.objects.create_user(email="invited-employee@example.com", username="invited-employee")
        Profile.objects.create(user=invited_user)
        invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email="Invited-Employee@example.com",
            token="internal-invite-token",
            role=15,
        )
        join_url = f"/api/workspaces/{workspace.slug}/invitations/{invitation.id}/join/"
        payload = {"accepted": True, "token": invitation.token}

        anonymous_response = APIClient().post(join_url, payload, format="json")
        wrong_employee_response = session_client.post(join_url, payload, format="json")

        assert anonymous_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert wrong_employee_response.status_code == status.HTTP_403_FORBIDDEN
        invitation.refresh_from_db()
        assert invitation.responded_at is None
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=invited_user).exists()

        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)
        accepted_response = invited_client.post(join_url, payload, format="json")

        assert accepted_response.status_code == status.HTTP_200_OK
        membership = WorkspaceMember.objects.get(workspace=workspace, member=invited_user)
        assert membership.role == 15
        assert membership.is_active is True
        invited_user.profile.refresh_from_db()
        assert invited_user.profile.last_workspace_id == workspace.id
        assert not WorkspaceMemberInvite.objects.filter(id=invitation.id).exists()
        archived_invitation = WorkspaceMemberInvite.all_objects.get(id=invitation.id)
        assert archived_invitation.accepted is True
        assert archived_invitation.responded_at is not None

    @pytest.mark.django_db
    def test_single_workspace_invite_cannot_reactivate_suspended_admin(self, workspace):
        invited_user = User.objects.create_user(
            email="stale-workspace-invite@example.com",
            username="stale-workspace-invite",
        )
        Profile.objects.create(user=invited_user)
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=invited_user,
            role=20,
            is_active=False,
        )
        invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email=invited_user.email,
            token="stale-member-invite-token",
            role=15,
        )

        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)
        response = invited_client.post(
            f"/api/workspaces/{workspace.slug}/invitations/{invitation.id}/join/",
            {"accepted": True, "token": invitation.token},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "ADMIN_REACTIVATION_REQUIRED"
        membership.refresh_from_db()
        assert membership.is_active is False
        assert membership.role == 20
        assert WorkspaceMemberInvite.objects.filter(id=invitation.id).exists()

    @pytest.mark.django_db
    def test_single_workspace_invite_does_not_promote_existing_active_member(self, workspace):
        invited_user = User.objects.create_user(
            email="stale-admin-workspace-invite@example.com",
            username="stale-admin-workspace-invite",
        )
        Profile.objects.create(user=invited_user)
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=invited_user,
            role=15,
            is_active=True,
        )
        invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email=invited_user.email,
            token="stale-admin-invite-token",
            role=20,
        )
        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)

        response = invited_client.post(
            f"/api/workspaces/{workspace.slug}/invitations/{invitation.id}/join/",
            {"accepted": True, "token": invitation.token},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        membership.refresh_from_db()
        assert (membership.is_active, membership.role) == (True, 15)

    @pytest.mark.django_db
    def test_bulk_workspace_invites_preserve_admin_and_force_owner_to_admin(self, workspace):
        invited_user = User.objects.create_user(
            email="bulk-stale-invite@example.com",
            username="bulk-stale-invite",
        )
        existing_admin = WorkspaceMember.objects.create(
            workspace=workspace,
            member=invited_user,
            role=20,
            is_active=True,
        )
        owned_workspace = Workspace.objects.create(
            name="Owned stale invite workspace",
            slug="owned-stale-invite-workspace",
            owner=invited_user,
        )
        owner_membership = WorkspaceMember.objects.create(
            workspace=owned_workspace,
            member=invited_user,
            role=15,
            is_active=True,
        )
        invitations = [
            WorkspaceMemberInvite.objects.create(
                workspace=workspace,
                email=invited_user.email,
                token="bulk-existing-admin-token",
                role=15,
            ),
            WorkspaceMemberInvite.objects.create(
                workspace=owned_workspace,
                email=invited_user.email,
                token="bulk-owner-token",
                role=15,
            ),
        ]

        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)
        response = invited_client.post(
            "/api/users/me/workspaces/invitations/",
            {"invitations": [str(invitation.id) for invitation in invitations]},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        existing_admin.refresh_from_db()
        owner_membership.refresh_from_db()
        assert (existing_admin.is_active, existing_admin.role) == (True, 20)
        assert (owner_membership.is_active, owner_membership.role) == (True, 20)
        assert not WorkspaceMemberInvite.objects.filter(id__in=[invitation.id for invitation in invitations]).exists()

    @pytest.mark.django_db
    def test_bulk_workspace_invites_cannot_reactivate_suspended_member(self, workspace):
        invited_user = User.objects.create_user(
            email="bulk-suspended-invite@example.com",
            username="bulk-suspended-invite",
        )
        membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=invited_user,
            role=15,
            is_active=False,
        )
        invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email=invited_user.email,
            token="bulk-suspended-token",
            role=20,
        )
        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)

        response = invited_client.post(
            "/api/users/me/workspaces/invitations/",
            {"invitations": [str(invitation.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "ADMIN_REACTIVATION_REQUIRED"
        membership.refresh_from_db()
        assert (membership.is_active, membership.role) == (False, 15)
        assert WorkspaceMemberInvite.objects.filter(id=invitation.id).exists()

    @pytest.mark.django_db
    def test_project_invite_can_only_be_consumed_by_matching_authenticated_employee(
        self,
        session_client,
        workspace,
    ):
        project = Project.objects.create(name="Invite project", identifier="INV", workspace=workspace)
        invited_user = User.objects.create_user(email="project-invite@example.com", username="project-invite")
        invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=project,
            email="Project-Invite@example.com",
            token="project-invite-token",
            role=15,
        )
        join_url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/join/{invitation.id}/"
        payload = {"accepted": True, "email": invitation.email}

        anonymous_response = APIClient().post(join_url, payload, format="json")
        wrong_employee_response = session_client.post(join_url, payload, format="json")

        assert anonymous_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert wrong_employee_response.status_code == status.HTTP_403_FORBIDDEN
        invitation.refresh_from_db()
        assert invitation.responded_at is None

        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)
        accepted_response = invited_client.post(join_url, payload, format="json")

        assert accepted_response.status_code == status.HTTP_200_OK
        assert WorkspaceMember.objects.filter(
            workspace=workspace,
            member=invited_user,
            role=15,
            is_active=True,
        ).exists()
        assert ProjectMember.objects.filter(
            project=project,
            member=invited_user,
            role=15,
            is_active=True,
        ).exists()
        invitation.refresh_from_db()
        assert invitation.accepted is True
        assert invitation.responded_at is not None

    @pytest.mark.django_db
    def test_legacy_project_invites_preserve_project_admin_and_force_workspace_admin(self, workspace):
        preserved_project = Project.objects.create(
            name="Preserved project admin",
            identifier="PPA",
            workspace=workspace,
        )
        existing_project_admin = User.objects.create_user(
            email="existing-project-admin@example.com",
            username="existing-project-admin",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=existing_project_admin,
            role=15,
        )
        existing_project_membership = ProjectMember.objects.create(
            project=preserved_project,
            member=existing_project_admin,
            role=20,
            is_active=True,
        )
        stale_member_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=preserved_project,
            email=existing_project_admin.email,
            token="stale-project-member-token",
            role=15,
        )

        existing_admin_client = APIClient()
        existing_admin_client.force_authenticate(user=existing_project_admin)
        preserve_response = existing_admin_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{preserved_project.id}/join/{stale_member_invitation.id}/",
            {"accepted": True},
            format="json",
        )

        assert preserve_response.status_code == status.HTTP_200_OK
        existing_project_membership.refresh_from_db()
        assert (existing_project_membership.is_active, existing_project_membership.role) == (True, 20)

        forced_project = Project.objects.create(
            name="Workspace admin project",
            identifier="WAP",
            workspace=workspace,
        )
        workspace_admin = User.objects.create_user(
            email="workspace-admin-project-invite@example.com",
            username="workspace-admin-project-invite",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=workspace_admin,
            role=20,
        )
        workspace_admin_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=forced_project,
            email=workspace_admin.email,
            token="workspace-admin-project-token",
            role=15,
        )

        workspace_admin_client = APIClient()
        workspace_admin_client.force_authenticate(user=workspace_admin)
        force_response = workspace_admin_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{forced_project.id}/join/{workspace_admin_invitation.id}/",
            {"accepted": True},
            format="json",
        )

        assert force_response.status_code == status.HTTP_200_OK
        assert ProjectMember.objects.filter(
            project=forced_project,
            member=workspace_admin,
            role=20,
            is_active=True,
        ).exists()

        preserved_member_project = Project.objects.create(
            name="Preserved project member",
            identifier="PPM",
            workspace=workspace,
        )
        existing_project_member = User.objects.create_user(
            email="existing-project-member@example.com",
            username="existing-project-member",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=existing_project_member, role=15)
        existing_member_membership = ProjectMember.objects.create(
            project=preserved_member_project,
            member=existing_project_member,
            role=15,
            is_active=True,
        )
        stale_admin_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=preserved_member_project,
            email=existing_project_member.email,
            token="stale-project-admin-token",
            role=20,
        )
        existing_member_client = APIClient()
        existing_member_client.force_authenticate(user=existing_project_member)

        preserve_member_response = existing_member_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{preserved_member_project.id}/join/{stale_admin_invitation.id}/",
            {"accepted": True},
            format="json",
        )

        assert preserve_member_response.status_code == status.HTTP_200_OK
        existing_member_membership.refresh_from_db()
        assert (existing_member_membership.is_active, existing_member_membership.role) == (True, 15)

    @pytest.mark.django_db
    def test_project_invite_cannot_reactivate_inactive_project_membership(self, workspace):
        project = Project.objects.create(name="Suspended project member", identifier="SPM", workspace=workspace)
        invited_user = User.objects.create_user(
            email="inactive-project-invite@example.com",
            username="inactive-project-invite",
        )
        membership = ProjectMember.objects.create(
            project=project,
            member=invited_user,
            role=20,
            is_active=False,
        )
        invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=project,
            email=invited_user.email,
            token="inactive-project-token",
            role=15,
        )
        invited_client = APIClient()
        invited_client.force_authenticate(user=invited_user)

        response = invited_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/join/{invitation.id}/",
            {"accepted": True},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "PROJECT_ADMIN_REACTIVATION_REQUIRED"
        membership.refresh_from_db()
        invitation.refresh_from_db()
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=invited_user).exists()
        assert (membership.is_active, membership.role) == (False, 20)
        assert invitation.responded_at is None

    @pytest.mark.django_db
    def test_auth_fallback_does_not_restore_suspended_workspace_or_project_access(self, workspace):
        project = Project.objects.create(name="Fallback suspended member", identifier="FSM", workspace=workspace)
        invited_user = User.objects.create_user(
            email="fallback-suspended@example.com",
            username="fallback-suspended",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=invited_user,
            role=15,
            is_active=False,
        )
        project_membership = ProjectMember.objects.create(
            project=project,
            member=invited_user,
            role=20,
            is_active=False,
        )
        workspace_invitation = WorkspaceMemberInvite.objects.create(
            workspace=workspace,
            email=invited_user.email,
            token="fallback-workspace-token",
            role=20,
            accepted=True,
        )
        project_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=project,
            email=invited_user.email,
            token="fallback-project-token",
            role=20,
            accepted=True,
        )

        process_workspace_project_invitations(invited_user)

        workspace_membership.refresh_from_db()
        project_membership.refresh_from_db()
        assert (workspace_membership.is_active, workspace_membership.role) == (False, 15)
        assert (project_membership.is_active, project_membership.role) == (False, 20)
        assert not WorkspaceMemberInvite.objects.filter(id=workspace_invitation.id).exists()
        assert not ProjectMemberInvite.objects.filter(id=project_invitation.id).exists()

        project_only_user = User.objects.create_user(
            email="fallback-project-only@example.com",
            username="fallback-project-only",
        )
        project_only_membership = ProjectMember.objects.create(
            project=project,
            member=project_only_user,
            role=20,
            is_active=False,
        )
        project_only_invitation = ProjectMemberInvite.objects.create(
            workspace=workspace,
            project=project,
            email=project_only_user.email,
            token="fallback-project-only-token",
            role=15,
            accepted=True,
        )

        process_workspace_project_invitations(project_only_user)

        project_only_membership.refresh_from_db()
        assert not WorkspaceMember.objects.filter(workspace=workspace, member=project_only_user).exists()
        assert (project_only_membership.is_active, project_only_membership.role) == (False, 20)
        assert not ProjectMemberInvite.objects.filter(id=project_only_invitation.id).exists()

    @pytest.mark.django_db
    def test_project_email_invitation_creation_is_retired(self, session_client, workspace):
        project = Project.objects.create(name="Direct membership project", identifier="DIR", workspace=workspace)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/invitations/",
            {"emails": [{"email": "unused-project-invite@example.com", "role": 15}]},
            format="json",
        )

        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert not ProjectMemberInvite.objects.filter(project=project).exists()

    @pytest.mark.django_db
    def test_self_join_rejects_cross_workspace_or_missing_projects_without_partial_writes(
        self,
        session_client,
        workspace,
        create_user,
    ):
        valid_project = Project.objects.create(name="Valid project", identifier="VAL", workspace=workspace)
        other_workspace = Workspace.objects.create(
            name="Other workspace",
            slug="other-self-join-workspace",
            owner=create_user,
        )
        other_project = Project.objects.create(name="Other project", identifier="OTH", workspace=other_workspace)
        join_url = f"/api/users/me/workspaces/{workspace.slug}/projects/invitations/"

        cross_workspace_response = session_client.post(
            join_url,
            {"project_ids": [str(valid_project.id), str(other_project.id)]},
            format="json",
        )
        missing_project_response = session_client.post(
            join_url,
            {"project_ids": [str(valid_project.id), str(uuid4())]},
            format="json",
        )

        assert cross_workspace_response.status_code == status.HTTP_400_BAD_REQUEST
        assert missing_project_response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ProjectMember.objects.filter(member=create_user, project=valid_project).exists()
        assert not ProjectMember.objects.filter(member=create_user, project=other_project).exists()
        assert not ProjectUserProperty.objects.filter(user=create_user, project=valid_project).exists()
        assert not ProjectUserProperty.objects.filter(user=create_user, project=other_project).exists()

    @pytest.mark.django_db
    def test_self_join_cannot_reactivate_inactive_project_membership_and_is_atomic(self, workspace):
        employee = User.objects.create_user(
            email="removed-project-admin@example.com",
            username="removed-project-admin",
        )
        workspace_membership = WorkspaceMember.objects.create(
            workspace=workspace,
            member=employee,
            role=15,
            is_active=True,
        )
        removed_project = Project.objects.create(
            name="Removed project membership",
            identifier="RPM",
            workspace=workspace,
        )
        new_project = Project.objects.create(
            name="New public project",
            identifier="NPP",
            workspace=workspace,
        )
        removed_membership = ProjectMember.objects.create(
            project=removed_project,
            member=employee,
            role=20,
            is_active=False,
        )
        employee_client = APIClient()
        employee_client.force_authenticate(user=employee)

        response = employee_client.post(
            f"/api/users/me/workspaces/{workspace.slug}/projects/invitations/",
            {"project_ids": [str(new_project.id), str(removed_project.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "PROJECT_ADMIN_REACTIVATION_REQUIRED"
        workspace_membership.refresh_from_db()
        removed_membership.refresh_from_db()
        assert (workspace_membership.is_active, workspace_membership.role) == (True, 15)
        assert (removed_membership.is_active, removed_membership.role) == (False, 20)
        assert not ProjectMember.objects.filter(project=new_project, member=employee).exists()
        assert not ProjectUserProperty.objects.filter(project=new_project, user=employee).exists()

    @pytest.mark.django_db
    def test_project_member_create_defaults_to_member_and_rejects_retired_role(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project = Project.objects.create(name="Internal roles", identifier="INT", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        employee = User.objects.create_user(email="project-employee@example.com", username="project-employee")
        WorkspaceMember.objects.create(workspace=workspace, member=employee, role=15)
        member_url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/"

        retired_role_response = session_client.post(
            member_url,
            {"members": [{"member_id": str(employee.id), "role": 5}]},
            format="json",
        )
        default_member_response = session_client.post(
            member_url,
            {"members": [{"member_id": str(employee.id)}]},
            format="json",
        )

        assert retired_role_response.status_code == status.HTTP_400_BAD_REQUEST
        assert default_member_response.status_code == status.HTTP_201_CREATED
        membership = ProjectMember.objects.get(project=project, member=employee)
        assert membership.role == 15

        update_response = session_client.patch(
            f"{member_url}{membership.id}/",
            {"role": 5},
            format="json",
        )
        assert update_response.status_code == status.HTTP_400_BAD_REQUEST
        membership.refresh_from_db()
        assert membership.role == 15

    @pytest.mark.django_db
    def test_project_member_post_cannot_downgrade_sole_admin_self(self, workspace):
        project = Project.objects.create(name="Sole admin", identifier="SOL", workspace=workspace)
        project_admin = User.objects.create_user(
            email="sole-project-admin@example.com",
            username="sole-project-admin",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=project_admin, role=15)
        membership = ProjectMember.objects.create(
            project=project,
            member=project_admin,
            role=20,
            is_active=True,
        )

        project_admin_client = APIClient()
        project_admin_client.force_authenticate(user=project_admin)
        response = project_admin_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/",
            {"members": [{"member_id": str(project_admin.id), "role": 15}]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        membership.refresh_from_db()
        assert (membership.is_active, membership.role) == (True, 20)
        assert ProjectMember.objects.filter(project=project, role=20, is_active=True).count() == 1

    @pytest.mark.django_db
    def test_project_member_post_cannot_downgrade_existing_admin(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Existing admin", identifier="EAD", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        existing_admin = User.objects.create_user(
            email="existing-target-admin@example.com",
            username="existing-target-admin",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=existing_admin, role=15)
        existing_membership = ProjectMember.objects.create(
            project=project,
            member=existing_admin,
            role=20,
            is_active=True,
        )
        inactive_admin = User.objects.create_user(
            email="inactive-target-admin@example.com",
            username="inactive-target-admin",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=inactive_admin, role=15)
        inactive_membership = ProjectMember.objects.create(
            project=project,
            member=inactive_admin,
            role=20,
            is_active=False,
        )

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/",
            {
                "members": [
                    {"member_id": str(existing_admin.id), "role": 15},
                    {"member_id": str(inactive_admin.id), "role": 15},
                ]
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        existing_membership.refresh_from_db()
        inactive_membership.refresh_from_db()
        assert (existing_membership.is_active, existing_membership.role) == (True, 20)
        assert (inactive_membership.is_active, inactive_membership.role) == (True, 20)
