#!/bin/bash
set -e

python manage.py wait_for_db $1

python manage.py migrate $1
python manage.py redact_api_activity_credentials $1
