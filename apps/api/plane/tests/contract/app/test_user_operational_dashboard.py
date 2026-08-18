# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State, User


@pytest.mark.contract
class TestUserOperationalDashboard:
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

    def create_assigned_issue(self, *, workspace, project, state, user, name, target_date):
        issue = Issue.objects.create(
            name=name,
            workspace=workspace,
            project=project,
            state=state,
            target_date=target_date,
        )
        IssueAssignee.objects.create(
            issue=issue,
            assignee=user,
            workspace=workspace,
            project=project,
        )
        return issue

    @pytest.mark.django_db
    def test_groups_personal_work_by_action_date(
        self,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        today = date(2026, 8, 18)
        overdue = self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Overdue",
            target_date=today - timedelta(days=1),
        )
        due_today = self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Today",
            target_date=today,
        )
        upcoming = self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Upcoming",
            target_date=today + timedelta(days=6),
        )
        self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Later",
            target_date=today + timedelta(days=7),
        )

        with patch("plane.app.views.workspace.base.timezone.localdate", return_value=today):
            response = session_client.get(f"/api/users/me/workspaces/{workspace.slug}/dashboard/")

        assert response.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in response.data["overdue_issues"]] == [str(overdue.id)]
        assert [str(item["id"]) for item in response.data["today_issues"]] == [str(due_today.id)]
        assert [str(item["id"]) for item in response.data["upcoming_issues"]] == [str(upcoming.id)]
        assert response.data["issues_due_week_count"] == 2

    @pytest.mark.django_db
    def test_rejects_invalid_month(self, session_client, workspace):
        response = session_client.get(f"/api/users/me/workspaces/{workspace.slug}/dashboard/?month=13")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_structured_blocked_reason_appears_in_personal_action_center(
        self,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        issue = self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Blocked campaign",
            target_date=None,
        )
        issue.blocked_reason = "Waiting for approved packaging copy"
        issue.next_action = "Ask the brand lead for a decision"
        issue.save()

        response = session_client.get(f"/api/users/me/workspaces/{workspace.slug}/dashboard/")

        assert response.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in response.data["blocked_issues"]] == [str(issue.id)]
        assert response.data["blocked_issues"][0]["blocked_reason"] == "Waiting for approved packaging copy"
        assert response.data["blocked_issues"][0]["next_action"] == "Ask the brand lead for a decision"

    @pytest.mark.django_db
    def test_removed_owner_no_longer_sees_issue_in_dashboard(
        self,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        issue = self.create_assigned_issue(
            workspace=workspace,
            project=project,
            state=state,
            user=create_user,
            name="Transferred task",
            target_date=date.today(),
        )
        next_owner = User.objects.create(
            email="next-owner@example.com",
            username="next-owner",
            first_name="Next",
            last_name="Owner",
        )
        ProjectMember.objects.create(project=project, member=next_owner, role=15)

        IssueAssignee.objects.filter(issue=issue, assignee=create_user).update(deleted_at=timezone.now())
        IssueAssignee.objects.create(
            issue=issue,
            assignee=next_owner,
            workspace=workspace,
            project=project,
        )

        response = session_client.get(f"/api/users/me/workspaces/{workspace.slug}/dashboard/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_issues_count"] == 0
        assert response.data["pending_issues_count"] == 0
        assert response.data["issues_due_week_count"] == 0
        assert response.data["state_distribution"] == []
        assert response.data["today_issues"] == []
        assert response.data["overdue_issues"] == []
        assert response.data["upcoming_issues"] == []
        assert response.data["blocked_issues"] == []
