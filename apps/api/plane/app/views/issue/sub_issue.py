# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from uuid import UUID

# Django imports
from django.db import transaction
from django.utils import timezone
from django.db.models import OuterRef, Func, F, Q, Value, UUIDField, Subquery
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseAPIView
from plane.app.serializers import IssueSerializer
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import Issue, IssueLink, FileAsset, CycleIssue
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.timezone_converter import user_timezone_converter
from collections import defaultdict
from plane.utils.host import base_host
from plane.utils.order_queryset import order_issue_queryset


class SubIssuesEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    @method_decorator(gzip_page)
    def get(self, request, slug, project_id, issue_id):
        sub_issues = (
            Issue.issue_objects.filter(
                parent_id=issue_id,
                workspace__slug=slug,
                project_id=project_id,
            )
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module")
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & Q(label_issue__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_module__module_id__isnull=True)
                            & Q(issue_module__module__archived_at__isnull=True)
                            & Q(issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .annotate(state_group=F("state__group"))
            .order_by("-created_at")
        )

        # Ordering
        order_by_param = request.GET.get("order_by", "-created_at")
        group_by = request.GET.get("group_by", False)

        if order_by_param:
            sub_issues, order_by_param = order_issue_queryset(sub_issues, order_by_param)

        # create's a dict with state group name with their respective issue id's
        result = defaultdict(list)
        for sub_issue in sub_issues:
            result[sub_issue.state_group].append(str(sub_issue.id))

        sub_issues = sub_issues.values(
            "id",
            "name",
            "state_id",
            "sort_order",
            "completed_at",
            "estimate_point",
            "priority",
            "start_date",
            "target_date",
            "waiting_party",
            "waiting_since",
            "blocked_reason",
            "next_action",
            "sequence_id",
            "project_id",
            "parent_id",
            "cycle_id",
            "module_ids",
            "label_ids",
            "assignee_ids",
            "sub_issues_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "attachment_count",
            "link_count",
            "is_draft",
            "archived_at",
        )
        datetime_fields = ["created_at", "updated_at", "waiting_since"]
        sub_issues = user_timezone_converter(sub_issues, datetime_fields, request.user.user_timezone)
        # Grouping
        if group_by:
            result_dict = defaultdict(list)

            for issue in sub_issues:
                if group_by == "assignees__ids":
                    if issue["assignee_ids"]:
                        assignee_ids = issue["assignee_ids"]
                        for assignee_id in assignee_ids:
                            result_dict[str(assignee_id)].append(issue)
                    elif issue["assignee_ids"] == []:
                        result_dict["None"].append(issue)

                elif group_by:
                    result_dict[str(issue[group_by])].append(issue)

            return Response(
                {"sub_issues": result_dict, "state_distribution": result},
                status=status.HTTP_200_OK,
            )
        return Response(
            {"sub_issues": sub_issues, "state_distribution": result},
            status=status.HTTP_200_OK,
        )

    # Assign multiple sub issues
    def post(self, request, slug, project_id, issue_id):
        sub_issue_ids = request.data.get("sub_issue_ids", [])

        if not isinstance(sub_issue_ids, list) or not sub_issue_ids:
            return Response(
                {"error": "Sub Issue IDs are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            normalized_sub_issue_ids = list(dict.fromkeys(UUID(str(item)) for item in sub_issue_ids))
        except (TypeError, ValueError, AttributeError):
            return Response(
                {"error": "Invalid Sub Issue IDs"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if issue_id in normalized_sub_issue_ids:
            return Response(
                {"error": "A work item cannot be its own sub-work item"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            parent_issue = (
                Issue.issue_objects.select_for_update()
                .filter(
                    pk=issue_id,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                .first()
            )
            if not parent_issue:
                return Response(
                    {"error": "Parent work item not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            sub_issues = list(
                Issue.issue_objects.select_for_update()
                .filter(
                    id__in=normalized_sub_issue_ids,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                .order_by("id")
            )
            if len(sub_issues) != len(normalized_sub_issue_ids):
                return Response(
                    {"error": "All sub-work items must belong to the same workspace and project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            sub_issue_id_set = {sub_issue.id for sub_issue in sub_issues}
            if parent_issue.parent_id in sub_issue_id_set:
                return Response(
                    {"error": "Circular work-item relationships are not allowed"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if parent_issue.parent_id is not None:
                return Response(
                    {"error": "A sub-work item cannot have its own sub-work items"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if Issue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                parent_id__in=sub_issue_id_set,
            ).exists():
                return Response(
                    {"error": "Work-item hierarchy is limited to one level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            previous_parent_ids = {
                str(sub_issue.id): str(sub_issue.parent_id) if sub_issue.parent_id else None for sub_issue in sub_issues
            }

            for sub_issue in sub_issues:
                sub_issue.parent = parent_issue

            Issue.objects.bulk_update(sub_issues, ["parent"], batch_size=10)

            activity_issue_ids = tuple(str(sub_issue.id) for sub_issue in sub_issues)

            def enqueue_activities():
                for sub_issue_id in activity_issue_ids:
                    issue_activity.delay(
                        type="issue.activity.updated",
                        requested_data=json.dumps({"parent": str(issue_id)}),
                        actor_id=str(request.user.id),
                        issue_id=sub_issue_id,
                        project_id=str(project_id),
                        current_instance=json.dumps({"parent": previous_parent_ids[sub_issue_id]}),
                        epoch=int(timezone.now().timestamp()),
                        notification=True,
                        origin=base_host(request=request, is_app=True),
                    )

            transaction.on_commit(enqueue_activities)

        updated_sub_issues = Issue.issue_objects.filter(
            id__in=normalized_sub_issue_ids,
            workspace__slug=slug,
            project_id=project_id,
        ).annotate(state_group=F("state__group"))

        # create's a dict with state group name with their respective issue id's
        result = defaultdict(list)
        for sub_issue in updated_sub_issues:
            result[sub_issue.state_group].append(str(sub_issue.id))

        serializer = IssueSerializer(updated_sub_issues, many=True)
        return Response(
            {"sub_issues": serializer.data, "state_distribution": result},
            status=status.HTTP_200_OK,
        )
