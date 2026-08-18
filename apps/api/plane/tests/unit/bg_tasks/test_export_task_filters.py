# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.bgtasks.export_task import apply_export_rich_filters
from plane.db.models import Issue, IssueAssignee, Project, State, User
from plane.utils.porters.serializers.issue import IssueExportSerializer


@pytest.mark.unit
class TestExportTaskFilters:
    @pytest.fixture
    def project(self, workspace):
        return Project.objects.create(
            name="Filtered Export Project",
            identifier="FEXP",
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
    def test_applies_saved_rich_filters_to_export_queryset(self, workspace, project, state):
        high_priority_issue = Issue.objects.create(
            name="High priority",
            priority="high",
            workspace=workspace,
            project=project,
            state=state,
        )
        Issue.objects.create(
            name="Low priority",
            priority="low",
            workspace=workspace,
            project=project,
            state=state,
        )

        filtered_queryset = apply_export_rich_filters(
            Issue.objects.filter(workspace=workspace, project=project),
            {"and": [{"priority__in": ["high"]}]},
        )

        assert list(filtered_queryset.values_list("id", flat=True)) == [high_priority_issue.id]

    @pytest.mark.django_db
    def test_export_includes_only_current_owner(self, workspace, project, state, create_user):
        issue = Issue.objects.create(
            name="Transferred issue",
            workspace=workspace,
            project=project,
            state=state,
        )
        next_owner = User.objects.create(
            email="export-next-owner@example.com",
            username="export-next-owner",
            first_name="Next",
            last_name="Owner",
        )
        previous_assignment = IssueAssignee.objects.create(
            issue=issue,
            assignee=create_user,
            workspace=workspace,
            project=project,
        )
        IssueAssignee.objects.filter(id=previous_assignment.id).delete()
        IssueAssignee.objects.create(
            issue=issue,
            assignee=next_owner,
            workspace=workspace,
            project=project,
        )

        assert IssueExportSerializer(issue).data["assignees"] == [next_owner.full_name]
