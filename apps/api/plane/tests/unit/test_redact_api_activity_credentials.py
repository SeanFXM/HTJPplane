# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from plane.db.models import APIActivityLog


@pytest.mark.unit
@pytest.mark.django_db
def test_redaction_command_removes_current_and_rotated_tokens(api_token):
    current_secret = api_token.token
    rotated_secret = "plane_api_0123456789abcdef0123456789abcdef"
    current = APIActivityLog.objects.create(
        token_identifier=current_secret,
        path=f"/api/v1/{current_secret}/",
        method="PATCH",
        query_params=f"cursor={current_secret}",
        headers=json.dumps({"x-request-id": current_secret}),
        body=json.dumps({"diagnostic": current_secret}),
        response_code=200,
        response_body=json.dumps({"echo": current_secret}),
        user_agent=f"Hotone/{current_secret}",
    )
    rotated = APIActivityLog.objects.create(
        token_identifier=rotated_secret,
        path=f"/api/v1/{rotated_secret}/",
        method="GET",
        query_params=f"cursor={rotated_secret}",
        headers=rotated_secret,
        body=rotated_secret,
        response_code=200,
        response_body=rotated_secret,
        user_agent=rotated_secret,
    )

    call_command("redact_api_activity_credentials", verbosity=0)

    current.refresh_from_db()
    rotated.refresh_from_db()
    serialized_current = json.dumps(
        {
            "token_identifier": current.token_identifier,
            "path": current.path,
            "query_params": current.query_params,
            "headers": current.headers,
            "body": current.body,
            "response_body": current.response_body,
            "user_agent": current.user_agent,
        }
    )
    serialized_rotated = json.dumps(
        {
            "token_identifier": rotated.token_identifier,
            "path": rotated.path,
            "query_params": rotated.query_params,
            "headers": rotated.headers,
            "body": rotated.body,
            "response_body": rotated.response_body,
            "user_agent": rotated.user_agent,
        }
    )
    assert current_secret not in serialized_current
    assert rotated_secret not in serialized_rotated
    assert current.token_identifier == f"api-token:{api_token.id}"
    assert rotated.token_identifier == "api-token:legacy-redacted"
    assert "[REDACTED]" in serialized_current
    assert "[REDACTED]" in serialized_rotated


@pytest.mark.unit
@pytest.mark.django_db
@override_settings(
    MONGO_DB_URL="mongodb://configured-but-unavailable.invalid",
    MONGO_DB_DATABASE="plane",
)
def test_redaction_command_fails_closed_when_configured_mongo_is_unavailable():
    with (
        patch(
            "plane.db.management.commands.redact_api_activity_credentials.MongoConnection.is_configured",
            return_value=False,
        ),
        pytest.raises(CommandError, match="configured but unavailable"),
    ):
        call_command("redact_api_activity_credentials", verbosity=0)
