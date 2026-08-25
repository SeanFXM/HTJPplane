# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import re
from collections.abc import Mapping
from typing import Any


API_TOKEN_PATTERN = re.compile(r"plane_api_[0-9a-fA-F]{32}")
SAFE_TOKEN_IDENTIFIER_PATTERN = re.compile(r"api-token:(?:[0-9a-fA-F-]{36}|unknown|legacy-redacted)")
REDACTED = "[REDACTED]"


def redact_api_credentials(value: Any, *exact_secrets: str | None) -> Any:
    """Remove bearer credentials while preserving non-string values."""
    if not isinstance(value, str):
        return value
    redacted = value
    for secret in exact_secrets:
        if secret:
            redacted = redacted.replace(secret, REDACTED)
    return API_TOKEN_PATTERN.sub(REDACTED, redacted)


def _redact_payload_value(value: Any, *exact_secrets: str | None) -> Any:
    if isinstance(value, Mapping):
        return {key: _redact_payload_value(item, *exact_secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_payload_value(item, *exact_secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact_payload_value(item, *exact_secrets) for item in value)
    return redact_api_credentials(value, *exact_secrets)


def sanitize_api_activity_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Fail closed before an API activity payload reaches durable storage.

    HTTP middleware already removes the authenticated bearer.  The worker
    repeats pattern redaction so stale web workers or manually queued jobs
    cannot persist a generated Plane API token in Postgres or MongoDB.
    """
    raw_token_identifier = payload.get("token_identifier")
    stale_bearer = (
        raw_token_identifier
        if isinstance(raw_token_identifier, str) and not SAFE_TOKEN_IDENTIFIER_PATTERN.fullmatch(raw_token_identifier)
        else None
    )
    sanitized = {key: _redact_payload_value(value, stale_bearer) for key, value in payload.items()}
    token_identifier = sanitized.get("token_identifier")
    if not isinstance(token_identifier, str) or not SAFE_TOKEN_IDENTIFIER_PATTERN.fullmatch(token_identifier):
        sanitized["token_identifier"] = "api-token:legacy-redacted"
    return sanitized
