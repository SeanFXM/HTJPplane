from django.db import migrations, models
from django.db.models import Count, Q
from django.utils import timezone


def collapse_multiple_current_owners(apps, schema_editor):
    issue_assignee = apps.get_model("db", "IssueAssignee")
    duplicate_issue_ids = (
        issue_assignee.objects.filter(deleted_at__isnull=True)
        .values("issue_id")
        .annotate(owner_count=Count("id"))
        .filter(owner_count__gt=1)
        .values_list("issue_id", flat=True)
    )

    deleted_at = timezone.now()
    for issue_id in duplicate_issue_ids.iterator():
        assignment_ids = list(
            issue_assignee.objects.filter(issue_id=issue_id, deleted_at__isnull=True)
            .order_by("-updated_at", "-created_at", "-id")
            .values_list("id", flat=True)
        )
        issue_assignee.objects.filter(id__in=assignment_ids[1:]).update(deleted_at=deleted_at)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_profile_theme_callable_default"),
    ]

    operations = [
        migrations.RunPython(collapse_multiple_current_owners, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="issueassignee",
            constraint=models.UniqueConstraint(
                fields=("issue",),
                condition=Q(deleted_at__isnull=True),
                name="issue_assignee_unique_current_owner",
            ),
        ),
    ]
