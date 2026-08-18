# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.bgtasks.deletion_task import restore_related_objects
from plane.db.models import Cycle, CycleIssue, Issue, Project, ProjectMember, State


@pytest.mark.unit
class TestRestoreRelatedObjects:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(
            name="Restore Project",
            identifier="RSTR",
            workspace=workspace,
        )
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

    @pytest.mark.django_db
    def test_restores_descendants_deleted_by_same_cascade(self, workspace, project, state):
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
        deleted_at = timezone.now()
        Issue.objects.filter(id=parent.id).update(deleted_at=deleted_at)
        Issue.objects.filter(id=child.id).update(deleted_at=deleted_at + timedelta(seconds=1))

        restore_related_objects("db", "issue", parent.id)

        assert Issue.all_objects.get(id=parent.id).deleted_at is None
        assert Issue.all_objects.get(id=child.id).deleted_at is None

    @pytest.mark.django_db
    def test_does_not_restore_relation_deleted_before_parent(self, workspace, project, state):
        parent = Issue.objects.create(
            name="Parent",
            workspace=workspace,
            project=project,
            state=state,
        )
        child = Issue.objects.create(
            name="Independently deleted child",
            workspace=workspace,
            project=project,
            state=state,
            parent=parent,
        )
        deleted_at = timezone.now()
        Issue.objects.filter(id=child.id).update(deleted_at=deleted_at - timedelta(minutes=1))
        Issue.objects.filter(id=parent.id).update(deleted_at=deleted_at)

        restore_related_objects("db", "issue", parent.id)

        assert Issue.all_objects.get(id=parent.id).deleted_at is None
        assert Issue.all_objects.get(id=child.id).deleted_at is not None

    @pytest.mark.django_db
    def test_restores_memberships_deleted_with_issue_tree(
        self,
        workspace,
        project,
        state,
        create_user,
    ):
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
        cycle = Cycle.objects.create(
            name="Restore cycle",
            workspace=workspace,
            project=project,
            owned_by=create_user,
        )
        cycle_issue = CycleIssue.objects.create(
            workspace=workspace,
            project=project,
            cycle=cycle,
            issue=child,
        )
        deleted_at = timezone.now()
        Issue.objects.filter(id__in=[parent.id, child.id]).update(deleted_at=deleted_at)
        CycleIssue.objects.filter(id=cycle_issue.id).update(deleted_at=deleted_at)

        restore_related_objects("db", "issue", parent.id)

        assert Issue.all_objects.get(id=parent.id).deleted_at is None
        assert Issue.all_objects.get(id=child.id).deleted_at is None
        assert CycleIssue.all_objects.get(id=cycle_issue.id).deleted_at is None
