# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import (
    ProjectMember,
    ProjectMemberInvite,
    Project,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.utils.cache import invalidate_cache_directly
from plane.bgtasks.event_tracking_task import track_event
from plane.utils.analytics_events import USER_JOINED_WORKSPACE
from plane.utils.internal_roles import ADMIN_ROLE, MEMBER_ROLE, normalize_legacy_internal_role


@transaction.atomic
def process_workspace_project_invitations(user):
    """This function takes in User and adds him to all workspace and projects that the user has accepted invited of"""

    workspace_invite_scope = WorkspaceMemberInvite.objects.filter(email=user.email, accepted=True)
    project_invite_scope = ProjectMemberInvite.objects.filter(email=user.email, accepted=True)
    workspace_ids = set(workspace_invite_scope.values_list("workspace_id", flat=True)) | set(
        project_invite_scope.values_list("workspace_id", flat=True)
    )
    project_ids = set(project_invite_scope.values_list("project_id", flat=True))

    # Keep the same deterministic lock order as the interactive invite paths.
    workspaces = {
        workspace.id: workspace
        for workspace in Workspace.objects.select_for_update().filter(id__in=workspace_ids).order_by("id")
    }
    list(Project.objects.select_for_update().filter(id__in=project_ids).order_by("id").values_list("id", flat=True))
    workspace_member_invites = list(workspace_invite_scope.select_for_update().order_by("workspace_id", "id"))
    project_member_invites = list(project_invite_scope.select_for_update().order_by("workspace_id", "project_id", "id"))

    workspace_invite_roles = {
        invitation.id: normalize_legacy_internal_role(invitation.role) for invitation in workspace_member_invites
    }
    project_invite_roles = {
        invitation.id: normalize_legacy_internal_role(invitation.role) for invitation in project_member_invites
    }
    workspace_members = {
        workspace_member.workspace_id: workspace_member
        for workspace_member in WorkspaceMember.objects.select_for_update()
        .filter(workspace_id__in=workspace_ids, member=user)
        .order_by("workspace_id", "id")
    }
    project_members = {
        project_member.project_id: project_member
        for project_member in ProjectMember.objects.select_for_update()
        .filter(project_id__in=project_ids, member=user)
        .order_by("project_id", "id")
    }

    for invitation in workspace_member_invites:
        workspace = workspaces[invitation.workspace_id]
        workspace_member = workspace_members.get(invitation.workspace_id)
        if workspace_member is not None and not workspace_member.is_active:
            continue
        effective_role = (
            ADMIN_ROLE
            if workspace.owner_id == user.id
            else workspace_member.role
            if workspace_member is not None
            else workspace_invite_roles[invitation.id]
        )
        if workspace_member is None:
            workspace_member = WorkspaceMember.objects.create(
                workspace=workspace,
                member=user,
                role=effective_role,
                created_by_id=invitation.created_by_id,
            )
            workspace_members[invitation.workspace_id] = workspace_member
        else:
            workspace_member.is_active = True
            workspace_member.role = effective_role
            workspace_member.save()

        invalidate_cache_directly(
            path=f"/api/workspaces/{workspace.slug}/members/",
            url_params=False,
            user=False,
            multiple=True,
        )
        track_event.delay(
            user_id=user.id,
            event_name=USER_JOINED_WORKSPACE,
            slug=workspace.slug,
            event_properties={
                "user_id": user.id,
                "workspace_id": workspace.id,
                "workspace_slug": workspace.slug,
                "role": effective_role,
                "joined_at": str(timezone.now().isoformat()),
            },
        )

    for invitation in project_member_invites:
        workspace = workspaces[invitation.workspace_id]
        workspace_member = workspace_members.get(invitation.workspace_id)
        project_member = project_members.get(invitation.project_id)
        if project_member is not None and not project_member.is_active:
            continue
        if workspace_member is not None and not workspace_member.is_active:
            continue
        if workspace_member is None:
            workspace_member = WorkspaceMember.objects.create(
                workspace=workspace,
                member=user,
                role=ADMIN_ROLE if workspace.owner_id == user.id else MEMBER_ROLE,
                created_by_id=invitation.created_by_id,
            )
            workspace_members[invitation.workspace_id] = workspace_member
        else:
            workspace_member.is_active = True
            if workspace.owner_id == user.id:
                workspace_member.role = ADMIN_ROLE
            workspace_member.save()

        effective_role = (
            ADMIN_ROLE
            if workspace_member.role == ADMIN_ROLE
            else project_member.role
            if project_member is not None
            else project_invite_roles[invitation.id]
        )
        if project_member is None:
            project_member = ProjectMember.objects.create(
                project_id=invitation.project_id,
                member=user,
                role=effective_role,
                created_by_id=invitation.created_by_id,
            )
            project_members[invitation.project_id] = project_member
        else:
            project_member.is_active = True
            project_member.role = effective_role
            project_member.save()

    # Delete all the invites
    WorkspaceMemberInvite.objects.filter(id__in=[invitation.id for invitation in workspace_member_invites]).delete()
    ProjectMemberInvite.objects.filter(id__in=[invitation.id for invitation in project_member_invites]).delete()
