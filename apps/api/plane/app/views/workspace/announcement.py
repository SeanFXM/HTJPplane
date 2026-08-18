# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.utils.html import escape
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkspaceAnnouncementSerializer
from plane.db.models import Notification, Workspace, WorkspaceAnnouncement, WorkspaceMember

from ..base import BaseViewSet


class WorkspaceAnnouncementViewSet(BaseViewSet):
    model = WorkspaceAnnouncement
    serializer_class = WorkspaceAnnouncementSerializer
    use_read_replica = True

    def _create_inbox_notifications(self, announcement, triggered_by_id, verb):
        members = WorkspaceMember.objects.filter(
            workspace_id=announcement.workspace_id,
            is_active=True,
            member__is_bot=False,
        ).values_list("member_id", flat=True)

        sender = (
            "in_app:workspace_announcements:created"
            if verb == "created"
            else "in_app:workspace_announcements:updated"
        )
        notifications = [
            Notification(
                workspace_id=announcement.workspace_id,
                entity_identifier=announcement.id,
                entity_name="workspace_announcement",
                title=announcement.title,
                message={"description": announcement.description},
                message_html=f"<p>{escape(announcement.description)}</p>",
                message_stripped=announcement.description,
                sender=sender,
                triggered_by_id=triggered_by_id,
                receiver_id=member_id,
                data={
                    "announcement": {
                        "id": str(announcement.id),
                        "title": announcement.title,
                        "description": announcement.description,
                        "category": announcement.category,
                    },
                    "announcement_activity": {
                        "verb": verb,
                    },
                },
            )
            for member_id in members
        ]
        Notification.objects.bulk_create(notifications, batch_size=100)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        announcements = WorkspaceAnnouncement.objects.filter(workspace__slug=slug)
        serializer = WorkspaceAnnouncementSerializer(announcements, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        announcement = WorkspaceAnnouncement.objects.filter(pk=pk, workspace__slug=slug).first()
        if not announcement:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkspaceAnnouncementSerializer(announcement)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspaceAnnouncementSerializer(data=request.data)

        if serializer.is_valid():
            announcement = serializer.save(workspace_id=workspace.id)
            self._create_inbox_notifications(announcement, request.user.id, "created")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        announcement = WorkspaceAnnouncement.objects.filter(pk=pk, workspace__slug=slug).first()
        if not announcement:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkspaceAnnouncementSerializer(announcement, data=request.data, partial=True)
        if serializer.is_valid():
            # Notify on create only — editing an announcement must not re-spam every
            # member's inbox (a one-character typo fix shouldn't re-mark it unread for all).
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        announcement = WorkspaceAnnouncement.objects.filter(pk=pk, workspace__slug=slug).first()
        if not announcement:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        announcement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
