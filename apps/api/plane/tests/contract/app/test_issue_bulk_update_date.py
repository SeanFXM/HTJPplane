# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date
from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.mark.contract
class TestIssueBulkUpdateDateEndpoint:
    def get_issue_dates_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-dates/"

    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Issue Date Project", identifier="IDP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def state(self, workspace, project):
        return State.objects.create(
            name="Todo",
            color="#60646C",
            group="unstarted",
            default=True,
            workspace=workspace,
            project=project,
        )

    @pytest.fixture
    def issue(self, workspace, project, state, create_user):
        return Issue.objects.create(
            name="Date Update Issue",
            workspace=workspace,
            project=project,
            state=state,
            created_by_id=create_user.id,
            start_date=date(2026, 3, 1),
            target_date=date(2026, 3, 5),
        )

    @pytest.fixture
    def foreign_issue(self, workspace, create_user):
        other_project = Project.objects.create(name="Other Project", identifier="OTH", workspace=workspace)
        ProjectMember.objects.create(project=other_project, member=create_user, role=20)
        other_state = State.objects.create(
            name="Todo",
            color="#60646C",
            group="unstarted",
            default=True,
            workspace=workspace,
            project=other_project,
        )
        return Issue.objects.create(
            name="Foreign Issue",
            workspace=workspace,
            project=other_project,
            state=other_state,
            created_by_id=create_user.id,
            target_date=date(2026, 4, 1),
        )

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_bulk_update_dates_triggers_activity_for_changed_fields(
        self, mock_issue_activity_delay, session_client, workspace, project, issue
    ):
        response = session_client.post(
            self.get_issue_dates_url(workspace.slug, project.id),
            {
                "updates": [
                    {
                        "id": str(issue.id),
                        "start_date": "2026-03-10",
                        "target_date": "2026-03-12",
                    }
                ]
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.start_date == date(2026, 3, 10)
        assert issue.target_date == date(2026, 3, 12)
        assert mock_issue_activity_delay.call_count == 2
        assert all(call.kwargs["notification"] is True for call in mock_issue_activity_delay.call_args_list)

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_bulk_update_dates_supports_clearing_existing_dates(
        self, mock_issue_activity_delay, session_client, workspace, project, issue
    ):
        response = session_client.post(
            self.get_issue_dates_url(workspace.slug, project.id),
            {"updates": [{"id": str(issue.id), "start_date": None, "target_date": None}]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        assert issue.start_date is None
        assert issue.target_date is None
        assert mock_issue_activity_delay.call_count == 2

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_bulk_update_dates_is_scoped_to_current_project(
        self, mock_issue_activity_delay, session_client, workspace, project, issue, foreign_issue
    ):
        response = session_client.post(
            self.get_issue_dates_url(workspace.slug, project.id),
            {
                "updates": [
                    {"id": str(issue.id), "target_date": "2026-03-15"},
                    {"id": str(foreign_issue.id), "target_date": "2026-05-01"},
                ]
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        issue.refresh_from_db()
        foreign_issue.refresh_from_db()
        assert issue.target_date == date(2026, 3, 15)
        assert foreign_issue.target_date == date(2026, 4, 1)
        assert mock_issue_activity_delay.call_count == 1

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_bulk_update_dates_rejects_invalid_date_range(
        self, mock_issue_activity_delay, session_client, workspace, project, issue
    ):
        response = session_client.post(
            self.get_issue_dates_url(workspace.slug, project.id),
            {"updates": [{"id": str(issue.id), "start_date": "2026-03-20", "target_date": "2026-03-10"}]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        issue.refresh_from_db()
        assert issue.start_date == date(2026, 3, 1)
        assert issue.target_date == date(2026, 3, 5)
        mock_issue_activity_delay.assert_not_called()
