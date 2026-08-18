# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Utilities for keeping work-item hierarchies internally consistent."""

from collections.abc import Iterable
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from plane.bgtasks.deletion_task import soft_delete_related_objects
from plane.db.models import CycleIssue, Issue, ModuleIssue


def get_issue_tree_ids(*, workspace_slug: str, project_id: UUID, root_ids: Iterable[UUID]) -> set[UUID]:
    """Return active roots and all of their active descendants within a project."""
    tree_ids = set(root_ids)
    frontier = set(tree_ids)

    while frontier:
        child_ids = set(
            Issue.objects.filter(
                workspace__slug=workspace_slug,
                project_id=project_id,
                parent_id__in=frontier,
            ).values_list("id", flat=True)
        )
        frontier = child_ids - tree_ids
        tree_ids.update(frontier)

    return tree_ids


def soft_delete_issue_trees(*, workspace_slug: str, project_id: UUID, root_ids: Iterable[UUID]) -> set[UUID]:
    """Soft-delete selected work items and their descendants as one transaction.

    Related records are hidden immediately where they are frequently queried and
    the existing cascade task is queued for every deleted work item after commit.
    Queuing every item is important because the default related manager no longer
    sees a child once the child itself has been soft-deleted.
    """
    requested_ids = set(root_ids)
    if not requested_ids:
        return set()

    with transaction.atomic():
        scoped_root_ids = set(
            Issue.objects.select_for_update()
            .filter(
                workspace__slug=workspace_slug,
                project_id=project_id,
                id__in=requested_ids,
            )
            .values_list("id", flat=True)
        )
        issue_ids = get_issue_tree_ids(
            workspace_slug=workspace_slug,
            project_id=project_id,
            root_ids=scoped_root_ids,
        )
        if not issue_ids:
            return set()

        deleted_at = timezone.now()
        # Keep one deletion timestamp across the hierarchy and its direct
        # memberships. Restore logic uses this timestamp to distinguish the
        # cascade from relations that were deleted independently beforehand.
        CycleIssue.objects.filter(issue_id__in=issue_ids).update(deleted_at=deleted_at)
        ModuleIssue.objects.filter(issue_id__in=issue_ids).update(deleted_at=deleted_at)
        Issue.objects.filter(id__in=issue_ids).update(deleted_at=deleted_at)

        deleted_ids = tuple(issue_ids)

        def enqueue_related_deletions():
            for issue_id in deleted_ids:
                soft_delete_related_objects.delay("db", "issue", issue_id)

        transaction.on_commit(enqueue_related_deletions)

    return issue_ids
