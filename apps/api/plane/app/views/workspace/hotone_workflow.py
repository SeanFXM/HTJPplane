# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-level installer for Hotone Japan's standard project workflow."""

from collections.abc import Mapping
from uuid import UUID

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, State, Workspace
from plane.utils.cache import invalidate_cache


HOTONE_WORKFLOW_VERSION = "hotone-japan-v1"
HOTONE_WORKFLOW_STATES = (
    {"name": "未整理", "group": "backlog", "color": "#6B7280", "sequence": 10000},
    {"name": "実行待ち", "group": "unstarted", "color": "#3B82F6", "sequence": 20000},
    {"name": "進行中", "group": "started", "color": "#F59E0B", "sequence": 30000},
    {"name": "待機中", "group": "started", "color": "#8B5CF6", "sequence": 31000},
    {"name": "社内確認待ち", "group": "started", "color": "#EC4899", "sequence": 32000},
    {"name": "完了", "group": "completed", "color": "#22C55E", "sequence": 40000},
    {"name": "キャンセル", "group": "cancelled", "color": "#94A3B8", "sequence": 50000},
)
DEFAULT_STATE_NAME = "未整理"


def _serialize_state_definition(definition):
    return {
        "name": definition["name"],
        "group": definition["group"],
        "color": definition["color"],
        "sequence": definition["sequence"],
    }


def _resolve_projects(workspace, raw_project_ids):
    if raw_project_ids is None:
        raw_project_ids = []
    if not isinstance(raw_project_ids, list):
        raise ValueError("project_ids must be a list of project IDs.")

    available_projects = Project.objects.filter(
        workspace=workspace,
        archived_at__isnull=True,
    )
    if not raw_project_ids:
        return list(available_projects.order_by("name", "id"))

    try:
        normalized_ids = {str(UUID(str(project_id))) for project_id in raw_project_ids}
    except (TypeError, ValueError) as error:
        raise ValueError("One or more project IDs are invalid.") from error

    projects = list(available_projects.filter(id__in=normalized_ids).order_by("name", "id"))
    if {str(project.id) for project in projects} != normalized_ids:
        raise ValueError("One or more projects are archived or do not exist in this workspace.")
    return projects


def _project_preview(project, states=None):
    if states is None:
        states = list(
            State.all_state_objects.filter(
                workspace_id=project.workspace_id,
                project_id=project.id,
                deleted_at__isnull=True,
            ).order_by("sequence", "created_at")
        )

    states_by_name = {state.name: state for state in states}
    existing = []
    create = []
    conflicts = []

    for definition in HOTONE_WORKFLOW_STATES:
        state = states_by_name.get(definition["name"])
        if state is None:
            create.append(_serialize_state_definition(definition))
        elif state.group == definition["group"]:
            existing.append(
                {
                    "id": str(state.id),
                    "name": state.name,
                    "group": state.group,
                    "default": state.default,
                }
            )
        else:
            conflicts.append(
                {
                    "id": str(state.id),
                    "name": state.name,
                    "expected_group": definition["group"],
                    "existing_group": state.group,
                }
            )

    has_non_triage_default = any(
        state.default and not state.is_triage and state.group != "triage" for state in states
    )
    default_action = "preserve" if has_non_triage_default else "set_unorganized"
    if conflicts:
        preview_status = "blocked"
    elif create or default_action == "set_unorganized":
        preview_status = "ready"
    else:
        preview_status = "up_to_date"

    return {
        "project_id": str(project.id),
        "project_name": project.name,
        "project_identifier": project.identifier,
        "status": preview_status,
        "existing": existing,
        "create": create,
        "conflicts": conflicts,
        "default_action": default_action,
    }


def _preview_response(projects):
    project_previews = [_project_preview(project) for project in projects]
    return {
        "preset_version": HOTONE_WORKFLOW_VERSION,
        "summary": {
            "total_projects": len(project_previews),
            "ready_projects": sum(preview["status"] == "ready" for preview in project_previews),
            "up_to_date_projects": sum(preview["status"] == "up_to_date" for preview in project_previews),
            "blocked_projects": sum(preview["status"] == "blocked" for preview in project_previews),
            "states_to_create": sum(len(preview["create"]) for preview in project_previews),
        },
        "projects": project_previews,
    }


class HotoneWorkflowBaseEndpoint(BaseAPIView):
    def get_projects(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return None, None, Response(
                {"error": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not isinstance(request.data, Mapping):
            return None, None, Response(
                {"error": "Request body must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            projects = _resolve_projects(workspace, request.data.get("project_ids"))
        except ValueError as error:
            return None, None, Response(
                {"error": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return workspace, projects, None


class HotoneWorkflowPreviewEndpoint(HotoneWorkflowBaseEndpoint):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        _, projects, error_response = self.get_projects(request, slug)
        if error_response is not None:
            return error_response
        return Response(_preview_response(projects), status=status.HTTP_200_OK)


class HotoneWorkflowApplyEndpoint(HotoneWorkflowBaseEndpoint):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    @invalidate_cache(path="/api/workspaces/:slug/states/", url_params=True, user=False)
    def post(self, request, slug):
        workspace, projects, error_response = self.get_projects(request, slug)
        if error_response is not None:
            return error_response

        results = []
        for selected_project in projects:
            with transaction.atomic():
                project = Project.objects.select_for_update().get(
                    id=selected_project.id,
                    workspace=workspace,
                    archived_at__isnull=True,
                )
                states = list(
                    State.all_state_objects.select_for_update()
                    .filter(workspace=workspace, project=project, deleted_at__isnull=True)
                    .order_by("sequence", "created_at")
                )
                preview = _project_preview(project, states)
                if preview["conflicts"]:
                    results.append(
                        {
                            **preview,
                            "status": "blocked",
                            "created": [],
                            "default_set": None,
                        }
                    )
                    continue

                states_by_name = {state.name: state for state in states}
                created = []
                for definition in HOTONE_WORKFLOW_STATES:
                    if definition["name"] in states_by_name:
                        continue
                    state = State.objects.create(
                        workspace=workspace,
                        project=project,
                        name=definition["name"],
                        group=definition["group"],
                        color=definition["color"],
                        default=False,
                    )
                    # State.save() appends a sequence automatically. The preset uses
                    # deterministic values so repeated installs and project ordering agree.
                    State.objects.filter(id=state.id).update(sequence=definition["sequence"])
                    state.sequence = definition["sequence"]
                    states_by_name[state.name] = state
                    created.append(_serialize_state_definition(definition))

                default_set = None
                if not any(
                    state.default and not state.is_triage and state.group != "triage"
                    for state in states
                ):
                    default_state = states_by_name[DEFAULT_STATE_NAME]
                    State.objects.filter(id=default_state.id).update(default=True)
                    default_set = {
                        "id": str(default_state.id),
                        "name": default_state.name,
                    }

                results.append(
                    {
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "project_identifier": project.identifier,
                        "status": "applied" if created or default_set else "no_changes",
                        "created": created,
                        "conflicts": [],
                        "default_set": default_set,
                    }
                )

        return Response(
            {
                "preset_version": HOTONE_WORKFLOW_VERSION,
                "summary": {
                    "total_projects": len(results),
                    "applied_projects": sum(result["status"] == "applied" for result in results),
                    "unchanged_projects": sum(result["status"] == "no_changes" for result in results),
                    "blocked_projects": sum(result["status"] == "blocked" for result in results),
                    "states_created": sum(len(result["created"]) for result in results),
                },
                "projects": results,
            },
            status=status.HTTP_200_OK,
        )
