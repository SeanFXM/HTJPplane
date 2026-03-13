# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import Notification, WorkspaceAnnouncement, WorkspaceMember
from plane.tests.factories import UserFactory


@pytest.mark.contract
class TestWorkspaceAnnouncementsAPI:
    @pytest.mark.django_db
    def test_workspace_members_can_list_announcements(self, api_client, workspace):
        WorkspaceAnnouncement.objects.create(
            workspace=workspace,
            title="Platform maintenance",
            description="Please prioritize blockers this week.",
            category="important",
        )

        member_user = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)
        api_client.force_authenticate(user=member_user)

        url = reverse("workspace-announcements", kwargs={"slug": workspace.slug})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["title"] == "Platform maintenance"

    @pytest.mark.django_db
    def test_non_admin_cannot_create_announcements(self, api_client, workspace):
        member_user = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)
        api_client.force_authenticate(user=member_user)

        url = reverse("workspace-announcements", kwargs={"slug": workspace.slug})
        response = api_client.post(
            url,
            {"title": "Release update", "description": "New patch shipped.", "category": "update"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert WorkspaceAnnouncement.objects.count() == 0

    @pytest.mark.django_db
    def test_admin_can_create_update_and_delete_announcements(self, session_client, workspace, create_user):
        member_user = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)

        list_url = reverse("workspace-announcements", kwargs={"slug": workspace.slug})
        create_response = session_client.post(
            list_url,
            {"title": "Bug fixes", "description": "Search issue fixed.", "category": "fix"},
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        announcement_id = create_response.data["id"]
        assert Notification.objects.filter(entity_name="workspace_announcement").count() == 2
        assert set(
            Notification.objects.filter(entity_name="workspace_announcement").values_list("receiver_id", flat=True)
        ) == {create_user.id, member_user.id}

        detail_url = reverse("workspace-announcements", kwargs={"slug": workspace.slug, "pk": announcement_id})
        update_response = session_client.patch(
            detail_url,
            {"title": "Bug fixes shipped", "category": "update"},
            format="json",
        )
        delete_response = session_client.delete(detail_url)

        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["title"] == "Bug fixes shipped"
        assert Notification.objects.filter(entity_name="workspace_announcement").count() == 4
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert WorkspaceAnnouncement.objects.count() == 0
