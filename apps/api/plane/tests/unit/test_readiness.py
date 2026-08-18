# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import MagicMock, patch

import pytest
from django.db import OperationalError
from django.test import RequestFactory

from plane.web.views import readiness_check


@pytest.mark.unit
class TestReadinessCheck:
    def test_returns_ok_after_database_query(self):
        cursor = MagicMock()
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with patch("plane.web.views.connection.cursor", return_value=cursor_context):
            response = readiness_check(RequestFactory().get("/health/ready/"))

        assert response.status_code == 200
        assert json.loads(response.content) == {"status": "OK"}
        cursor.execute.assert_called_once_with("SELECT 1")
        cursor.fetchone.assert_called_once_with()

    def test_returns_unavailable_when_database_is_not_ready(self):
        with patch("plane.web.views.connection.cursor", side_effect=OperationalError("database unavailable")):
            response = readiness_check(RequestFactory().get("/health/ready/"))

        assert response.status_code == 503
        assert json.loads(response.content) == {"status": "UNAVAILABLE"}
