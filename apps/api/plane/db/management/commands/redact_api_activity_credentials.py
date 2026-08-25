# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

import re

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import F, Q, Value
from django.db.models.functions import Replace
from pymongo import UpdateOne

from plane.db.models import APIActivityLog, APIToken
from plane.settings.mongo import MongoConnection


LOG_TEXT_FIELDS = (
    "path",
    "query_params",
    "headers",
    "body",
    "response_body",
    "user_agent",
)
TOKEN_PATTERN = re.compile(r"plane_api_[0-9a-fA-F]{32}")


class Command(BaseCommand):
    help = "Irreversibly redact API bearer credentials from Postgres and Mongo activity logs"

    def handle(self, *args, **options):
        postgres_updates = 0
        mongo_updates = 0
        mongo_expected = bool(getattr(settings, "MONGO_DB_URL", None) and getattr(settings, "MONGO_DB_DATABASE", None))
        mongo_collection = (
            MongoConnection.get_collection("api_activity_logs") if MongoConnection.is_configured() else None
        )
        if mongo_expected and mongo_collection is None:
            raise CommandError("Mongo API activity logs are configured but unavailable")

        for token_id, raw_token in APIToken.objects.values_list("id", "token").iterator(chunk_size=500):
            if not raw_token:
                continue
            safe_identifier = f"api-token:{token_id}"
            postgres_updates += APIActivityLog.objects.filter(token_identifier=raw_token).update(
                token_identifier=safe_identifier
            )
            for field in LOG_TEXT_FIELDS:
                postgres_updates += APIActivityLog.objects.filter(**{f"{field}__contains": raw_token}).update(
                    **{
                        field: Replace(
                            F(field),
                            Value(raw_token),
                            Value("[REDACTED]"),
                        )
                    }
                )

            if mongo_collection is not None:
                mongo_updates += self._redact_mongo_token(
                    mongo_collection,
                    raw_token=raw_token,
                    safe_identifier=safe_identifier,
                )

        postgres_updates += APIActivityLog.objects.filter(token_identifier__startswith="plane_api_").update(
            token_identifier="api-token:legacy-redacted"
        )
        postgres_updates += self._redact_postgres_token_pattern()
        if mongo_collection is not None:
            result = mongo_collection.update_many(
                {"token_identifier": {"$regex": "^plane_api_"}},
                {"$set": {"token_identifier": "api-token:legacy-redacted"}},
            )
            mongo_updates += result.modified_count
            mongo_updates += self._redact_mongo_token_pattern(mongo_collection)

        postgres_leaks = self._postgres_leak_count()
        mongo_leaks = self._mongo_leak_count(mongo_collection) if mongo_collection is not None else 0
        if postgres_leaks or mongo_leaks:
            raise CommandError(
                f"API activity credential redaction verification failed: postgres={postgres_leaks}, mongo={mongo_leaks}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Redacted API activity credentials: postgres_updates={postgres_updates}, "
                f"mongo_documents={mongo_updates}"
            )
        )

    @staticmethod
    def _redact_mongo_token(collection, *, raw_token: str, safe_identifier: str) -> int:
        query = {
            "$or": [
                {"token_identifier": raw_token},
                *[{field: {"$regex": re.escape(raw_token)}} for field in LOG_TEXT_FIELDS],
            ]
        }
        projection = {field: 1 for field in ("token_identifier", *LOG_TEXT_FIELDS)}
        operations = []
        modified = 0
        for document in collection.find(query, projection=projection, batch_size=500):
            changes = {}
            if document.get("token_identifier") == raw_token:
                changes["token_identifier"] = safe_identifier
            for field in LOG_TEXT_FIELDS:
                value = document.get(field)
                if isinstance(value, str) and raw_token in value:
                    changes[field] = value.replace(raw_token, "[REDACTED]")
            if changes:
                operations.append(UpdateOne({"_id": document["_id"]}, {"$set": changes}))
            if len(operations) >= 500:
                result = collection.bulk_write(operations, ordered=False)
                modified += result.modified_count
                operations = []
        if operations:
            result = collection.bulk_write(operations, ordered=False)
            modified += result.modified_count
        return modified

    @staticmethod
    def _redact_postgres_token_pattern() -> int:
        table = connection.ops.quote_name(APIActivityLog._meta.db_table)
        modified = 0
        with connection.cursor() as cursor:
            for field in LOG_TEXT_FIELDS:
                column = connection.ops.quote_name(field)
                cursor.execute(
                    f"""
                    UPDATE {table}
                    SET {column} = regexp_replace({column}, %s, '[REDACTED]', 'g')
                    WHERE {column} ~ %s
                    """,
                    [TOKEN_PATTERN.pattern, TOKEN_PATTERN.pattern],
                )
                modified += cursor.rowcount
        return modified

    @staticmethod
    def _redact_mongo_token_pattern(collection) -> int:
        query = {
            "$or": [{field: {"$regex": TOKEN_PATTERN.pattern}} for field in ("token_identifier", *LOG_TEXT_FIELDS)]
        }
        projection = {field: 1 for field in ("token_identifier", *LOG_TEXT_FIELDS)}
        operations = []
        modified = 0
        for document in collection.find(query, projection=projection, batch_size=500):
            changes = {}
            for field in ("token_identifier", *LOG_TEXT_FIELDS):
                value = document.get(field)
                if not isinstance(value, str) or not TOKEN_PATTERN.search(value):
                    continue
                changes[field] = (
                    "api-token:legacy-redacted"
                    if field == "token_identifier"
                    else TOKEN_PATTERN.sub("[REDACTED]", value)
                )
            if changes:
                operations.append(UpdateOne({"_id": document["_id"]}, {"$set": changes}))
            if len(operations) >= 500:
                result = collection.bulk_write(operations, ordered=False)
                modified += result.modified_count
                operations = []
        if operations:
            result = collection.bulk_write(operations, ordered=False)
            modified += result.modified_count
        return modified

    @staticmethod
    def _postgres_leak_count() -> int:
        query = Q(token_identifier__regex=TOKEN_PATTERN.pattern)
        for field in LOG_TEXT_FIELDS:
            query |= Q(**{f"{field}__regex": TOKEN_PATTERN.pattern})
        return APIActivityLog.objects.filter(query).count()

    @staticmethod
    def _mongo_leak_count(collection) -> int:
        return collection.count_documents(
            {"$or": [{field: {"$regex": TOKEN_PATTERN.pattern}} for field in ("token_identifier", *LOG_TEXT_FIELDS)]},
            limit=1,
        )
