# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

ADMIN_ROLE = 20
MEMBER_ROLE = 15
INTERNAL_ASSIGNABLE_ROLE_VALUES = frozenset({ADMIN_ROLE, MEMBER_ROLE})
LEGACY_INTERNAL_ROLE_VALUES = frozenset({5, 10})


def parse_assignable_role(value, default=MEMBER_ROLE):
    """Parse a new role assignment and reject retired or unknown roles."""
    if value is None:
        return default
    try:
        role = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Role must be Member (15) or Admin (20)") from error
    if role not in INTERNAL_ASSIGNABLE_ROLE_VALUES:
        raise ValueError("Role must be Member (15) or Admin (20)")
    return role


def normalize_legacy_internal_role(value):
    """Promote a legacy Guest role while processing an invitation created before migration."""
    try:
        role = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Invalid legacy role") from error
    if role in INTERNAL_ASSIGNABLE_ROLE_VALUES:
        return role
    if role in LEGACY_INTERNAL_ROLE_VALUES:
        return MEMBER_ROLE
    raise ValueError("Invalid legacy role")
