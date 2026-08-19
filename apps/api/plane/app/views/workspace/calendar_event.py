# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkspaceCalendarEventSerializer
from plane.db.models import Workspace, WorkspaceCalendarEvent, WorkspaceMember

from ..base import BaseViewSet


class WorkspaceCalendarEventViewSet(BaseViewSet):
    model = WorkspaceCalendarEvent
    serializer_class = WorkspaceCalendarEventSerializer

    @staticmethod
    def _get_event(slug, pk):
        return WorkspaceCalendarEvent.objects.filter(pk=pk, workspace__slug=slug).first()

    @staticmethod
    def _can_manage_event(request, event):
        if event.created_by_id == request.user.id:
            return True

        return WorkspaceMember.objects.filter(
            workspace_id=event.workspace_id,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        events = WorkspaceCalendarEvent.objects.filter(workspace__slug=slug)
        range_start_raw = request.query_params.get("start")
        range_end_raw = request.query_params.get("end")
        try:
            range_start = parse_date(range_start_raw) if range_start_raw else None
            range_end = parse_date(range_end_raw) if range_end_raw else None
        except (TypeError, ValueError):
            range_start = None
            range_end = None

        if (range_start_raw and range_start is None) or (range_end_raw and range_end is None):
            return Response(
                {"error": "Calendar range must use YYYY-MM-DD dates."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if range_start and range_end and range_end < range_start:
            return Response(
                {"error": "Calendar range end cannot be earlier than its start."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if range_end:
            events = events.filter(start_date__lte=range_end)
        if range_start:
            events = events.filter(Q(end_date__isnull=True, start_date__gte=range_start) | Q(end_date__gte=range_start))

        serializer = self.serializer_class(events.order_by("start_date", "created_at"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        event = self._get_event(slug, pk)
        if event is None:
            return Response({"detail": "Calendar event not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(event).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"detail": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            event = serializer.save(workspace_id=workspace.id)
            event.save(created_by_id=request.user.id, update_fields=["created_by"])
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        event = self._get_event(slug, pk)
        if event is None:
            return Response({"detail": "Calendar event not found."}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_manage_event(request, event):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.serializer_class(event, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        event = self._get_event(slug, pk)
        if event is None:
            return Response({"detail": "Calendar event not found."}, status=status.HTTP_404_NOT_FOUND)
        if not self._can_manage_event(request, event):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
