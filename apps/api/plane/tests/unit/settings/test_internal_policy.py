# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.test import override_settings

from plane.license.models import InstanceConfiguration
from plane.license.utils.instance_value import get_configuration_value


@pytest.mark.unit
class TestInternalPolicyConfiguration:
    @pytest.mark.django_db
    @override_settings(SKIP_ENV_VAR=True, HOTONE_INTERNAL_MODE=True)
    def test_internal_environment_policy_overrides_stale_database_values(self, monkeypatch):
        InstanceConfiguration.objects.create(
            key="ENABLE_SIGNUP",
            value="1",
            category="AUTHENTICATION",
        )
        InstanceConfiguration.objects.create(
            key="DISABLE_WORKSPACE_CREATION",
            value="0",
            category="INSTANCE",
        )
        monkeypatch.setenv("ENABLE_SIGNUP", "0")
        monkeypatch.setenv("DISABLE_WORKSPACE_CREATION", "1")

        values = get_configuration_value(
            [
                {"key": "ENABLE_SIGNUP", "default": "1"},
                {"key": "DISABLE_WORKSPACE_CREATION", "default": "0"},
            ]
        )

        assert values == ("0", "1")

    @pytest.mark.django_db
    @override_settings(SKIP_ENV_VAR=True, HOTONE_INTERNAL_MODE=False)
    def test_regular_installation_keeps_database_configuration(self, monkeypatch):
        InstanceConfiguration.objects.create(
            key="ENABLE_SIGNUP",
            value="1",
            category="AUTHENTICATION",
        )
        monkeypatch.setenv("ENABLE_SIGNUP", "0")

        values = get_configuration_value([{"key": "ENABLE_SIGNUP", "default": "0"}])

        assert values == ("1",)
