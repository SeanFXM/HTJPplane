from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkspaceAnnouncementSerializer
from plane.db.models import Workspace, WorkspaceAnnouncement

from ..base import BaseViewSet


class WorkspaceAnnouncementViewSet(BaseViewSet):
    model = WorkspaceAnnouncement
    serializer_class = WorkspaceAnnouncementSerializer
    use_read_replica = True

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
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        announcement = WorkspaceAnnouncement.objects.filter(pk=pk, workspace__slug=slug).first()
        if not announcement:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkspaceAnnouncementSerializer(announcement, data=request.data, partial=True)
        if serializer.is_valid():
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
