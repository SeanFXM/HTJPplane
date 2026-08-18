# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, IssueRelation, Project, ProjectMember, State


@pytest.mark.contract
class TestOperationalReportEndpoint:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(
            name="Operations",
            identifier="OPS",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def state(self, workspace, project):
        return State.objects.create(
            name="In progress",
            color="#3F76FF",
            group="started",
            default=True,
            workspace=workspace,
            project=project,
        )

    def create_issue(self, *, workspace, project, state, name, priority="none", target_date=None):
        return Issue.objects.create(
            name=name,
            workspace=workspace,
            project=project,
            state=state,
            priority=priority,
            target_date=target_date,
        )

    @pytest.mark.django_db
    def test_returns_actionable_workspace_categories(
        self,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        today = timezone.localdate()
        overdue = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Overdue launch task",
            priority="urgent",
            target_date=today - timedelta(days=1),
        )
        blocker = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Supplier response",
        )
        blocked = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Blocked product page",
            target_date=today + timedelta(days=3),
        )
        missing_due_date = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="High priority without date",
            priority="high",
        )
        IssueRelation.objects.create(
            issue=blocked,
            related_issue=blocker,
            relation_type="blocked_by",
            workspace=workspace,
            project=project,
        )
        IssueAssignee.objects.create(
            issue=overdue,
            assignee=create_user,
            workspace=workspace,
            project=project,
        )

        response = session_client.get(f"/api/workspaces/{workspace.slug}/operational-reports/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["counts"]["urgent_overdue"] == 1
        assert response.data["counts"]["blocked"] == 1
        assert response.data["counts"]["missing_due_date"] == 1
        assert response.data["counts"]["unassigned"] == 3
        assert str(response.data["issues"]["overdue"][0]["id"]) == str(overdue.id)
        assert str(response.data["issues"]["blocked"][0]["id"]) == str(blocked.id)
        assert str(response.data["issues"]["missing_due_date"][0]["id"]) == str(missing_due_date.id)
        assert response.data["in_progress_by_owner"][0]["count"] == 1

    @pytest.mark.django_db
    def test_prefers_structured_blocked_and_waiting_fields(
        self,
        session_client,
        workspace,
        project,
        state,
    ):
        blocked = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Blocked by missing sample",
        )
        blocked.blocked_reason = "Factory sample has not arrived"
        blocked.next_action = "Escalate to the supplier"
        blocked.save()

        waiting = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Waiting for retailer",
        )
        waiting.waiting_party = "Retail partner"
        waiting.save()

        response = session_client.get(f"/api/workspaces/{workspace.slug}/operational-reports/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["counts"]["blocked"] == 1
        assert response.data["counts"]["waiting"] == 1
        assert response.data["issues"]["blocked"][0]["blocked_reason"] == "Factory sample has not arrived"
        assert response.data["issues"]["blocked"][0]["next_action"] == "Escalate to the supplier"
        assert response.data["issues"]["waiting"][0]["waiting_party"] == "Retail partner"
        assert response.data["issues"]["waiting"][0]["waiting_since"] is not None

    @pytest.mark.django_db
    def test_soft_deleted_owner_is_unassigned_and_not_in_owner_load(
        self,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        issue = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Owner cleared",
        )
        assignment = IssueAssignee.objects.create(
            issue=issue,
            assignee=create_user,
            workspace=workspace,
            project=project,
        )
        IssueAssignee.objects.filter(id=assignment.id).update(deleted_at=timezone.now())

        response = session_client.get(f"/api/workspaces/{workspace.slug}/operational-reports/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["counts"]["unassigned"] == 1
        assert [str(item["id"]) for item in response.data["issues"]["unassigned"]] == [str(issue.id)]
        assert response.data["in_progress_by_owner"] == []

    @pytest.mark.django_db
    def test_standard_waiting_and_review_states_are_mutually_exclusive(
        self,
        session_client,
        workspace,
        project,
    ):
        waiting_state = State.objects.create(
            name="待機中",
            color="#8B5CF6",
            group="started",
            workspace=workspace,
            project=project,
        )
        review_state = State.objects.create(
            name="社内確認待ち",
            color="#EC4899",
            group="started",
            workspace=workspace,
            project=project,
        )
        waiting_issue = self.create_issue(
            workspace=workspace,
            project=project,
            state=waiting_state,
            name="Waiting task",
        )
        review_issue = self.create_issue(
            workspace=workspace,
            project=project,
            state=review_state,
            name="Review task",
        )

        response = session_client.get(f"/api/workspaces/{workspace.slug}/operational-reports/")

        assert response.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in response.data["issues"]["waiting"]] == [str(waiting_issue.id)]
        assert [str(item["id"]) for item in response.data["issues"]["awaiting_review"]] == [str(review_issue.id)]
