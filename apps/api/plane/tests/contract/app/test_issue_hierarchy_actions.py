# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.mark.contract
class TestIssueHierarchyActions:
    def get_issue_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/"

    def get_archive_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/archive/"

    def get_bulk_delete_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/bulk-delete-issues/"

    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(name="Hierarchy Project", identifier="HIR", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def done_state(self, workspace, project):
        return State.objects.create(
            name="Done",
            color="#16A34A",
            group="completed",
            default=True,
            workspace=workspace,
            project=project,
        )

    @pytest.fixture
    def todo_state(self, workspace, project):
        return State.objects.create(
            name="Todo",
            color="#60646C",
            group="unstarted",
            default=False,
            workspace=workspace,
            project=project,
        )

    @pytest.fixture
    def parent_issue(self, workspace, project, done_state, create_user):
        return Issue.objects.create(
            name="Parent Issue",
            workspace=workspace,
            project=project,
            state=done_state,
            created_by_id=create_user.id,
        )

    @pytest.fixture
    def child_issue(self, workspace, project, done_state, create_user, parent_issue):
        return Issue.objects.create(
            name="Child Issue",
            workspace=workspace,
            project=project,
            state=done_state,
            parent=parent_issue,
            created_by_id=create_user.id,
        )

    @pytest.fixture
    def grandchild_issue(self, workspace, project, done_state, create_user, child_issue):
        return Issue.objects.create(
            name="Grandchild Issue",
            workspace=workspace,
            project=project,
            state=done_state,
            parent=child_issue,
            created_by_id=create_user.id,
        )

    @pytest.mark.django_db
    def test_delete_parent_requires_strategy_when_children_exist(
        self, session_client, workspace, project, parent_issue, child_issue
    ):
        response = session_client.delete(self.get_issue_url(workspace.slug, project.id, parent_issue.id), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sub_issue_strategy" in str(response.data)

    @pytest.mark.django_db
    @patch("plane.app.views.issue.hierarchy_actions.issue_activity.delay")
    def test_delete_parent_release_keeps_children_and_preserves_nested_chain(
        self,
        mock_issue_activity_delay,
        session_client,
        workspace,
        project,
        parent_issue,
        child_issue,
        grandchild_issue,
    ):
        response = session_client.delete(
            self.get_issue_url(workspace.slug, project.id, parent_issue.id),
            {"sub_issue_strategy": "release"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert str(parent_issue.id) in response.data["deleted_issue_ids"]
        assert response.data["released_sub_issue_ids"] == [str(child_issue.id)]

        assert not Issue.all_objects.filter(pk=parent_issue.id, deleted_at__isnull=True).exists()

        child_issue.refresh_from_db()
        grandchild_issue.refresh_from_db()
        assert child_issue.parent_id is None
        assert grandchild_issue.parent_id == child_issue.id
        assert mock_issue_activity_delay.call_count >= 2

    @pytest.mark.django_db
    @patch("plane.app.views.issue.hierarchy_actions.issue_activity.delay")
    def test_archive_parent_cascade_archives_descendants(
        self,
        mock_issue_activity_delay,
        session_client,
        workspace,
        project,
        parent_issue,
        child_issue,
        grandchild_issue,
    ):
        response = session_client.post(
            self.get_archive_url(workspace.slug, project.id, parent_issue.id),
            {"sub_issue_strategy": "cascade_archive"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        parent_issue.refresh_from_db()
        child_issue.refresh_from_db()
        grandchild_issue.refresh_from_db()

        assert parent_issue.archived_at is not None
        assert child_issue.archived_at is not None
        assert grandchild_issue.archived_at is not None
        assert set(response.data["archived_issue_ids"]) == {
            str(parent_issue.id),
            str(child_issue.id),
            str(grandchild_issue.id),
        }
        assert mock_issue_activity_delay.call_count == 3

    @pytest.mark.django_db
    @patch("plane.app.views.issue.hierarchy_actions.issue_activity.delay")
    def test_bulk_delete_release_only_releases_non_selected_direct_children(
        self,
        mock_issue_activity_delay,
        session_client,
        workspace,
        project,
        parent_issue,
        child_issue,
        grandchild_issue,
    ):
        response = session_client.delete(
            self.get_bulk_delete_url(workspace.slug, project.id),
            {
                "issue_ids": [str(parent_issue.id)],
                "sub_issue_strategy": "release",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        child_issue.refresh_from_db()
        grandchild_issue.refresh_from_db()

        assert child_issue.parent_id is None
        assert grandchild_issue.parent_id == child_issue.id
        assert str(parent_issue.id) in response.data["deleted_issue_ids"]
        assert response.data["released_sub_issue_ids"] == [str(child_issue.id)]
        assert mock_issue_activity_delay.call_count >= 2

    @pytest.mark.django_db
    def test_archive_release_only_requires_parent_state_to_be_archivable(
        self, session_client, workspace, project, parent_issue, child_issue, todo_state
    ):
        child_issue.state = todo_state
        child_issue.save(update_fields=["state"])

        response = session_client.post(
            self.get_archive_url(workspace.slug, project.id, parent_issue.id),
            {"sub_issue_strategy": "release"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        child_issue.refresh_from_db()
        assert child_issue.parent_id is None
        assert child_issue.archived_at is None
