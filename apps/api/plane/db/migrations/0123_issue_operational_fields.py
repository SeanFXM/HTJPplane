from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0122_workspaceannouncement"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="waiting_party",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="waiting_since",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="blocked_reason",
            field=models.TextField(blank=True, default="", max_length=2000),
        ),
        migrations.AddField(
            model_name="issue",
            name="next_action",
            field=models.TextField(blank=True, default="", max_length=1000),
        ),
    ]
