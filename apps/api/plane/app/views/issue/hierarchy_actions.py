# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from collections import defaultdict

from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from plane.app.permissions import ROLE
from plane.app.serializers import IssueSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, ProjectMember, WorkspaceMember

SUB_ISSUE_STRATEGY_RELEASE = "release"
SUB_ISSUE_STRATEGY_CASCADE_DELETE = "cascade_delete"
SUB_ISSUE_STRATEGY_CASCADE_ARCHIVE = "cascade_archive"


def get_sub_issue_strategy(request):
    return request.data.get("sub_issue_strategy") or request.query_params.get("sub_issue_strategy")


def validate_sub_issue_strategy(strategy, allowed_strategies):
    if strategy is None:
        return None
    if strategy not in allowed_strategies:
        raise ValidationError(
            {
                "error": "Invalid sub_issue_strategy",
                "allowed_values": allowed_strategies,
            }
        )
    return strategy


def collect_direct_children(workspace_slug, parent_ids):
    direct_children = defaultdict(list)
    if not parent_ids:
        return direct_children

    for issue in (
        Issue.issue_objects.filter(workspace__slug=workspace_slug, parent_id__in=parent_ids)
        .select_related("state")
        .order_by("created_at")
    ):
        direct_children[str(issue.parent_id)].append(issue)

    return direct_children


def collect_descendants(workspace_slug, root_issue_ids):
    descendants = {}
    frontier = [str(issue_id) for issue_id in root_issue_ids]

    while frontier:
        children = (
            Issue.issue_objects.filter(workspace__slug=workspace_slug, parent_id__in=frontier)
            .select_related("state")
            .order_by("created_at")
        )
        frontier = []
        for child in children:
            child_id = str(child.id)
            if child_id in descendants:
                continue
            descendants[child_id] = child
            frontier.append(child_id)

    return descendants


def ensure_strategy_when_children_exist(strategy, direct_children_map, allowed_strategies):
    has_children = any(len(children) > 0 for children in direct_children_map.values())
    if has_children and strategy is None:
        raise ValidationError(
            {
                "error": "sub_issue_strategy is required when deleting or archiving a parent issue with children",
                "allowed_values": allowed_strategies,
            }
        )
    return has_children


def ensure_manage_permissions_for_projects(user, workspace_slug, project_ids):
    normalized_project_ids = {str(project_id) for project_id in project_ids if project_id}
    if not normalized_project_ids:
        return

    is_workspace_admin = WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()

    if is_workspace_admin:
        return

    allowed_project_ids = set(
        str(project_id)
        for project_id in ProjectMember.objects.filter(
            member=user,
            workspace__slug=workspace_slug,
            project_id__in=normalized_project_ids,
            role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            is_active=True,
        ).values_list("project_id", flat=True)
    )

    if normalized_project_ids - allowed_project_ids:
        raise PermissionDenied("You don't have the required permissions to update related sub issues.")


def release_direct_children(children, actor, origin):
    if not children:
        return []

    now = timezone.now()
    released_ids = []

    for child in children:
        current_instance = IssueSerializer(child).data
        child.parent = None
        child.updated_by_id = actor.id
        child.updated_at = now
        released_ids.append(str(child.id))
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"parent": None}),
            actor_id=str(actor.id),
            issue_id=str(child.id),
            project_id=str(child.project_id),
            current_instance=json.dumps(current_instance, cls=DjangoJSONEncoder),
            epoch=int(now.timestamp()),
            notification=True,
            origin=origin,
        )

    Issue.objects.bulk_update(children, ["parent", "updated_by", "updated_at"])
    return released_ids


def archive_issues(issues, actor, origin, archived_at):
    if not issues:
        return []

    archived_ids = []
    for issue in issues:
        current_instance = IssueSerializer(issue).data
        issue.archived_at = archived_at
        issue.updated_by_id = actor.id
        issue.updated_at = timezone.now()
        archived_ids.append(str(issue.id))
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"archived_at": str(archived_at), "automation": False}),
            actor_id=str(actor.id),
            issue_id=str(issue.id),
            project_id=str(issue.project_id),
            current_instance=json.dumps(current_instance, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=origin,
        )

    Issue.objects.bulk_update(issues, ["archived_at", "updated_by", "updated_at"])
    return archived_ids


def validate_archivable_issues(issues):
    invalid_issue_ids = [str(issue.id) for issue in issues if issue.state.group not in ["completed", "cancelled"]]
    if invalid_issue_ids:
        raise ValidationError(
            {
                "error_code": "INVALID_ARCHIVE_STATE_GROUP",
                "error_message": "INVALID_ARCHIVE_STATE_GROUP",
                "issue_ids": invalid_issue_ids,
            }
        )


def emit_delete_activities(issue_ids, actor, origin, issue_project_map):
    epoch = int(timezone.now().timestamp())
    for issue_id in issue_ids:
        issue_activity.delay(
            type="issue.activity.deleted",
            requested_data=json.dumps({"issue_id": str(issue_id)}),
            actor_id=str(actor.id),
            issue_id=str(issue_id),
            project_id=str(issue_project_map.get(str(issue_id), "")),
            current_instance={},
            epoch=epoch,
            notification=True,
            origin=origin,
            subscriber=False,
        )
