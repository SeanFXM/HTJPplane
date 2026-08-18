# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import User, WorkspaceMember, WorkspaceUserPreference


@pytest.mark.contract
class TestWorkspaceUserPreferenceEndpoint:
    @pytest.mark.django_db
    def test_patch_only_updates_authenticated_users_preference(
        self,
        session_client,
        workspace,
        create_user,
    ):
        other_user = User.objects.create(
            email="other-user@plane.so",
            username="other-user",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=other_user,
            role=15,
        )

        # Create the other user's record first to reproduce the previous .first()
        # behavior, which could select and update this row.
        other_preference = WorkspaceUserPreference.objects.create(
            workspace=workspace,
            user=other_user,
            key=WorkspaceUserPreference.UserPreferenceKeys.VIEWS,
            is_pinned=False,
            sort_order=100,
        )
        own_preference = WorkspaceUserPreference.objects.create(
            workspace=workspace,
            user=create_user,
            key=WorkspaceUserPreference.UserPreferenceKeys.VIEWS,
            is_pinned=False,
            sort_order=200,
        )

        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/sidebar-preferences/",
            [{"key": "views", "is_pinned": True, "sort_order": 300}],
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        own_preference.refresh_from_db()
        other_preference.refresh_from_db()
        assert own_preference.is_pinned is True
        assert own_preference.sort_order == 300
        assert other_preference.is_pinned is False
        assert other_preference.sort_order == 100

    @pytest.mark.django_db
    def test_patch_rejects_non_list_payload(self, session_client, workspace):
        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/sidebar-preferences/",
            {"key": "views", "is_pinned": True},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
