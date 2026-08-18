# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.mark.contract
class TestIssueHierarchyEndpoints:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(
            name="Hierarchy Project",
            identifier="HIER",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def state(self, workspace, project):
        return State.objects.create(
            name="Done",
            color="#46A758",
            group="completed",
            default=True,
            workspace=workspace,
            project=project,
        )

    @pytest.fixture
    def other_project(self, workspace, create_user):
        project = Project.objects.create(
            name="Other Hierarchy Project",
            identifier="OHIR",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def other_state(self, workspace, other_project):
        return State.objects.create(
            name="Done",
            color="#46A758",
            group="completed",
            default=True,
            workspace=workspace,
            project=other_project,
        )

    def create_issue(self, *, workspace, project, state, name, parent=None):
        return Issue.objects.create(
            name=name,
            workspace=workspace,
            project=project,
            state=state,
            parent=parent,
        )

    def sub_issues_url(self, workspace, project, parent):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{parent.id}/sub-issues/"

    def archive_url(self, workspace, project, issue):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/archive/"

    @pytest.mark.django_db
    def test_sub_issue_assignment_is_scoped_to_current_project(
        self,
        session_client,
        workspace,
        project,
        state,
        other_project,
        other_state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        foreign_issue = self.create_issue(
            workspace=workspace,
            project=other_project,
            state=other_state,
            name="Foreign",
        )

        response = session_client.post(
            self.sub_issues_url(workspace, project, parent),
            {"sub_issue_ids": [str(foreign_issue.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        foreign_issue.refresh_from_db()
        assert foreign_issue.parent_id is None

    @pytest.mark.django_db
    def test_sub_issue_assignment_rejects_self_reference(
        self,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )

        response = session_client.post(
            self.sub_issues_url(workspace, project, parent),
            {"sub_issue_ids": [str(parent.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_sub_issue_assignment_rejects_cycle_and_more_than_one_level(
        self,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Child",
            parent=parent,
        )
        candidate = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Candidate",
        )

        cycle_response = session_client.post(
            self.sub_issues_url(workspace, project, child),
            {"sub_issue_ids": [str(parent.id)]},
            format="json",
        )
        depth_response = session_client.post(
            self.sub_issues_url(workspace, project, child),
            {"sub_issue_ids": [str(candidate.id)]},
            format="json",
        )

        assert cycle_response.status_code == status.HTTP_400_BAD_REQUEST
        assert cycle_response.data["error"] == "Circular work-item relationships are not allowed"
        assert depth_response.status_code == status.HTTP_400_BAD_REQUEST
        candidate.refresh_from_db()
        assert candidate.parent_id is None

    @pytest.mark.django_db
    def test_regular_issue_patch_cannot_bypass_hierarchy_rules(
        self,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Child",
            parent=parent,
        )
        candidate = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Candidate",
        )

        depth_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{candidate.id}/",
            {"parent_id": str(child.id)},
            format="json",
        )
        cycle_response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{parent.id}/",
            {"parent_id": str(child.id)},
            format="json",
        )

        assert depth_response.status_code == status.HTTP_400_BAD_REQUEST
        assert cycle_response.status_code == status.HTTP_400_BAD_REQUEST
        parent.refresh_from_db()
        candidate.refresh_from_db()
        assert parent.parent_id is None
        assert candidate.parent_id is None

    @pytest.mark.django_db
    @patch("plane.app.views.issue.sub_issue.issue_activity.delay")
    def test_sub_issue_assignment_updates_all_valid_items_atomically(
        self,
        mock_issue_activity,
        django_capture_on_commit_callbacks,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        first_child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="First child",
        )
        second_child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Second child",
        )

        with django_capture_on_commit_callbacks(execute=True):
            response = session_client.post(
                self.sub_issues_url(workspace, project, parent),
                {"sub_issue_ids": [str(first_child.id), str(second_child.id)]},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        first_child.refresh_from_db()
        second_child.refresh_from_db()
        assert first_child.parent_id == parent.id
        assert second_child.parent_id == parent.id
        assert mock_issue_activity.call_count == 2

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_single_delete_soft_deletes_descendants(
        self,
        mock_issue_activity,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Child",
            parent=parent,
        )
        grandchild = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Historical grandchild",
            parent=child,
        )

        response = session_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{parent.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert Issue.all_objects.get(id=parent.id).deleted_at is not None
        assert Issue.all_objects.get(id=child.id).deleted_at is not None
        assert Issue.all_objects.get(id=grandchild.id).deleted_at is not None
        mock_issue_activity.assert_called_once()

    @pytest.mark.django_db
    def test_bulk_delete_soft_deletes_descendants(
        self,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Child",
            parent=parent,
        )

        response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bulk-delete-issues/",
            {"issue_ids": [str(parent.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["selected_count"] == 1
        assert response.data["deleted_count"] == 2
        assert Issue.all_objects.get(id=parent.id).deleted_at is not None
        assert Issue.all_objects.get(id=child.id).deleted_at is not None

    @pytest.mark.django_db
    def test_bulk_delete_rejects_foreign_project_issue(
        self,
        session_client,
        workspace,
        project,
        state,
        other_project,
        other_state,
    ):
        local_issue = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Local",
        )
        foreign_issue = self.create_issue(
            workspace=workspace,
            project=other_project,
            state=other_state,
            name="Foreign",
        )

        response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bulk-delete-issues/",
            {"issue_ids": [str(local_issue.id), str(foreign_issue.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Issue.objects.filter(id=local_issue.id).exists()
        assert Issue.objects.filter(id=foreign_issue.id).exists()

    @pytest.mark.django_db
    @patch("plane.app.views.issue.archive.issue_activity.delay")
    def test_archive_and_restore_preserve_parent_child_visibility(
        self,
        mock_issue_activity,
        session_client,
        workspace,
        project,
        state,
    ):
        parent = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Parent",
        )
        child = self.create_issue(
            workspace=workspace,
            project=project,
            state=state,
            name="Child",
            parent=parent,
        )

        parent_only_response = session_client.post(
            self.archive_url(workspace, project, parent),
            {},
            format="json",
        )
        assert parent_only_response.status_code == status.HTTP_400_BAD_REQUEST

        bulk_response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/bulk-archive-issues/",
            {"issue_ids": [str(parent.id), str(child.id)]},
            format="json",
        )
        assert bulk_response.status_code == status.HTTP_200_OK

        parent.refresh_from_db()
        child.refresh_from_db()
        assert parent.archived_at is not None
        assert child.archived_at is not None

        child_first_response = session_client.delete(self.archive_url(workspace, project, child))
        assert child_first_response.status_code == status.HTTP_400_BAD_REQUEST

        parent_response = session_client.delete(self.archive_url(workspace, project, parent))
        child_response = session_client.delete(self.archive_url(workspace, project, child))
        assert parent_response.status_code == status.HTTP_204_NO_CONTENT
        assert child_response.status_code == status.HTTP_204_NO_CONTENT

        parent.refresh_from_db()
        child.refresh_from_db()
        assert parent.archived_at is None
        assert child.archived_at is None
