# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Project, State, User, WorkspaceMember


EXPECTED_STATES = {
    "未整理": "backlog",
    "実行待ち": "unstarted",
    "進行中": "started",
    "待機中": "started",
    "社内確認待ち": "started",
    "完了": "completed",
    "キャンセル": "cancelled",
}
EXPECTED_DEFINITIONS = {
    "未整理": ("backlog", "#6B7280", 10000),
    "実行待ち": ("unstarted", "#3B82F6", 20000),
    "進行中": ("started", "#F59E0B", 30000),
    "待機中": ("started", "#8B5CF6", 31000),
    "社内確認待ち": ("started", "#EC4899", 32000),
    "完了": ("completed", "#22C55E", 40000),
    "キャンセル": ("cancelled", "#94A3B8", 50000),
}


@pytest.mark.contract
class TestHotoneWorkflowEndpoint:
    @pytest.fixture
    def project(self, workspace):
        return Project.objects.create(
            name="Hotone Project",
            identifier="HTJP",
            workspace=workspace,
        )

    @staticmethod
    def preview_url(workspace):
        return f"/api/workspaces/{workspace.slug}/hotone-workflow/preview/"

    @staticmethod
    def apply_url(workspace):
        return f"/api/workspaces/{workspace.slug}/hotone-workflow/apply/"

    @pytest.mark.django_db
    def test_preview_reports_exact_changes_without_writing(self, session_client, workspace, project):
        response = session_client.post(self.preview_url(workspace), {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["summary"] == {
            "total_projects": 1,
            "ready_projects": 1,
            "up_to_date_projects": 0,
            "blocked_projects": 0,
            "states_to_create": 7,
        }
        assert {item["name"]: item["group"] for item in response.data["projects"][0]["create"]} == EXPECTED_STATES
        assert response.data["projects"][0]["default_action"] == "set_unorganized"
        assert State.objects.filter(project=project).count() == 0

    @pytest.mark.django_db
    def test_apply_is_idempotent_and_sets_default_only_when_missing(self, session_client, workspace, project):
        first_response = session_client.post(self.apply_url(workspace), {}, format="json")

        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["summary"]["states_created"] == 7
        assert first_response.data["projects"][0]["status"] == "applied"
        states = State.objects.filter(project=project)
        assert {state.name: state.group for state in states} == EXPECTED_STATES
        assert {
            state.name: (state.group, state.color, state.sequence) for state in states
        } == EXPECTED_DEFINITIONS
        assert states.get(name="未整理").default is True
        assert states.filter(default=True).count() == 1
        first_state_ids = set(states.values_list("id", flat=True))

        second_response = session_client.post(self.apply_url(workspace), {}, format="json")

        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["summary"] == {
            "total_projects": 1,
            "applied_projects": 0,
            "unchanged_projects": 1,
            "blocked_projects": 0,
            "states_created": 0,
        }
        assert second_response.data["projects"][0]["status"] == "no_changes"
        assert set(State.objects.filter(project=project).values_list("id", flat=True)) == first_state_ids

    @pytest.mark.django_db
    def test_apply_preserves_existing_states_and_existing_default(self, session_client, workspace, project):
        existing_default = State.objects.create(
            name="Custom default",
            color="#123456",
            group="unstarted",
            default=True,
            workspace=workspace,
            project=project,
        )
        matching_state = State.objects.create(
            name="進行中",
            color="#000000",
            group="started",
            sequence=999,
            workspace=workspace,
            project=project,
        )
        matching_state_sequence = matching_state.sequence
        issue = Issue.objects.create(
            name="Existing task",
            workspace=workspace,
            project=project,
            state=matching_state,
        )

        response = session_client.post(self.apply_url(workspace), {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        existing_default.refresh_from_db()
        matching_state.refresh_from_db()
        issue.refresh_from_db()
        assert existing_default.default is True
        assert existing_default.name == "Custom default"
        assert matching_state.color == "#000000"
        assert matching_state.sequence == matching_state_sequence
        assert issue.state_id == matching_state.id
        assert State.objects.filter(project=project, name="未整理", default=True).exists() is False

    @pytest.mark.django_db
    def test_name_group_conflict_is_reported_and_blocks_only_that_project(
        self,
        session_client,
        workspace,
        project,
    ):
        State.objects.create(
            name="完了",
            color="#000000",
            group="started",
            workspace=workspace,
            project=project,
        )
        ready_project = Project.objects.create(
            name="Ready Project",
            identifier="READY",
            workspace=workspace,
        )

        preview_response = session_client.post(self.preview_url(workspace), {}, format="json")

        assert preview_response.status_code == status.HTTP_200_OK
        blocked_preview = next(
            item for item in preview_response.data["projects"] if item["project_id"] == str(project.id)
        )
        assert blocked_preview["status"] == "blocked"
        assert blocked_preview["conflicts"] == [
            {
                "id": blocked_preview["conflicts"][0]["id"],
                "name": "完了",
                "expected_group": "completed",
                "existing_group": "started",
            }
        ]

        apply_response = session_client.post(self.apply_url(workspace), {}, format="json")

        assert apply_response.status_code == status.HTTP_200_OK
        assert apply_response.data["summary"]["blocked_projects"] == 1
        assert apply_response.data["summary"]["applied_projects"] == 1
        assert State.objects.filter(project=project).count() == 1
        assert State.objects.filter(project=ready_project).count() == 7

    @pytest.mark.django_db
    def test_member_cannot_preview_or_apply(self, workspace, project):
        member = User.objects.create(
            email="hotone-member@plane.so",
            username="hotone-member",
        )
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        member_client = APIClient()
        member_client.force_authenticate(user=member)

        preview_response = member_client.post(self.preview_url(workspace), {}, format="json")
        apply_response = member_client.post(self.apply_url(workspace), {}, format="json")

        assert preview_response.status_code == status.HTTP_403_FORBIDDEN
        assert apply_response.status_code == status.HTTP_403_FORBIDDEN
        assert State.objects.filter(project=project).count() == 0

    @pytest.mark.django_db
    def test_project_selection_is_workspace_scoped(self, session_client, workspace, project):
        response = session_client.post(
            self.preview_url(workspace),
            {"project_ids": ["00000000-0000-0000-0000-000000000001"]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "workspace" in response.data["error"]
