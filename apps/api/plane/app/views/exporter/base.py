# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import UUID

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import ExporterHistorySerializer
from plane.bgtasks.export_task import issue_export_task
from plane.db.models import ExporterHistory, Issue, Project, Workspace
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet

# Module imports
from .. import BaseAPIView


class ExportIssuesEndpoint(BaseAPIView):
    model = ExporterHistory
    serializer_class = ExporterHistorySerializer
    filterset_class = IssueFilterSet

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        # Get the workspace
        workspace = Workspace.objects.get(slug=slug)

        provider = request.data.get("provider", False)
        multiple = request.data.get("multiple", False)
        project_ids = request.data.get("project", [])
        rich_filters = request.data.get("rich_filters", {})

        if provider not in ["csv", "xlsx", "json"]:
            return Response(
                {"error": f"Provider '{provider}' not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(project_ids, list):
            return Response(
                {"error": "Project must be a list of project IDs."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(multiple, bool):
            return Response(
                {"error": "Multiple must be a boolean."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(rich_filters, dict):
            return Response(
                {"error": "Rich filters must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        available_projects = Project.objects.filter(
            workspace=workspace,
            archived_at__isnull=True,
        )

        if project_ids:
            try:
                normalized_project_ids = {str(UUID(str(project_id))) for project_id in project_ids}
                selected_projects = available_projects.filter(id__in=normalized_project_ids)
                selected_project_ids = [
                    str(project_id) for project_id in selected_projects.values_list("id", flat=True)
                ]
            except (TypeError, ValueError):
                return Response(
                    {"error": "One or more project IDs are invalid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if set(selected_project_ids) != normalized_project_ids:
                return Response(
                    {"error": "One or more projects do not exist in this workspace."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            project_ids = selected_project_ids
        else:
            project_ids = [str(project_id) for project_id in available_projects.values_list("id", flat=True)]

        if not project_ids:
            return Response(
                {"error": "There are no active projects to export."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if rich_filters:
            export_queryset = Issue.objects.filter(
                workspace=workspace,
                project_id__in=project_ids,
            )
            ComplexFilterBackend().filter_queryset(
                request=None,
                queryset=export_queryset,
                view=self,
                filter_data=rich_filters,
            )

        exporter = ExporterHistory.objects.create(
            workspace=workspace,
            project=project_ids,
            initiated_by=request.user,
            provider=provider,
            type="issue_exports",
            rich_filters=rich_filters,
        )

        issue_export_task.delay(
            provider=exporter.provider,
            workspace_id=workspace.id,
            project_ids=project_ids,
            token_id=exporter.token,
            multiple=multiple,
            slug=slug,
        )
        return Response(
            {"message": "Once the export is ready you will be able to download it"},
            status=status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        exporter_history = ExporterHistory.objects.filter(workspace__slug=slug, type="issue_exports").select_related(
            "workspace", "initiated_by"
        )

        if request.GET.get("per_page", False) and request.GET.get("cursor", False):
            return self.paginate(
                order_by=request.GET.get("order_by", "-created_at"),
                request=request,
                queryset=exporter_history,
                on_results=lambda exporter_history: ExporterHistorySerializer(exporter_history, many=True).data,
            )
        else:
            return Response(
                {"error": "per_page and cursor are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
