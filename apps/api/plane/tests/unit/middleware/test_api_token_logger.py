# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json
from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.http import JsonResponse
from django.test import RequestFactory

from plane.bgtasks.logger_task import log_to_mongo, log_to_postgres
from plane.db.models import APIActivityLog
from plane.middleware.logger import APITokenLogMiddleware, RequestLoggerMiddleware


@pytest.mark.unit
@pytest.mark.django_db
def test_api_activity_log_never_contains_the_bearer_secret(api_token):
    secret = api_token.token
    generated_secret = "plane_api_0123456789abcdef0123456789abcdef"
    request = RequestFactory().post(
        f"/api/v1/{generated_secret}/?cursor={secret}&next={generated_secret}",
        data=json.dumps({"diagnostic": secret, "nested": generated_secret}),
        content_type="application/json",
        HTTP_X_API_KEY=secret,
        HTTP_AUTHORIZATION=f"Bearer {secret}",
        HTTP_COOKIE=f"session={secret}",
        HTTP_USER_AGENT=f"Hotone/{secret}",
        HTTP_ACCEPT_LANGUAGE=f"ja,{secret}",
        HTTP_X_FORWARDED_FOR=f"{secret},203.0.113.10",
        HTTP_X_REQUEST_ID=f"request-{secret}",
    )
    request.user = AnonymousUser()
    middleware = APITokenLogMiddleware(
        lambda _request: JsonResponse(
            {"echo": secret, "nested": generated_secret},
            status=200,
        )
    )

    with patch("plane.middleware.logger.process_logs.delay") as delay:
        response = middleware(request)

    assert response.status_code == 200
    delay.assert_called_once()
    queued = delay.call_args.kwargs
    assert secret not in json.dumps(queued, default=str)
    assert generated_secret not in json.dumps(queued, default=str)
    assert queued["log_data"]["token_identifier"] == f"api-token:{api_token.id}"
    assert queued["log_data"]["path"] == "/api/v1/[REDACTED]/"
    headers = json.loads(queued["log_data"]["headers"])
    assert headers == {
        "accept-language": "ja,[REDACTED]",
        "content-type": "application/json",
        "user-agent": "Hotone/[REDACTED]",
        "x-forwarded-for": "[REDACTED],203.0.113.10",
        "x-request-id": "request-[REDACTED]",
    }
    assert queued["log_data"]["query_params"] == ("cursor=[REDACTED]&next=[REDACTED]")
    assert queued["log_data"]["ip_address"] is None
    assert "[REDACTED]" in queued["log_data"]["body"]
    assert "[REDACTED]" in queued["log_data"]["response_body"]


@pytest.mark.unit
@pytest.mark.django_db
def test_general_request_log_never_copies_token_from_query_or_user_agent(api_token):
    secret = api_token.token
    generated_secret = "plane_api_0123456789abcdef0123456789abcdef"
    request = RequestFactory().get(
        f"/api/v1/{generated_secret}/?cursor={secret}",
        HTTP_X_API_KEY=secret,
        HTTP_USER_AGENT=f"Hotone/{secret}/{generated_secret}",
        HTTP_X_FORWARDED_FOR=generated_secret,
    )
    request.user = AnonymousUser()
    middleware = RequestLoggerMiddleware(lambda _request: JsonResponse({"ok": True}, status=200))

    with patch("plane.middleware.logger.api_logger.info") as info:
        response = middleware(request)

    assert response.status_code == 200
    info.assert_called_once()
    serialized = json.dumps(
        {"args": info.call_args.args, "kwargs": info.call_args.kwargs},
        default=str,
    )
    assert secret not in serialized
    assert generated_secret not in serialized
    assert info.call_args.args[0] == "GET /api/v1/[REDACTED]/ 200"
    assert info.call_args.kwargs["extra"]["user_agent"] == ("Hotone/[REDACTED]/[REDACTED]")
    assert info.call_args.kwargs["extra"]["remote_addr"] == "[REDACTED]"


@pytest.mark.unit
@pytest.mark.django_db
def test_worker_redacts_stale_payload_before_postgres_write():
    secret = "legacy-custom-api-token"
    payload = {
        "token_identifier": secret,
        "path": f"/api/v1/{secret}/",
        "method": "PATCH",
        "query_params": f"cursor={secret}",
        "headers": json.dumps({"x-request-id": secret}),
        "body": json.dumps({"token": secret}),
        "response_code": 200,
        "response_body": secret,
        "user_agent": f"Hotone/{secret}",
    }

    assert log_to_postgres(payload) is True

    stored = APIActivityLog.objects.get()
    assert secret not in json.dumps(
        {
            "token_identifier": stored.token_identifier,
            "path": stored.path,
            "query_params": stored.query_params,
            "headers": stored.headers,
            "body": stored.body,
            "response_body": stored.response_body,
            "user_agent": stored.user_agent,
        }
    )
    assert stored.token_identifier == "api-token:legacy-redacted"


@pytest.mark.unit
def test_worker_redacts_nested_stale_payload_before_mongo_write():
    secret = "legacy-custom-api-token"
    collection = type("Collection", (), {"insert_one": lambda self, value: None})()
    payload = {
        "token_identifier": secret,
        "path": "/api/v1/work-items/",
        "nested": {"authorization": f"Bearer {secret}"},
    }

    with (
        patch("plane.bgtasks.logger_task.get_mongo_collection", return_value=collection),
        patch.object(collection, "insert_one") as insert_one,
    ):
        assert log_to_mongo(payload) is True

    inserted = insert_one.call_args.args[0]
    assert secret not in json.dumps(inserted)
    assert inserted["token_identifier"] == "api-token:legacy-redacted"
