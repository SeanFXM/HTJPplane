# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import csv
import io
import os
from datetime import timedelta
import uuid

from dateutil.relativedelta import relativedelta
from django.db import IntegrityError
from django.db.models import Count, Exists, F, Func, OuterRef, Prefetch, Q

from django.db.models.fields import DateField
from django.db.models.functions import Cast, ExtractDay


# Django imports
from django.http import HttpResponse
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    WorkSpaceAdminPermission,
    WorkSpaceBasePermission,
    WorkspaceEntityPermission,
)

# Module imports
from plane.app.serializers import WorkSpaceSerializer, WorkspaceThemeSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    Workspace,
    WorkspaceMember,
    WorkspaceTheme,
    Profile,
)
from plane.app.permissions import ROLE, allow_permission
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS
from plane.license.utils.instance_value import get_configuration_value
from plane.bgtasks.workspace_seed_task import workspace_seed
from plane.bgtasks.event_tracking_task import track_event
from plane.utils.url import contains_url
from plane.utils.analytics_events import WORKSPACE_CREATED, WORKSPACE_DELETED
from plane.utils.csv_utils import sanitize_csv_row


class WorkSpaceViewSet(BaseViewSet):
    model = Workspace
    serializer_class = WorkSpaceSerializer
    permission_classes = [WorkSpaceBasePermission]

    search_fields = ["name"]
    filterset_fields = ["owner"]

    lookup_field = "slug"

    def get_queryset(self):
        member_count = (
            WorkspaceMember.objects.filter(workspace=OuterRef("id"), member__is_bot=False, is_active=True)
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )

        return (
            self.filter_queryset(super().get_queryset().select_related("owner"))
            .order_by("name")
            .filter(
                workspace_member__member=self.request.user,
                workspace_member__is_active=True,
            )
            .annotate(total_members=member_count)
        )

    def create(self, request):
        try:
            (DISABLE_WORKSPACE_CREATION,) = get_configuration_value(
                [
                    {
                        "key": "DISABLE_WORKSPACE_CREATION",
                        "default": os.environ.get("DISABLE_WORKSPACE_CREATION", "0"),
                    }
                ]
            )

            if DISABLE_WORKSPACE_CREATION == "1":
                return Response(
                    {"error": "Workspace creation is not allowed"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            serializer = WorkSpaceSerializer(data=request.data)

            slug = request.data.get("slug", False)
            name = request.data.get("name", False)

            if not name or not slug:
                return Response(
                    {"error": "Both name and slug are required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if len(name) > 80 or len(slug) > 48:
                return Response(
                    {"error": "The maximum length for name is 80 and for slug is 48"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if contains_url(name):
                return Response(
                    {"error": "Name cannot contain a URL"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if serializer.is_valid(raise_exception=True):
                serializer.save(owner=request.user)
                # Create Workspace member
                _ = WorkspaceMember.objects.create(
                    workspace_id=serializer.data["id"],
                    member=request.user,
                    role=20,
                    company_role=request.data.get("company_role", ""),
                )

                # Get total members and role
                total_members = WorkspaceMember.objects.filter(workspace_id=serializer.data["id"]).count()
                data = serializer.data
                data["total_members"] = total_members
                data["role"] = 20

                workspace_seed.delay(serializer.data["id"])

                track_event.delay(
                    user_id=request.user.id,
                    event_name=WORKSPACE_CREATED,
                    slug=data["slug"],
                    event_properties={
                        "user_id": request.user.id,
                        "workspace_id": data["id"],
                        "workspace_slug": data["slug"],
                        "role": "owner",
                        "workspace_name": data["name"],
                        "created_at": data["created_at"],
                    },
                )

                return Response(data, status=status.HTTP_201_CREATED)
            return Response(
                [serializer.errors[error][0] for error in serializer.errors],
                status=status.HTTP_400_BAD_REQUEST,
            )

        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"slug": "The workspace with the slug already exists"},
                    status=status.HTTP_409_CONFLICT,
                )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    def remove_last_workspace_ids_from_user_settings(self, id: uuid.UUID) -> None:
        """
        Remove the last workspace id from the user settings
        """
        Profile.objects.filter(last_workspace_id=id).update(last_workspace_id=None)
        return

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, *args, **kwargs):
        # Get the workspace
        workspace = self.get_object()
        self.remove_last_workspace_ids_from_user_settings(workspace.id)
        track_event.delay(
            user_id=request.user.id,
            event_name=WORKSPACE_DELETED,
            slug=workspace.slug,
            event_properties={
                "user_id": request.user.id,
                "workspace_id": workspace.id,
                "workspace_slug": workspace.slug,
                "role": "owner",
                "workspace_name": workspace.name,
                "deleted_at": str(timezone.now().isoformat()),
            },
        )
        return super().destroy(request, *args, **kwargs)


class UserWorkSpacesEndpoint(BaseAPIView):
    search_fields = ["name"]
    filterset_fields = ["owner"]
    use_read_replica = True

    def get(self, request):
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        member_count = (
            WorkspaceMember.objects.filter(workspace=OuterRef("id"), member__is_bot=False, is_active=True)
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )

        role = WorkspaceMember.objects.filter(workspace=OuterRef("id"), member=request.user, is_active=True).values(
            "role"
        )

        workspace = (
            Workspace.objects.prefetch_related(
                Prefetch(
                    "workspace_member",
                    queryset=WorkspaceMember.objects.filter(member=request.user, is_active=True),
                )
            )
            .annotate(role=role, total_members=member_count)
            .filter(workspace_member__member=request.user, workspace_member__is_active=True)
            .distinct()
        )

        workspaces = WorkSpaceSerializer(
            self.filter_queryset(workspace),
            fields=fields if fields else None,
            many=True,
        ).data

        return Response(workspaces, status=status.HTTP_200_OK)


class WorkSpaceAvailabilityCheckEndpoint(BaseAPIView):
    def get(self, request):
        slug = request.GET.get("slug", False)

        if not slug or slug == "":
            return Response(
                {"error": "Workspace Slug is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.filter(slug=slug).exists() or slug in RESTRICTED_WORKSPACE_SLUGS
        return Response({"status": not workspace}, status=status.HTTP_200_OK)


class WeekInMonth(Func):
    function = "FLOOR"
    template = "(((%(expressions)s - 1) / 7) + 1)::INTEGER"


class UserWorkspaceDashboardEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.localdate()
        issue_activities = (
            IssueActivity.objects.filter(
                actor=request.user,
                workspace__slug=slug,
                created_at__date__gte=today + relativedelta(months=-3),
            )
            .annotate(created_date=Cast("created_at", DateField()))
            .values("created_date")
            .annotate(activity_count=Count("created_date"))
            .order_by("created_date")
        )

        try:
            month = int(request.GET.get("month", today.month))
            year = int(request.GET.get("year", today.year))
        except (TypeError, ValueError):
            return Response(
                {"error": "Month and year must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if month < 1 or month > 12 or year < 2000 or year > 2100:
            return Response(
                {"error": "Month or year is outside the supported range"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_user_assignment = IssueAssignee.objects.filter(
            issue_id=OuterRef("pk"),
            assignee=request.user,
        )
        assigned_user_issues = Issue.issue_objects.filter(workspace__slug=slug).filter(
            Exists(current_user_assignment)
        )

        completed_issues = (
            assigned_user_issues.filter(
                completed_at__month=month,
                completed_at__year=year,
                completed_at__isnull=False,
            )
            .annotate(day_of_month=ExtractDay("completed_at"))
            .annotate(week_in_month=WeekInMonth(F("day_of_month")))
            .values("week_in_month")
            .annotate(completed_count=Count("id"))
            .order_by("week_in_month")
        )

        assigned_issues = assigned_user_issues.count()

        pending_issues_count = assigned_user_issues.filter(
            ~Q(state__group__in=["completed", "cancelled"]),
        ).count()

        completed_issues_count = assigned_user_issues.filter(state__group="completed").count()

        active_user_issues = assigned_user_issues.filter(
            ~Q(state__group__in=["completed", "cancelled"]),
        ).distinct()

        due_week_end = today + timedelta(days=6)
        issues_due_week = active_user_issues.filter(target_date__range=(today, due_week_end)).count()

        state_distribution = (
            assigned_user_issues
            .annotate(state_group=F("state__group"))
            .values("state_group")
            .annotate(state_count=Count("state_group"))
            .order_by("state_group")
        )

        issue_summary_fields = (
            "id",
            "name",
            "workspace__slug",
            "project_id",
            "project__identifier",
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
        )

        overdue_issues = active_user_issues.filter(
            target_date__lt=today,
            completed_at__isnull=True,
        ).order_by("target_date", "-priority", "created_at")

        today_issues = active_user_issues.filter(
            target_date=today,
            completed_at__isnull=True,
        ).order_by("-priority", "created_at")

        upcoming_issues = active_user_issues.filter(
            target_date__gt=today,
            target_date__lte=due_week_end,
            completed_at__isnull=True,
        ).order_by("target_date", "-priority", "created_at")

        blocked_issues = (
            active_user_issues.filter(
                Q(blocked_reason__regex=r"\S")
                | Q(
                    issue_relation__relation_type="blocked_by",
                    issue_relation__deleted_at__isnull=True,
                )
            )
            .distinct()
            .order_by("target_date", "-priority", "created_at")
        )

        return Response(
            {
                "issue_activities": issue_activities,
                "completed_issues": completed_issues,
                "assigned_issues_count": assigned_issues,
                "pending_issues_count": pending_issues_count,
                "completed_issues_count": completed_issues_count,
                "issues_due_week_count": issues_due_week,
                "state_distribution": state_distribution,
                "today_issues": today_issues.values(*issue_summary_fields),
                "overdue_issues": overdue_issues.values(*issue_summary_fields),
                "upcoming_issues": upcoming_issues.values(*issue_summary_fields),
                "blocked_issues": blocked_issues.values(*issue_summary_fields),
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceThemeViewSet(BaseViewSet):
    permission_classes = [WorkSpaceAdminPermission]
    model = WorkspaceTheme
    serializer_class = WorkspaceThemeSerializer

    def get_queryset(self):
        return super().get_queryset().filter(workspace__slug=self.kwargs.get("slug"))

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspaceThemeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=workspace, actor=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ExportWorkspaceUserActivityEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    def generate_csv_from_rows(self, rows):
        """Generate CSV buffer from rows."""
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer, delimiter=",", quoting=csv.QUOTE_ALL)
        [writer.writerow(sanitize_csv_row(row)) for row in rows]
        csv_buffer.seek(0)
        return csv_buffer

    def post(self, request, slug, user_id):
        if not request.data.get("date"):
            return Response({"error": "Date is required"}, status=status.HTTP_400_BAD_REQUEST)

        user_activities = IssueActivity.objects.filter(
            ~Q(field__in=["comment", "vote", "reaction", "draft"]),
            workspace__slug=slug,
            created_at__date=request.data.get("date"),
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            actor_id=user_id,
        ).select_related("actor", "workspace", "issue", "project")[:10000]

        header = [
            "Actor name",
            "Issue ID",
            "Project",
            "Created at",
            "Updated at",
            "Action",
            "Field",
            "Old value",
            "New value",
        ]
        rows = [
            (
                activity.actor.display_name,
                f"{activity.project.identifier} - {activity.issue.sequence_id if activity.issue else ''}",
                activity.project.name,
                activity.created_at,
                activity.updated_at,
                activity.verb,
                activity.field,
                activity.old_value,
                activity.new_value,
            )
            for activity in user_activities
        ]
        csv_buffer = self.generate_csv_from_rows([header] + rows)
        response = HttpResponse(csv_buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="workspace-user-activity.csv"'
        return response
