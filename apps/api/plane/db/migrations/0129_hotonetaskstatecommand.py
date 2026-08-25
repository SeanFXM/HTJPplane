# Generated for Hotone's idempotent work-item state compare-and-set endpoint.

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0128_retire_guest_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="HotoneTaskStateCommand",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("command_id", models.UUIDField(db_index=True, editable=False, unique=True)),
                ("workspace_id", models.UUIDField(db_index=True)),
                ("workspace_slug", models.CharField(max_length=80)),
                ("project_id", models.UUIDField(db_index=True)),
                ("issue_id", models.UUIDField(db_index=True)),
                ("actor_id", models.UUIDField(db_index=True)),
                ("service_actor_id", models.UUIDField(db_index=True)),
                ("target_state_id", models.UUIDField()),
                ("activity_id", models.UUIDField(blank=True, null=True)),
                ("expected_updated_at", models.DateTimeField()),
                ("response_status", models.PositiveSmallIntegerField()),
                ("response_body", models.JSONField(default=dict)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "db_table": "hotone_task_state_commands",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="hotonetaskstatecommand",
            index=models.Index(
                fields=["issue_id", "created_at"],
                name="hotone_cmd_issue_created_idx",
            ),
        ),
    ]
