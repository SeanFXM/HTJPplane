# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State, User


@pytest.mark.contract
class TestUserProfileCurrentOwner:
    @pytest.mark.django_db
    def test_transferred_issue_is_not_counted_for_previous_owner(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project = Project.objects.create(
            name="Profile ownership",
            identifier="PROF",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        next_owner = User.objects.create(
            email="profile-next-owner@example.com",
            first_name="Next",
            last_name="Owner",
        )
        ProjectMember.objects.create(project=project, member=next_owner, role=15)
        state = State.objects.create(
            name="Completed",
            color="#3F76FF",
            group="completed",
            default=True,
            workspace=workspace,
            project=project,
        )
        issue = Issue(
            name="Transferred task",
            workspace=workspace,
            project=project,
            state=state,
        )
        issue.save(created_by_id=create_user.id)
        previous_assignment = IssueAssignee.objects.create(
            issue=issue,
            assignee=create_user,
            workspace=workspace,
            project=project,
        )
        IssueAssignee.objects.filter(id=previous_assignment.id).update(deleted_at=timezone.now())
        IssueAssignee.objects.create(
            issue=issue,
            assignee=next_owner,
            workspace=workspace,
            project=project,
        )

        profile_response = session_client.get(
            f"/api/workspaces/{workspace.slug}/user-profile/{create_user.id}/"
        )
        stats_response = session_client.get(f"/api/workspaces/{workspace.slug}/user-stats/{create_user.id}/")
        completed_graph_response = session_client.get(
            f"/api/users/me/workspaces/{workspace.slug}/issues-completed-graph/"
        )

        assert profile_response.status_code == status.HTTP_200_OK
        project_data = profile_response.data["project_data"][0]
        assert project_data["created_issues"] == 1
        assert project_data["assigned_issues"] == 0
        assert project_data["completed_issues"] == 0
        assert project_data["pending_issues"] == 0

        assert stats_response.status_code == status.HTTP_200_OK
        assert stats_response.data["assigned_issues"] == 0
        assert stats_response.data["completed_issues"] == 0
        assert stats_response.data["pending_issues"] == 0
        assert stats_response.data["state_distribution"] == []
        assert stats_response.data["priority_distribution"] == []

        assert completed_graph_response.status_code == status.HTTP_200_OK
        assert completed_graph_response.data == []
