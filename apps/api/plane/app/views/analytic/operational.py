# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

from django.db.models import Case, Count, Exists, IntegerField, OuterRef, Q, Value, When
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, IssueAssignee


ISSUE_SUMMARY_FIELDS = (
    "id",
    "name",
    "project_id",
    "project__identifier",
    "project__name",
    "sequence_id",
    "priority",
    "state__name",
    "state__group",
    "start_date",
    "target_date",
    "waiting_party",
    "waiting_since",
    "blocked_reason",
    "next_action",
    "updated_at",
)


class OperationalReportEndpoint(BaseAPIView):
    """Action-oriented workspace report for Hotone Japan's daily operations."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.localdate()
        due_soon_end = today + timedelta(days=6)
        stale_before = timezone.now() - timedelta(days=30)

        priority_rank = Case(
            When(priority="urgent", then=Value(0)),
            When(priority="high", then=Value(1)),
            When(priority="medium", then=Value(2)),
            When(priority="low", then=Value(3)),
            default=Value(4),
            output_field=IntegerField(),
        )

        active_issues = (
            Issue.issue_objects.filter(workspace__slug=slug)
            .exclude(state__group__in=["completed", "cancelled"])
            .select_related("project", "state")
            .annotate(
                priority_rank=priority_rank,
                has_current_owner=Exists(IssueAssignee.objects.filter(issue_id=OuterRef("pk"))),
            )
        )

        overdue = active_issues.filter(target_date__lt=today).order_by("priority_rank", "target_date", "created_at")
        due_soon = active_issues.filter(target_date__range=(today, due_soon_end)).order_by(
            "target_date", "priority_rank", "created_at"
        )
        unassigned = active_issues.filter(has_current_owner=False).order_by(
            "priority_rank", "target_date", "created_at"
        )
        missing_due_date = active_issues.filter(
            priority__in=["urgent", "high"],
            target_date__isnull=True,
        ).order_by("priority_rank", "created_at")
        blocked = (
            active_issues.filter(
                Q(blocked_reason__regex=r"\S")
                | Q(
                    issue_relation__relation_type="blocked_by",
                    issue_relation__deleted_at__isnull=True,
                )
            )
            .distinct()
            .order_by("priority_rank", "target_date", "created_at")
        )
        review_state = (
            Q(state__name__icontains="review")
            | Q(state__name__icontains="approval")
            | Q(state__name__icontains="確認")
            | Q(state__name__icontains="审核")
            | Q(state__name__icontains="待确认")
        )
        waiting_state = (
            Q(state__name__icontains="waiting")
            | Q(state__name__icontains="wait")
            | Q(state__name__icontains="待機")
            | Q(state__name__icontains="待ち")
            | Q(state__name__icontains="待回复")
            | Q(state__name__icontains="等待")
        ) & ~review_state
        waiting = active_issues.filter(
            (Q(waiting_party__isnull=False) & ~Q(waiting_party="")) | waiting_state
        ).order_by("updated_at", "priority_rank")
        awaiting_review = active_issues.filter(review_state).order_by("updated_at", "priority_rank")
        stale = active_issues.filter(updated_at__lt=stale_before).order_by("updated_at", "priority_rank")

        owner_load = list(
            IssueAssignee.objects.filter(
                issue_id__in=active_issues.filter(state__group="started").values("id")
            )
            .values(
                "assignee_id",
                "assignee__display_name",
                "assignee__first_name",
                "assignee__last_name",
            )
            .annotate(count=Count("issue_id", distinct=True))
            .order_by("-count", "assignee__display_name")
        )
        in_progress_by_owner = [
            {
                "assignees__id": row["assignee_id"],
                "assignees__display_name": row["assignee__display_name"],
                "assignees__first_name": row["assignee__first_name"],
                "assignees__last_name": row["assignee__last_name"],
                "count": row["count"],
            }
            for row in owner_load
        ]

        def summarize(queryset):
            return list(queryset.values(*ISSUE_SUMMARY_FIELDS)[:50])

        return Response(
            {
                "generated_at": timezone.now(),
                "counts": {
                    "active": active_issues.count(),
                    "overdue": overdue.count(),
                    "urgent_overdue": overdue.filter(priority__in=["urgent", "high"]).count(),
                    "due_soon": due_soon.count(),
                    "unassigned": unassigned.count(),
                    "missing_due_date": missing_due_date.count(),
                    "blocked": blocked.count(),
                    "waiting": waiting.count(),
                    "awaiting_review": awaiting_review.count(),
                    "stale": stale.count(),
                },
                "issues": {
                    "overdue": summarize(overdue),
                    "due_soon": summarize(due_soon),
                    "unassigned": summarize(unassigned),
                    "missing_due_date": summarize(missing_due_date),
                    "blocked": summarize(blocked),
                    "waiting": summarize(waiting),
                    "awaiting_review": summarize(awaiting_review),
                    "stale": summarize(stale),
                },
                "in_progress_by_owner": in_progress_by_owner,
            },
            status=status.HTTP_200_OK,
        )
