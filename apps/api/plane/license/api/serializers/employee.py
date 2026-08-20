# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import WorkspaceMember
from plane.utils.internal_roles import MEMBER_ROLE, parse_assignable_role

from .base import BaseSerializer


class InstanceEmployeeCreateSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    email = serializers.EmailField(max_length=255)
    initial_password = serializers.CharField(
        min_length=8,
        max_length=128,
        allow_blank=False,
        trim_whitespace=False,
        write_only=True,
    )
    role = serializers.IntegerField(default=MEMBER_ROLE)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_initial_password(self, value):
        if not value.strip():
            raise serializers.ValidationError("Initial password cannot be blank.", code="BLANK_PASSWORD")
        return value

    def validate_role(self, value):
        try:
            return parse_assignable_role(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error), code="INVALID_ROLE") from error


class InstanceEmployeeUpdateSerializer(serializers.Serializer):
    role = serializers.IntegerField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_role(self, value):
        try:
            return parse_assignable_role(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error), code="INVALID_ROLE") from error

    def validate(self, attrs):
        unknown_fields = set(self.initial_data) - set(self.fields)
        if unknown_fields:
            fields = ", ".join(sorted(unknown_fields))
            raise serializers.ValidationError(
                {"non_field_errors": [f"Unsupported field(s): {fields}."]},
                code="UNSUPPORTED_FIELDS",
            )

        if "is_active" in self.initial_data and not isinstance(self.initial_data["is_active"], bool):
            raise serializers.ValidationError(
                {"is_active": ["Must be a boolean."]},
                code="INVALID_BOOLEAN",
            )

        if not attrs:
            raise serializers.ValidationError(
                {"non_field_errors": ["Provide role or is_active."]},
                code="EMPTY_UPDATE",
            )
        return attrs


class InstanceEmployeeSerializer(BaseSerializer):
    display_name = serializers.CharField(source="member.display_name", read_only=True)
    email = serializers.EmailField(source="member.email", read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = [
            "id",
            "display_name",
            "email",
            "role",
            "is_active",
            "created_at",
        ]
        read_only_fields = fields
