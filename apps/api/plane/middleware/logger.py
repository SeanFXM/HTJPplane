# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import logging
import time

# Django imports
from django.http import HttpRequest
from django.utils import timezone

# Third party imports
from rest_framework.request import Request

# Module imports
from plane.utils.ip_address import get_client_ip
from plane.utils.exception_logger import log_exception
from plane.bgtasks.logger_task import process_logs
from plane.db.models import APIToken
from plane.utils.credential_redaction import redact_api_credentials

api_logger = logging.getLogger("plane.api.request")


class RequestLoggerMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def _should_log_route(self, request: Request | HttpRequest) -> bool:
        """
        Determines whether a route should be logged based on the request and status code.
        """
        # Don't log health checks
        if request.path == "/" and request.method == "GET":
            return False
        return True

    def __call__(self, request):
        # get the start time
        start_time = time.time()

        # Get the response
        response = self.get_response(request)

        # calculate the duration
        duration = time.time() - start_time

        # Check if logging is required
        log_true = self._should_log_route(request=request)

        # If logging is not required, return the response
        if not log_true:
            return response

        user_id = (
            request.user.id if getattr(request, "user") and getattr(request.user, "is_authenticated", False) else None
        )

        api_key = request.headers.get("X-Api-Key")
        safe_path = redact_api_credentials(request.path, api_key)
        safe_remote_addr = redact_api_credentials(get_client_ip(request), api_key)
        user_agent = redact_api_credentials(
            request.META.get("HTTP_USER_AGENT", ""),
            api_key,
        )

        # Log the request information
        api_logger.info(
            f"{request.method} {safe_path} {response.status_code}",
            extra={
                "path": safe_path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": int(duration * 1000),
                "remote_addr": safe_remote_addr,
                "user_agent": user_agent,
                "user_id": user_id,
            },
        )

        # return the response
        return response


class APITokenLogMiddleware:
    """
    Middleware to log External API requests to MongoDB or PostgreSQL.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_body = request.body
        response = self.get_response(request)
        self.process_request(request, response, request_body)
        return response

    def _safe_decode_body(self, content):
        """
        Safely decodes request/response body content, handling binary data.
        Returns None if content is None, or a string representation of the content.
        """
        # If the content is None, return None
        if content is None:
            return None

        # If the content is an empty bytes object, return None
        if content == b"":
            return None

        # Check if content is binary by looking for common binary file signatures
        if content.startswith(b"\x89PNG") or content.startswith(b"\xff\xd8\xff") or content.startswith(b"%PDF"):
            return "[Binary Content]"

        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return "[Could not decode content]"

    @staticmethod
    def _token_identifier(api_key):
        """Return a stable database identifier without persisting the bearer secret."""
        token_id = APIToken.objects.filter(token=api_key).values_list("id", flat=True).first()
        return f"api-token:{token_id}" if token_id else "api-token:unknown"

    @staticmethod
    def _safe_headers(request, secret):
        """Log only non-credential request metadata.

        Django's string representation contains X-Api-Key, Authorization and
        Cookie verbatim.  An explicit allow-list prevents a new authentication
        header from silently becoming durable activity-log data.
        """
        allowed = {
            "accept",
            "accept-language",
            "content-type",
            "user-agent",
            "x-forwarded-for",
            "x-forwarded-host",
            "x-forwarded-proto",
            "x-request-id",
        }
        return json.dumps(
            {
                name.lower(): APITokenLogMiddleware._redact_exact_secret(value, secret)
                for name, value in request.headers.items()
                if name.lower() in allowed
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @staticmethod
    def _redact_exact_secret(value, secret):
        return redact_api_credentials(value, secret)

    def process_request(self, request, response, request_body):
        api_key_header = "X-Api-Key"
        api_key = request.headers.get(api_key_header)

        # If the API key is not present, return
        if not api_key:
            return

        try:
            raw_ip_address = get_client_ip(request=request)
            safe_ip_address = self._redact_exact_secret(raw_ip_address, api_key)
            log_data = {
                "token_identifier": self._token_identifier(api_key),
                "path": self._redact_exact_secret(request.path, api_key),
                "method": request.method,
                "query_params": self._redact_exact_secret(request.META.get("QUERY_STRING", ""), api_key),
                "headers": self._safe_headers(request, api_key),
                "body": self._redact_exact_secret(
                    self._safe_decode_body(request_body) if request_body else None,
                    api_key,
                ),
                "response_body": self._redact_exact_secret(
                    self._safe_decode_body(response.content) if response.content else None,
                    api_key,
                ),
                "response_code": response.status_code,
                "ip_address": safe_ip_address if safe_ip_address == raw_ip_address else None,
                "user_agent": self._redact_exact_secret(request.META.get("HTTP_USER_AGENT", None), api_key),
            }
            user_id = (
                str(request.user.id)
                if getattr(request, "user") and getattr(request.user, "is_authenticated", False)
                else None
            )
            # Additional fields for MongoDB
            mongo_log = {
                **log_data,
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
                "created_by": user_id,
                "updated_by": user_id,
            }

            process_logs.delay(log_data=log_data, mongo_log=mongo_log)

        except Exception as e:
            log_exception(e)

        return None
