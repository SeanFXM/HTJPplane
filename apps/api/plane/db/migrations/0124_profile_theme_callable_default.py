import plane.db.models.user
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0123_issue_operational_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="profile",
            name="theme",
            field=models.JSONField(default=plane.db.models.user.get_default_profile_theme),
        ),
    ]
