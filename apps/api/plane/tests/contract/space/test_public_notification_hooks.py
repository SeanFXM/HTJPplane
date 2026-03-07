# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    DeployBoard,
    Intake,
    IntakeIssue,
    Issue,
    IssueComment,
    Project,
    ProjectMember,
    State,
)


@pytest.mark.contract
class TestPublicNotificationHooks:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Public Board Project", identifier="PBP", workspace=workspace)
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
            name="Public Issue",
            workspace=workspace,
            project=project,
            state=state,
            created_by_id=create_user.id,
        )

    @pytest.fixture
    def deploy_board(self, workspace, project):
        return DeployBoard.objects.create(
            workspace=workspace,
            project=project,
            entity_identifier=project.id,
            entity_name="project",
            is_comments_enabled=True,
        )

    @pytest.fixture
    def intake(self, workspace, project):
        return Intake.objects.create(
            workspace=workspace,
            project=project,
            name="Public Intake",
        )

    @pytest.fixture
    def intake_deploy_board(self, deploy_board, intake):
        deploy_board.intake = intake
        deploy_board.save(update_fields=["intake"])
        return deploy_board

    @pytest.fixture
    def intake_issue(self, workspace, project, issue, intake, create_user):
        return IntakeIssue.objects.create(
            workspace=workspace,
            project=project,
            intake=intake,
            issue=issue,
            created_by_id=create_user.id,
        )

    def get_public_comment_url(self, anchor, issue_id):
        return f"/api/public/anchor/{anchor}/issues/{issue_id}/comments/"

    def get_public_comment_detail_url(self, anchor, issue_id, comment_id):
        return f"/api/public/anchor/{anchor}/issues/{issue_id}/comments/{comment_id}/"

    def get_public_intake_url(self, anchor, intake_id):
        return f"/api/public/anchor/{anchor}/intakes/{intake_id}/intake-issues/"

    def get_public_intake_detail_url(self, anchor, intake_id, intake_issue_id):
        return f"/api/public/anchor/{anchor}/intakes/{intake_id}/intake-issues/{intake_issue_id}/"

    @pytest.mark.django_db
    @patch("plane.space.views.issue.base_host", return_value="https://app.test")
    @patch("plane.space.views.issue.issue_activity.delay")
    def test_public_comment_create_enables_notifications(
        self, mock_issue_activity_delay, mock_base_host, session_client, deploy_board, issue
    ):
        response = session_client.post(
            self.get_public_comment_url(deploy_board.anchor, issue.id),
            {"comment_html": "<p>@mention</p>", "comment_json": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        mock_base_host.assert_called_once()
        mock_issue_activity_delay.assert_called_once()
        assert mock_issue_activity_delay.call_args.kwargs["notification"] is True
        assert mock_issue_activity_delay.call_args.kwargs["origin"] == "https://app.test"

    @pytest.mark.django_db
    @patch("plane.space.views.issue.base_host", return_value="https://app.test")
    @patch("plane.space.views.issue.issue_activity.delay")
    def test_public_comment_update_enables_notifications(
        self, mock_issue_activity_delay, mock_base_host, session_client, deploy_board, issue, create_user
    ):
        comment = IssueComment.objects.create(
            workspace=issue.workspace,
            project=issue.project,
            issue=issue,
            actor=create_user,
            access="EXTERNAL",
            comment_html="<p>Before</p>",
        )

        response = session_client.patch(
            self.get_public_comment_detail_url(deploy_board.anchor, issue.id, comment.id),
            {"comment_html": "<p>After</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_base_host.assert_called_once()
        mock_issue_activity_delay.assert_called_once()
        assert mock_issue_activity_delay.call_args.kwargs["notification"] is True
        assert mock_issue_activity_delay.call_args.kwargs["origin"] == "https://app.test"

    @pytest.mark.django_db
    @patch("plane.space.views.issue.base_host", return_value="https://app.test")
    @patch("plane.space.views.issue.issue_activity.delay")
    def test_public_comment_delete_enables_notifications(
        self, mock_issue_activity_delay, mock_base_host, session_client, deploy_board, issue, create_user
    ):
        comment = IssueComment.objects.create(
            workspace=issue.workspace,
            project=issue.project,
            issue=issue,
            actor=create_user,
            access="EXTERNAL",
            comment_html="<p>Delete me</p>",
        )

        response = session_client.delete(self.get_public_comment_detail_url(deploy_board.anchor, issue.id, comment.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_base_host.assert_called_once()
        mock_issue_activity_delay.assert_called_once()
        assert mock_issue_activity_delay.call_args.kwargs["notification"] is True
        assert mock_issue_activity_delay.call_args.kwargs["origin"] == "https://app.test"

    @pytest.mark.django_db
    @patch("plane.space.views.intake.base_host", return_value="https://app.test")
    @patch("plane.space.views.intake.issue_activity.delay")
    def test_public_intake_create_enables_notifications(
        self, mock_issue_activity_delay, mock_base_host, session_client, intake_deploy_board, intake
    ):
        response = session_client.post(
            self.get_public_intake_url(intake_deploy_board.anchor, intake.id),
            {"issue": {"name": "Inbox issue", "description_html": "<p>Hello</p>", "description_json": {}}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_base_host.assert_called_once()
        mock_issue_activity_delay.assert_called_once()
        assert mock_issue_activity_delay.call_args.kwargs["notification"] is True
        assert mock_issue_activity_delay.call_args.kwargs["origin"] == "https://app.test"

    @pytest.mark.django_db
    @patch("plane.space.views.intake.base_host", return_value="https://app.test")
    @patch("plane.space.views.intake.issue_activity.delay")
    def test_public_intake_update_enables_notifications(
        self,
        mock_issue_activity_delay,
        mock_base_host,
        session_client,
        intake_deploy_board,
        intake,
        intake_issue,
    ):
        response = session_client.patch(
            self.get_public_intake_detail_url(intake_deploy_board.anchor, intake.id, intake_issue.id),
            {"issue": {"name": "Updated inbox issue", "description_html": "<p>Updated</p>", "description_json": {}}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_base_host.assert_called_once()
        mock_issue_activity_delay.assert_called_once()
        assert mock_issue_activity_delay.call_args.kwargs["notification"] is True
        assert mock_issue_activity_delay.call_args.kwargs["origin"] == "https://app.test"
