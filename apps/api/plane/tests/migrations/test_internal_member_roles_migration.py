# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_internal_member_roles_migration_promotes_legacy_roles_and_enforces_constraints():
    migrate_from = [("db", "0127_workspacecalendarevent")]
    migrate_to = [("db", "0128_retire_guest_role")]

    executor = MigrationExecutor(connection)
    latest_targets = executor.loader.graph.leaf_nodes("db")

    try:
        executor.migrate(migrate_from)
        old_apps = executor.loader.project_state(migrate_from).apps

        User = old_apps.get_model("db", "User")
        Workspace = old_apps.get_model("db", "Workspace")
        WorkspaceMember = old_apps.get_model("db", "WorkspaceMember")
        WorkspaceMemberInvite = old_apps.get_model("db", "WorkspaceMemberInvite")
        Project = old_apps.get_model("db", "Project")
        ProjectMember = old_apps.get_model("db", "ProjectMember")
        ProjectMemberInvite = old_apps.get_model("db", "ProjectMemberInvite")

        owner = User.objects.create(username="role-migration-owner", email="role-owner@example.com")
        legacy_guest = User.objects.create(username="role-migration-guest", email="role-guest@example.com")
        legacy_viewer = User.objects.create(username="role-migration-viewer", email="role-viewer@example.com")
        workspace = Workspace.objects.create(name="Role migration", slug="role-migration", owner=owner)
        project = Project.objects.create(
            name="Role migration project",
            identifier="ROLE",
            workspace=workspace,
            guest_view_all_features=True,
        )

        workspace_guest = WorkspaceMember._base_manager.create(
            workspace=workspace,
            member=legacy_guest,
            role=5,
        )
        workspace_viewer = WorkspaceMember._base_manager.create(
            workspace=workspace,
            member=legacy_viewer,
            role=10,
            deleted_at=timezone.now(),
        )
        workspace_invite = WorkspaceMemberInvite._base_manager.create(
            workspace=workspace,
            email="pending-role@example.com",
            token="workspace-token",
            role=5,
        )
        project_guest = ProjectMember._base_manager.create(
            workspace=workspace,
            project=project,
            member=legacy_guest,
            role=5,
        )
        project_invite = ProjectMemberInvite._base_manager.create(
            workspace=workspace,
            project=project,
            email="project-role@example.com",
            token="project-token",
            role=10,
            deleted_at=timezone.now(),
        )

        executor = MigrationExecutor(connection)
        executor.migrate(migrate_to)
        new_apps = executor.loader.project_state(migrate_to).apps

        MigratedWorkspaceMember = new_apps.get_model("db", "WorkspaceMember")
        MigratedWorkspaceMemberInvite = new_apps.get_model("db", "WorkspaceMemberInvite")
        MigratedProject = new_apps.get_model("db", "Project")
        MigratedProjectMember = new_apps.get_model("db", "ProjectMember")
        MigratedProjectMemberInvite = new_apps.get_model("db", "ProjectMemberInvite")

        migrated_rows = (
            (MigratedWorkspaceMember, workspace_guest.id),
            (MigratedWorkspaceMember, workspace_viewer.id),
            (MigratedWorkspaceMemberInvite, workspace_invite.id),
            (MigratedProjectMember, project_guest.id),
            (MigratedProjectMemberInvite, project_invite.id),
        )
        for model, row_id in migrated_rows:
            assert model._base_manager.values_list("role", flat=True).get(pk=row_id) == 15
            with pytest.raises(IntegrityError):
                with transaction.atomic():
                    model._base_manager.filter(pk=row_id).update(role=5)

        assert MigratedProject._base_manager.values_list("guest_view_all_features", flat=True).get(pk=project.id) is False
    finally:
        MigrationExecutor(connection).migrate(latest_targets)
