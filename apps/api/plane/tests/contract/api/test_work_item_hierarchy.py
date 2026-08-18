# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State


@pytest.mark.contract
class TestExternalWorkItemHierarchy:
    @pytest.mark.django_db
    def test_delete_synchronously_hides_descendants(
        self,
        api_key_client,
        workspace,
        create_user,
    ):
        project = Project.objects.create(
            name="External API project",
            identifier="EXT",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        state = State.objects.create(
            name="In progress",
            color="#3F76FF",
            group="started",
            default=True,
            workspace=workspace,
            project=project,
        )
        parent = Issue.objects.create(
            name="Parent",
            workspace=workspace,
            project=project,
            state=state,
        )
        child = Issue.objects.create(
            name="Child",
            workspace=workspace,
            project=project,
            state=state,
            parent=parent,
        )

        with (
            patch("plane.api.views.issue.issue_activity.delay"),
            patch("plane.utils.issue_hierarchy.soft_delete_related_objects.delay"),
        ):
            response = api_key_client.delete(
                f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/{parent.id}/"
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert Issue.all_objects.get(id=parent.id).deleted_at is not None
        assert Issue.all_objects.get(id=child.id).deleted_at is not None
        assert not Issue.issue_objects.filter(id__in=[parent.id, child.id]).exists()
