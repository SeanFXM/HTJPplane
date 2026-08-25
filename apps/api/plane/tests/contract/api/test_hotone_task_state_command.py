# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework import status

from plane.api.middleware.api_authentication import APIKeyAuthentication
from plane.bgtasks.deletion_task import restore_related_objects, soft_delete_related_objects
from plane.db.models import (
    HotoneTaskStateCommand,
    Issue,
    IssueActivity,
    IssueAssignee,
    Project,
    ProjectMember,
    State,
    Sticky,
    User,
    WorkspaceMember,
)


@pytest.mark.contract
@pytest.mark.django_db(transaction=True)
class TestHotoneTaskStateCommand:
    def setup_method(self):
        self.command_id = str(uuid.uuid4())

    @staticmethod
    def url(workspace, project, issue):
        return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{issue.id}/"

    @staticmethod
    def headers(command_id, expected_updated_at, actor_id, *, mode="apply"):
        return {
            "HTTP_X_HOTONE_COMMAND_ID": command_id,
            "HTTP_X_HOTONE_EXPECTED_UPDATED_AT": expected_updated_at.isoformat().replace("+00:00", "Z"),
            "HTTP_X_HOTONE_ACTOR_ID": str(actor_id),
            "HTTP_X_HOTONE_COMMAND_MODE": mode,
        }

    @staticmethod
    def records(workspace, create_user):
        project = Project.objects.create(
            name="Hotone CAS project",
            identifier=f"CAS{uuid.uuid4().hex[:5].upper()}",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        first = State.objects.create(
            name="In progress",
            color="#3F76FF",
            group="started",
            default=True,
            workspace=workspace,
            project=project,
        )
        second = State.objects.create(
            name="Done",
            color="#16A34A",
            group="completed",
            workspace=workspace,
            project=project,
        )
        issue = Issue.objects.create(
            name="Atomic Hotone task",
            workspace=workspace,
            project=project,
            state=first,
        )
        IssueAssignee.objects.create(
            issue=issue,
            assignee=create_user,
            workspace=workspace,
            project=project,
        )
        return project, first, second, issue

    @staticmethod
    def soft_delete_project_tree(project):
        # Exercise the same model delete plus recursive worker cascade used by
        # the real project deletion endpoint without enqueueing a second task.
        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            project.delete()
        soft_delete_related_objects.run("db", "project", project.id)

    def test_success_is_atomic_and_replays_without_overwriting_a_later_change(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        request_headers = self.headers(self.command_id, expected, create_user.id)
        with patch("plane.api.views.issue.issue_activity.delay"):
            first_response = api_key_client.patch(
                self.url(workspace, project, issue),
                {"state": str(second.id)},
                format="json",
                **request_headers,
            )
        assert first_response.status_code == status.HTTP_200_OK
        assert set(first_response.json()) == {
            "id",
            "name",
            "sequence_id",
            "project",
            "state",
            "priority",
            "start_date",
            "target_date",
            "updated_at",
            "assignees",
        }
        assert first_response.json()["assignees"] == [str(create_user.id)]
        assert first_response.json()["state"]["id"] == str(second.id)
        issue.refresh_from_db()
        assert issue.state_id == second.id
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1
        command = HotoneTaskStateCommand.objects.get(command_id=self.command_id)
        activity = IssueActivity.objects.get(pk=command.activity_id)
        assert activity.actor_id == create_user.id
        assert activity.field == "state"
        assert activity.old_identifier == first.id
        assert activity.new_identifier == second.id

        Issue.objects.filter(pk=issue.id).update(state=first, updated_at=timezone.now())
        reconciliation_headers = {
            **request_headers,
            "HTTP_X_HOTONE_COMMAND_MODE": "cancel",
        }
        with patch("plane.api.views.issue.issue_activity.delay"):
            replay = api_key_client.patch(
                self.url(workspace, project, issue),
                {"state": str(second.id)},
                format="json",
                **reconciliation_headers,
            )
        assert replay.status_code == status.HTTP_200_OK
        assert replay.json() == first_response.json()
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1
        assert IssueActivity.objects.filter(pk=command.activity_id).count() == 1

    def test_stale_version_is_stored_and_never_overwrites_the_concurrent_change(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        stale_version = issue.updated_at
        Issue.objects.filter(pk=issue.id).update(state=second, updated_at=timezone.now())
        request_headers = self.headers(self.command_id, stale_version, create_user.id)

        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(first.id)},
            format="json",
            **request_headers,
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.json()["code"] == "HOTONE_VERSION_CONFLICT"
        issue.refresh_from_db()
        assert issue.state_id == second.id

        Issue.objects.filter(pk=issue.id).update(state=first, updated_at=timezone.now())
        replay = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(first.id)},
            format="json",
            **request_headers,
        )
        assert replay.status_code == status.HTTP_409_CONFLICT
        assert replay.json() == response.json()
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1

    def test_command_id_cannot_be_reused_for_a_different_target(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        request_headers = self.headers(self.command_id, issue.updated_at, create_user.id)
        with patch("plane.api.views.issue.issue_activity.delay"):
            created = api_key_client.patch(
                self.url(workspace, project, issue),
                {"state": str(second.id)},
                format="json",
                **request_headers,
            )
        assert created.status_code == status.HTTP_200_OK

        reused = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(first.id)},
            format="json",
            **request_headers,
        )
        assert reused.status_code == status.HTTP_409_CONFLICT
        assert "reused" in reused.json()["error"].lower()

    def test_command_mode_is_required_and_cancel_freezes_a_delayed_apply(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        request_headers = self.headers(self.command_id, issue.updated_at, create_user.id)

        missing_mode = dict(request_headers)
        missing_mode.pop("HTTP_X_HOTONE_COMMAND_MODE")
        rejected = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **missing_mode,
        )
        assert rejected.status_code == status.HTTP_400_BAD_REQUEST
        assert not HotoneTaskStateCommand.objects.filter(command_id=self.command_id).exists()

        unknown_mode = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(
                self.command_id,
                issue.updated_at,
                create_user.id,
                mode="reconcile",
            ),
        )
        assert unknown_mode.status_code == status.HTTP_400_BAD_REQUEST
        assert not HotoneTaskStateCommand.objects.filter(command_id=self.command_id).exists()

        cancelled = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(
                self.command_id,
                issue.updated_at,
                create_user.id,
                mode="cancel",
            ),
        )
        assert cancelled.status_code == status.HTTP_409_CONFLICT
        assert cancelled.json()["code"] == "HOTONE_COMMAND_CANCELLED"
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1

        delayed_apply = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **request_headers,
        )
        assert delayed_apply.status_code == status.HTTP_409_CONFLICT
        assert delayed_apply.json() == cancelled.json()
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_cancel_can_freeze_a_command_after_the_issue_was_deleted(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, _first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        issue_id = issue.id
        IssueAssignee.objects.filter(issue_id=issue_id).delete()
        Issue.all_objects.filter(pk=issue_id).delete()

        cancelled = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id, mode="cancel"),
        )
        assert cancelled.status_code == status.HTTP_409_CONFLICT
        assert cancelled.json()["code"] == "HOTONE_COMMAND_CANCELLED"
        command = HotoneTaskStateCommand.objects.get(command_id=self.command_id)
        assert command.issue_id == issue_id
        assert command.activity_id is None

        delayed_apply = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert delayed_apply.status_code == status.HTTP_409_CONFLICT
        assert delayed_apply.json() == cancelled.json()

    def test_cancel_can_freeze_a_command_after_the_project_was_hard_deleted(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, _first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        command_url = self.url(workspace, project, issue)
        Project.all_objects.filter(pk=project.id).delete()

        cancelled = api_key_client.patch(
            command_url,
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id, mode="cancel"),
        )
        assert cancelled.status_code == status.HTTP_409_CONFLICT
        assert cancelled.json()["code"] == "HOTONE_COMMAND_CANCELLED"
        command = HotoneTaskStateCommand.objects.get(command_id=self.command_id)
        assert command.project_id == project.id
        assert command.issue_id == issue.id

        delayed_apply = api_key_client.patch(
            command_url,
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert delayed_apply.status_code == status.HTTP_409_CONFLICT
        assert delayed_apply.json() == cancelled.json()

    def test_service_token_cannot_bypass_command_envelope(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])

        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not HotoneTaskStateCommand.objects.exists()

    def test_service_token_is_read_only_on_viewsets_too(
        self,
        api_key_client,
        api_token,
        workspace,
    ):
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])

        response = api_key_client.post(
            f"/api/v1/workspaces/{workspace.slug}/stickies/",
            {"description": "must not be written by the Hotone service token"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Sticky.objects.filter(workspace=workspace).exists()

    @pytest.mark.parametrize(
        "mutation",
        ["disable", "delete", "reclassify", "expire", "disable_user"],
    )
    def test_token_change_after_authentication_never_falls_through_as_a_normal_writer(
        self,
        mutation,
        api_key_client,
        api_token,
        workspace,
    ):
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        authenticate = APIKeyAuthentication.validate_api_token

        def authenticate_then_mutate(authentication, token):
            authenticated = authenticate(authentication, token)
            queryset = type(authenticated).objects.filter(pk=authenticated.pk)
            if mutation == "disable":
                queryset.update(is_active=False)
            elif mutation == "delete":
                queryset.delete()
            elif mutation == "reclassify":
                queryset.update(is_service=False)
            elif mutation == "disable_user":
                User.objects.filter(pk=authenticated.user_id).update(is_active=False)
            else:
                queryset.update(expired_at=timezone.now() - timedelta(seconds=1))
            return authenticated

        with patch.object(
            APIKeyAuthentication,
            "validate_api_token",
            new=authenticate_then_mutate,
        ):
            response = api_key_client.post(
                f"/api/v1/workspaces/{workspace.slug}/stickies/",
                {"description": "must fail closed after auth-time token mutation"},
                format="json",
            )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Sticky.objects.filter(workspace=workspace).exists()

    def test_inactive_project_member_cannot_be_attributed_a_command(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        actor_email = f"hotone-actor-{uuid.uuid4().hex}@example.com"
        actor = User.objects.create(email=actor_email, username=actor_email)
        WorkspaceMember.objects.create(workspace=workspace, member=actor, role=15)
        project, first, second, issue = self.records(workspace, actor)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        ProjectMember.objects.filter(project=project, member=actor).update(is_active=False)

        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, issue.updated_at, actor.id),
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_inactive_actor_workspace_member_cannot_be_attributed_a_command(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        actor_email = f"hotone-actor-{uuid.uuid4().hex}@example.com"
        actor = User.objects.create(email=actor_email, username=actor_email)
        WorkspaceMember.objects.create(workspace=workspace, member=actor, role=15)
        project, first, second, issue = self.records(workspace, actor)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        WorkspaceMember.objects.filter(workspace=workspace, member=actor).update(is_active=False)

        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, issue.updated_at, actor.id),
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_inactive_service_workspace_member_cannot_execute_a_command(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        actor_email = f"hotone-actor-{uuid.uuid4().hex}@example.com"
        actor = User.objects.create(email=actor_email, username=actor_email)
        WorkspaceMember.objects.create(workspace=workspace, member=actor, role=15)
        project, first, second, issue = self.records(workspace, actor)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(is_active=False)

        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, issue.updated_at, actor.id),
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not HotoneTaskStateCommand.objects.filter(command_id=self.command_id).exists()
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_scalar_command_ledger_replays_after_issue_is_hard_deleted(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, _first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        request_headers = self.headers(self.command_id, issue.updated_at, create_user.id)
        response = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **request_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        stored = response.json()
        IssueActivity.all_objects.filter(issue_id=issue.id).delete()
        Issue.all_objects.filter(pk=issue.id).delete()

        replay = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **request_headers,
        )
        assert replay.status_code == status.HTTP_200_OK
        assert replay.json() == stored
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1

    def test_project_delete_cascade_is_a_durable_terminal_result(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        self.soft_delete_project_tree(project)
        assert Project.all_objects.get(pk=project.id).deleted_at is not None
        assert not ProjectMember.objects.filter(project_id=project.id).exists()
        assert ProjectMember.all_objects.filter(
            project_id=project.id,
            deleted_at__isnull=False,
        ).exists()

        rejected = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert rejected.status_code == status.HTTP_404_NOT_FOUND
        assert rejected.json()["code"] == "HOTONE_SCOPE_NOT_FOUND"
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1
        issue.refresh_from_db()
        assert issue.state_id == first.id

        restore_related_objects("db", "project", project.id)
        replay = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert replay.status_code == status.HTTP_404_NOT_FOUND
        assert replay.json() == rejected.json()
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_success_replays_after_project_delete_cascade_removed_memberships(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, _first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        request_headers = self.headers(self.command_id, issue.updated_at, create_user.id)
        applied = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **request_headers,
        )
        assert applied.status_code == status.HTTP_200_OK
        stored = applied.json()

        self.soft_delete_project_tree(project)
        assert not ProjectMember.objects.filter(project_id=project.id).exists()

        replay = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **request_headers,
        )
        assert replay.status_code == status.HTTP_200_OK
        assert replay.json() == stored
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1

    def test_workspace_soft_delete_is_a_durable_terminal_result(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        original_url = self.url(workspace, project, issue)
        original_slug = workspace.slug
        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            workspace.delete()
        assert workspace.deleted_at is not None
        assert workspace.slug.startswith(f"{original_slug}__")

        rejected = api_key_client.patch(
            original_url,
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert rejected.status_code == status.HTTP_404_NOT_FOUND
        assert rejected.json()["code"] == "HOTONE_SCOPE_NOT_FOUND"
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1

        replay = api_key_client.patch(
            original_url,
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert replay.status_code == status.HTTP_404_NOT_FOUND
        assert replay.json() == rejected.json()
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()

    def test_cancel_freezes_command_after_project_delete_cascade(
        self,
        api_key_client,
        api_token,
        workspace,
        create_user,
    ):
        project, first, second, issue = self.records(workspace, create_user)
        api_token.is_service = True
        api_token.workspace = workspace
        api_token.save(update_fields=["is_service", "workspace"])
        expected = issue.updated_at
        self.soft_delete_project_tree(project)
        assert not ProjectMember.objects.filter(project_id=project.id).exists()

        cancelled = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id, mode="cancel"),
        )
        assert cancelled.status_code == status.HTTP_409_CONFLICT
        assert cancelled.json()["code"] == "HOTONE_COMMAND_CANCELLED"
        assert HotoneTaskStateCommand.objects.filter(command_id=self.command_id).count() == 1
        restore_related_objects("db", "project", project.id)

        delayed_apply = api_key_client.patch(
            self.url(workspace, project, issue),
            {"state": str(second.id)},
            format="json",
            **self.headers(self.command_id, expected, create_user.id),
        )
        assert delayed_apply.status_code == status.HTTP_409_CONFLICT
        assert delayed_apply.json() == cancelled.json()
        issue.refresh_from_db()
        assert issue.state_id == first.id
        assert not IssueActivity.objects.filter(issue_id=issue.id, field="state").exists()
