# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import date

import pytest
from django.urls import reverse
from rest_framework import status

from plane.app.permissions import ROLE
from plane.db.models import WorkspaceCalendarEvent, WorkspaceMember
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
class TestWorkspaceCalendarEventsAPI:
    @pytest.mark.django_db
    @pytest.mark.parametrize(
        "role",
        [
            pytest.param(ROLE.ADMIN.value, id="admin"),
            pytest.param(ROLE.MEMBER.value, id="member"),
        ],
    )
    def test_every_internal_workspace_role_can_list_calendar_events(self, api_client, workspace, role):
        WorkspaceCalendarEvent.objects.create(
            workspace=workspace,
            title="Tokyo product launch",
            category="product_release",
            start_date=date(2026, 9, 10),
        )
        user = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
        api_client.force_authenticate(user=user)

        response = api_client.get(reverse("workspace-calendar-events", kwargs={"slug": workspace.slug}))

        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]["title"] == "Tokyo product launch"

    @pytest.mark.django_db
    def test_non_member_cannot_read_calendar_events(self, api_client, workspace):
        event = WorkspaceCalendarEvent.objects.create(
            workspace=workspace,
            title="Internal event",
            start_date=date(2026, 9, 10),
        )
        api_client.force_authenticate(user=UserFactory())
        list_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug})
        detail_url = reverse(
            "workspace-calendar-events",
            kwargs={"slug": workspace.slug, "pk": event.id},
        )

        list_response = api_client.get(list_url)
        detail_response = api_client.get(detail_url)

        assert list_response.status_code == status.HTTP_403_FORBIDDEN
        assert detail_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_calendar_detail_cannot_cross_workspace_scope(self, session_client, workspace, create_user):
        other_workspace = WorkspaceFactory(owner=create_user)
        WorkspaceMember.objects.create(
            workspace=other_workspace,
            member=create_user,
            role=ROLE.ADMIN.value,
        )
        event = WorkspaceCalendarEvent.objects.create(
            workspace=workspace,
            title="Scoped event",
            start_date=date(2026, 9, 10),
        )
        detail_url = reverse(
            "workspace-calendar-events",
            kwargs={"slug": other_workspace.slug, "pk": event.id},
        )

        response = session_client.get(detail_url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_range_filter_includes_events_that_overlap_the_month(self, session_client, workspace):
        WorkspaceCalendarEvent.objects.create(
            workspace=workspace,
            title="Exhibition",
            category="exhibition",
            start_date=date(2026, 8, 30),
            end_date=date(2026, 9, 2),
        )
        WorkspaceCalendarEvent.objects.create(
            workspace=workspace,
            title="Old event",
            start_date=date(2026, 7, 1),
        )

        response = session_client.get(
            reverse("workspace-calendar-events", kwargs={"slug": workspace.slug}),
            {"start": "2026-09-01", "end": "2026-09-30"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert [event["title"] for event in response.data] == ["Exhibition"]

    @pytest.mark.django_db
    def test_member_can_create_update_and_delete_calendar_event(self, api_client, workspace):
        member = UserFactory()
        spoofed_creator = UserFactory()
        spoofed_workspace = WorkspaceFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=ROLE.MEMBER.value)
        api_client.force_authenticate(user=member)
        list_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug})

        create_response = api_client.post(
            list_url,
            {
                "title": "Sound Messe",
                "category": "exhibition",
                "start_date": "2026-10-17",
                "end_date": "2026-10-18",
                "location": "Osaka",
                "workspace": str(spoofed_workspace.id),
                "created_by": str(spoofed_creator.id),
                "updated_by": str(spoofed_creator.id),
                "deleted_at": "2026-08-01T00:00:00Z",
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert str(create_response.data["workspace"]) == str(workspace.id)
        assert str(create_response.data["created_by"]) == str(member.id)
        assert create_response.data["updated_by"] is None
        assert "deleted_at" not in create_response.data
        event_id = create_response.data["id"]
        detail_url = reverse(
            "workspace-calendar-events",
            kwargs={"slug": workspace.slug, "pk": event_id},
        )
        update_response = api_client.patch(detail_url, {"location": "Nanko, Osaka"}, format="json")
        delete_response = api_client.delete(detail_url)

        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["location"] == "Nanko, Osaka"
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert WorkspaceCalendarEvent.objects.count() == 0
        deleted_event = WorkspaceCalendarEvent.all_objects.get(id=event_id)
        assert deleted_event.deleted_at is not None

    @pytest.mark.django_db
    def test_invalid_date_range_is_rejected(self, session_client, workspace):
        list_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug})
        invalid_response = session_client.post(
            list_url,
            {"title": "Invalid range", "start_date": "2026-09-10", "end_date": "2026-09-09"},
            format="json",
        )

        assert invalid_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "end_date" in invalid_response.data

    @pytest.mark.django_db
    def test_semantically_invalid_query_date_is_rejected(self, session_client, workspace):
        response = session_client.get(
            reverse("workspace-calendar-events", kwargs={"slug": workspace.slug}),
            {"start": "2026-02-30", "end": "2026-03-31"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_query_range_end_before_start_is_rejected(self, session_client, workspace):
        response = session_client.get(
            reverse("workspace-calendar-events", kwargs={"slug": workspace.slug}),
            {"start": "2026-09-30", "end": "2026-09-01"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_member_cannot_change_another_members_event(self, api_client, workspace):
        owner = UserFactory()
        other_member = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=owner, role=ROLE.MEMBER.value)
        WorkspaceMember.objects.create(workspace=workspace, member=other_member, role=ROLE.MEMBER.value)
        event = WorkspaceCalendarEvent(
            workspace=workspace,
            title="Owner event",
            start_date=date(2026, 9, 1),
        )
        event.save(created_by_id=owner.id)
        api_client.force_authenticate(user=other_member)
        detail_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug, "pk": event.id})

        update_response = api_client.patch(detail_url, {"title": "Changed"}, format="json")
        delete_response = api_client.delete(detail_url)

        assert update_response.status_code == status.HTTP_403_FORBIDDEN
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_admin_can_change_another_members_event(self, session_client, workspace):
        member = UserFactory()
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=member,
            role=ROLE.MEMBER.value,
        )
        event = WorkspaceCalendarEvent(
            workspace=workspace,
            title="Member event",
            start_date=date(2026, 9, 1),
        )
        event.save(created_by_id=member.id)
        detail_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug, "pk": event.id})

        update_response = session_client.patch(detail_url, {"title": "Admin changed"}, format="json")
        delete_response = session_client.delete(detail_url)

        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["title"] == "Admin changed"
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_inactive_member_creator_cannot_change_calendar_event(self, api_client, workspace):
        creator = UserFactory()
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=creator,
            role=ROLE.MEMBER.value,
            is_active=False,
        )
        event = WorkspaceCalendarEvent(
            workspace=workspace,
            title="Former member event",
            start_date=date(2026, 9, 1),
        )
        event.save(created_by_id=creator.id)
        api_client.force_authenticate(user=creator)
        detail_url = reverse("workspace-calendar-events", kwargs={"slug": workspace.slug, "pk": event.id})

        update_response = api_client.patch(detail_url, {"title": "Changed"}, format="json")
        delete_response = api_client.delete(detail_url)

        assert update_response.status_code == status.HTTP_403_FORBIDDEN
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN
