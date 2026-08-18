# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import ExporterHistory, Project, State, User, WorkspaceMember


@pytest.mark.contract
class TestExportIssuesEndpoint:
    @pytest.fixture
    def project(self, workspace):
        return Project.objects.create(
            name="Export Project",
            identifier="EXPT",
            workspace=workspace,
        )

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

    @pytest.mark.django_db
    @patch("plane.app.views.exporter.base.issue_export_task.delay")
    def test_admin_export_persists_rich_filters(
        self,
        mock_export_delay,
        session_client,
        workspace,
        project,
        state,
    ):
        rich_filters = {"and": [{"priority__in": ["high"]}]}

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/export-issues/",
            {
                "provider": "csv",
                "project": [str(project.id)],
                "multiple": False,
                "rich_filters": rich_filters,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        exporter = ExporterHistory.objects.get(workspace=workspace)
        assert exporter.project == [project.id]
        assert exporter.rich_filters == rich_filters
        mock_export_delay.assert_called_once_with(
            provider="csv",
            workspace_id=workspace.id,
            project_ids=[str(project.id)],
            token_id=exporter.token,
            multiple=False,
            slug=workspace.slug,
        )

    @pytest.mark.django_db
    @patch("plane.app.views.exporter.base.issue_export_task.delay")
    def test_invalid_rich_filter_is_rejected_before_queueing(
        self,
        mock_export_delay,
        session_client,
        workspace,
        project,
        state,
    ):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/export-issues/",
            {
                "provider": "csv",
                "project": [str(project.id)],
                "multiple": False,
                "rich_filters": {"private_field__exact": "not-allowed"},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ExporterHistory.objects.filter(workspace=workspace).count() == 0
        mock_export_delay.assert_not_called()

    @pytest.mark.django_db
    def test_member_cannot_export_or_read_export_history(self, workspace, project):
        member = User.objects.create(email="export-member@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        member_client = APIClient()
        member_client.force_authenticate(user=member)
        url = f"/api/workspaces/{workspace.slug}/export-issues/"

        post_response = member_client.post(
            url,
            {
                "provider": "csv",
                "project": [str(project.id)],
                "multiple": False,
                "rich_filters": {},
            },
            format="json",
        )
        get_response = member_client.get(url, {"per_page": 20, "cursor": "0"})

        assert post_response.status_code == status.HTTP_403_FORBIDDEN
        assert get_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    @patch("plane.app.views.exporter.base.issue_export_task.delay")
    def test_project_must_belong_to_export_workspace(
        self,
        mock_export_delay,
        session_client,
        workspace,
        project,
    ):
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/export-issues/",
            {
                "provider": "csv",
                "project": ["00000000-0000-0000-0000-000000000001"],
                "multiple": False,
                "rich_filters": {},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ExporterHistory.objects.filter(workspace=workspace).count() == 0
        mock_export_delay.assert_not_called()
