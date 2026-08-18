# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_single_current_owner_migration_keeps_latest_assignment():
    migrate_from = [("db", "0124_profile_theme_callable_default")]
    migrate_to = [("db", "0125_single_current_issue_owner")]

    executor = MigrationExecutor(connection)
    latest_targets = executor.loader.graph.leaf_nodes("db")

    try:
        executor.migrate(migrate_from)
        old_apps = executor.loader.project_state(migrate_from).apps

        User = old_apps.get_model("db", "User")
        Workspace = old_apps.get_model("db", "Workspace")
        Project = old_apps.get_model("db", "Project")
        Issue = old_apps.get_model("db", "Issue")
        IssueAssignee = old_apps.get_model("db", "IssueAssignee")

        owner = User.objects.create(username="migration-owner", email="migration-owner@example.com")
        latest_owner = User.objects.create(username="migration-latest", email="migration-latest@example.com")
        workspace = Workspace.objects.create(name="Migration workspace", slug="migration-workspace", owner=owner)
        project = Project.objects.create(name="Migration project", identifier="MIG", workspace=workspace)
        issue = Issue._base_manager.create(name="Duplicate owner issue", workspace=workspace, project=project)

        previous_assignment = IssueAssignee.objects.create(
            issue=issue,
            assignee=owner,
            workspace=workspace,
            project=project,
        )
        latest_assignment = IssueAssignee.objects.create(
            issue=issue,
            assignee=latest_owner,
            workspace=workspace,
            project=project,
        )
        now = timezone.now()
        IssueAssignee.objects.filter(pk=previous_assignment.pk).update(updated_at=now - timedelta(minutes=1))
        IssueAssignee.objects.filter(pk=latest_assignment.pk).update(updated_at=now)

        executor = MigrationExecutor(connection)
        executor.migrate(migrate_to)
        new_apps = executor.loader.project_state(migrate_to).apps
        MigratedIssueAssignee = new_apps.get_model("db", "IssueAssignee")

        active_assignment_ids = list(
            MigratedIssueAssignee.objects.filter(issue_id=issue.id, deleted_at__isnull=True).values_list(
                "id", flat=True
            )
        )
        previous_deleted_at = MigratedIssueAssignee.objects.values_list("deleted_at", flat=True).get(
            pk=previous_assignment.pk
        )

        assert active_assignment_ids == [latest_assignment.id]
        assert previous_deleted_at is not None
    finally:
        # Leave the schema at the current leaf even if an assertion above fails.
        MigrationExecutor(connection).migrate(latest_targets)
