from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0121_user_preference_defaults_for_hotone"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceAnnouncement",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
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
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("important", "Important task"),
                            ("update", "Update"),
                            ("fix", "Fix"),
                        ],
                        default="important",
                        max_length=20,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="workspaceannouncement_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_workspaceannouncement",
                        to="db.project",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="workspaceannouncement_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_workspaceannouncement",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Workspace Announcement",
                "verbose_name_plural": "Workspace Announcements",
                "db_table": "workspace_announcements",
                "ordering": ("-created_at",),
            },
        ),
    ]
