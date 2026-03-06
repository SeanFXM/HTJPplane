# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from datetime import date

import pytest

from plane.bgtasks.notification_task import notifications
from plane.db.models import (
    Issue,
    IssueAssignee,
    Notification,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.mark.unit
class TestNotificationTask:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Notification Project", identifier="NTP", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def assignee(self, workspace, project):
        user = User.objects.create_user(email="assignee@example.com", username="assignee")
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
        ProjectMember.objects.create(project=project, member=user, role=15)
        return user

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
    def issue(self, workspace, project, state, create_user, assignee):
        issue = Issue.objects.create(
            name="Notification Issue",
            workspace=workspace,
            project=project,
            state=state,
            created_by_id=create_user.id,
            target_date=date(2026, 3, 5),
        )
        IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project, workspace=workspace)
        return issue

    @pytest.mark.django_db
    def test_notifications_include_assignee_without_existing_subscription(
        self, create_user, project, issue, assignee
    ):
        notifications.run(
            type="issue.activity.updated",
            issue_id=str(issue.id),
            project_id=str(project.id),
            actor_id=str(create_user.id),
            subscriber=True,
            issue_activities_created=json.dumps(
                [
                    {
                        "id": "activity-id",
                        "field": "target_date",
                        "verb": "updated",
                        "comment": "updated the target date to",
                        "actor_id": str(create_user.id),
                        "new_value": "2026-03-10",
                        "old_value": "2026-03-05",
                        "issue_comment": None,
                        "old_identifier": None,
                        "new_identifier": None,
                        "created_at": "2026-03-01T00:00:00Z",
                        "issue_detail": {"id": str(issue.id)},
                    }
                ]
            ),
            requested_data=json.dumps({"target_date": "2026-03-10"}),
            current_instance=json.dumps({"target_date": "2026-03-05"}),
        )

        notification = Notification.objects.filter(receiver=assignee, entity_identifier=issue.id).first()
        assert notification is not None
        assert notification.sender == "in_app:issue_activities:assigned"
