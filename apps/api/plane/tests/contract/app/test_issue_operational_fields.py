# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone as datetime_timezone
from threading import Barrier
from unittest.mock import patch

import pytest
from django.db import IntegrityError, close_old_connections, transaction
from rest_framework import status

from plane.api.serializers.issue import IssueSerializer as ExternalIssueSerializer
from plane.app.serializers.issue import IssueCreateSerializer as AppIssueSerializer
from plane.app.serializers.draft import DraftIssueCreateSerializer
from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, State, User


@pytest.mark.contract
class TestIssueOperationalFields:
    @pytest.fixture
    def project(self, workspace, create_user):
        project = Project.objects.create(
            name="Operational Project",
            identifier="OPER",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20)
        return project

    @pytest.fixture
    def state(self, workspace, project):
        return State.objects.create(
            name="In progress",
            color="#3F76FF",
            group="started",
            default=True,
            workspace=workspace,
            project=project,
        )

    @pytest.fixture
    def second_member(self, project):
        user = User.objects.create(
            email="second-owner@example.com",
            username="second-owner",
            first_name="Second",
            last_name="Owner",
        )
        ProjectMember.objects.create(project=project, member=user, role=15)
        return user

    def issue_collection_url(self, workspace, project):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"

    def issue_detail_url(self, workspace, project, issue):
        return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/"

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.model_activity.delay")
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_app_create_and_detail_return_structured_operational_fields(
        self,
        _mock_issue_activity,
        _mock_model_activity,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        response = session_client.post(
            self.issue_collection_url(workspace, project),
            {
                "name": "Prepare retailer launch",
                "state_id": str(state.id),
                "assignee_ids": [str(create_user.id)],
                "waiting_party": "  Retail partner  ",
                "blocked_reason": "  Missing approved images  ",
                "next_action": "  Ask the partner for approval  ",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["waiting_party"] == "Retail partner"
        assert response.data["waiting_since"] is not None
        assert response.data["blocked_reason"] == "Missing approved images"
        assert response.data["next_action"] == "Ask the partner for approval"
        assert response.data["assignee_ids"] == [str(create_user.id)]

        issue = Issue.objects.get(pk=response.data["id"])
        detail_response = session_client.get(self.issue_detail_url(workspace, project, issue))

        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.data["waiting_party"] == "Retail partner"
        assert detail_response.data["waiting_since"] is not None
        assert detail_response.data["blocked_reason"] == "Missing approved images"
        assert detail_response.data["next_action"] == "Ask the partner for approval"

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.model_activity.delay")
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_explicit_unassigned_bypasses_project_default_owner(
        self,
        _mock_issue_activity,
        _mock_model_activity,
        session_client,
        workspace,
        project,
        state,
        create_user,
    ):
        project.default_assignee = create_user
        project.save(update_fields=["default_assignee"])

        explicit_unassigned = session_client.post(
            self.issue_collection_url(workspace, project),
            {
                "name": "Keep this unassigned",
                "state_id": str(state.id),
                "assignee_ids": [],
            },
            format="json",
        )
        omitted_owner = session_client.post(
            self.issue_collection_url(workspace, project),
            {
                "name": "Use the project default owner",
                "state_id": str(state.id),
            },
            format="json",
        )

        assert explicit_unassigned.status_code == status.HTTP_201_CREATED
        assert explicit_unassigned.data["assignee_ids"] == []
        assert not IssueAssignee.objects.filter(issue_id=explicit_unassigned.data["id"]).exists()

        assert omitted_owner.status_code == status.HTTP_201_CREATED
        assert omitted_owner.data["assignee_ids"] == [str(create_user.id)]
        assert IssueAssignee.objects.filter(
            issue_id=omitted_owner.data["id"],
            assignee=create_user,
        ).exists()

    @pytest.mark.django_db
    def test_waiting_since_tracks_party_lifecycle(self, workspace, project, state):
        first_wait = datetime(2026, 8, 18, 1, 0, tzinfo=datetime_timezone.utc)
        second_wait = datetime(2026, 8, 19, 2, 30, tzinfo=datetime_timezone.utc)

        with patch("plane.db.models.issue.timezone.now", return_value=first_wait):
            issue = Issue.objects.create(
                name="Waiting lifecycle",
                workspace=workspace,
                project=project,
                state=state,
                waiting_party="Supplier",
            )

        assert issue.waiting_since == first_wait

        issue.name = "Unrelated change"
        issue.save()
        assert issue.waiting_since == first_wait

        with patch("plane.db.models.issue.timezone.now", return_value=second_wait):
            issue.waiting_party = "Customer"
            issue.save(update_fields=["waiting_party"])

        issue.refresh_from_db()
        assert issue.waiting_since == second_wait

        issue.waiting_party = "   "
        issue.save(update_fields=["waiting_party"])
        issue.refresh_from_db()
        assert issue.waiting_party is None
        assert issue.waiting_since is None

    @pytest.mark.django_db
    @patch("plane.app.views.issue.base.model_activity.delay")
    @patch("plane.app.views.issue.base.issue_activity.delay")
    def test_app_api_rejects_multiple_owners_and_normalizes_legacy_data_on_owner_change(
        self,
        _mock_issue_activity,
        _mock_model_activity,
        session_client,
        workspace,
        project,
        state,
        create_user,
        second_member,
    ):
        create_response = session_client.post(
            self.issue_collection_url(workspace, project),
            {
                "name": "Invalid ownership",
                "state_id": str(state.id),
                "assignee_ids": [str(create_user.id), str(second_member.id)],
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "assignee_ids" in create_response.data

        issue = Issue.objects.create(
            name="Single owner constraint",
            workspace=workspace,
            project=project,
            state=state,
        )
        IssueAssignee.objects.create(issue=issue, assignee=create_user, workspace=workspace, project=project)
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                IssueAssignee.objects.create(
                    issue=issue,
                    assignee=second_member,
                    workspace=workspace,
                    project=project,
                )

        patch_response = session_client.patch(
            self.issue_detail_url(workspace, project, issue),
            {"assignee_ids": [str(second_member.id)]},
            format="json",
        )

        assert patch_response.status_code == status.HTTP_204_NO_CONTENT
        assert list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == [
            second_member.id
        ]

    @pytest.mark.django_db
    def test_external_and_draft_serializers_reject_multiple_owners(
        self,
        workspace,
        project,
        create_user,
        second_member,
    ):
        external_serializer = ExternalIssueSerializer(
            data={
                "name": "External issue",
                "assignees": [str(create_user.id), str(second_member.id)],
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )
        assert not external_serializer.is_valid()
        assert "assignees" in external_serializer.errors

        valid_external_serializer = ExternalIssueSerializer(
            data={
                "name": "External operational issue",
                "assignees": [str(create_user.id)],
                "waiting_party": "  Logistics partner  ",
                "blocked_reason": "  Customs documents are missing  ",
                "next_action": "  Request the documents  ",
            },
            context={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "default_assignee_id": None,
            },
        )
        assert valid_external_serializer.is_valid(), valid_external_serializer.errors
        external_issue = valid_external_serializer.save()
        external_payload = ExternalIssueSerializer(external_issue).data
        assert external_payload["waiting_party"] == "Logistics partner"
        assert external_payload["waiting_since"] is not None
        assert external_payload["blocked_reason"] == "Customs documents are missing"
        assert external_payload["next_action"] == "Request the documents"
        assert external_payload["assignees"] == [str(create_user.id)]

        # Intake and other internal flows reuse the external serializer without
        # explicitly passing project context. Existing work items must still be
        # able to replace the current owner with one valid owner.
        contextless_update = ExternalIssueSerializer(
            external_issue,
            data={"assignees": [str(second_member.id)]},
            partial=True,
        )
        assert contextless_update.is_valid(), contextless_update.errors
        contextless_update.save()
        assert list(IssueAssignee.objects.filter(issue=external_issue).values_list("assignee_id", flat=True)) == [
            second_member.id
        ]

        draft_serializer = DraftIssueCreateSerializer(
            data={
                "name": "Draft issue",
                "project_id": str(project.id),
                "assignee_ids": [str(create_user.id), str(second_member.id)],
            },
            context={"project_id": project.id, "workspace_id": workspace.id},
        )
        assert not draft_serializer.is_valid()
        assert "assignee_ids" in draft_serializer.errors

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_app_updates_preserve_both_committed_fields(self, workspace, project, state):
        issue = Issue.objects.create(
            name="Concurrent update",
            priority="none",
            workspace=workspace,
            project=project,
            state=state,
        )
        ready = Barrier(2)

        def update_issue(payload):
            close_old_connections()
            try:
                stale_issue = Issue.objects.get(pk=issue.pk)
                serializer = AppIssueSerializer(
                    stale_issue,
                    data=payload,
                    partial=True,
                    context={"project_id": project.id, "workspace_id": workspace.id},
                )
                assert serializer.is_valid(), serializer.errors
                ready.wait(timeout=10)
                serializer.save()
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            updates = [
                executor.submit(update_issue, {"name": "Renamed concurrently"}),
                executor.submit(update_issue, {"priority": "high"}),
            ]
            for update in updates:
                update.result(timeout=20)

        issue.refresh_from_db()
        assert issue.name == "Renamed concurrently"
        assert issue.priority == "high"
