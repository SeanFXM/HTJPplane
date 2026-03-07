#!/bin/bash
set -e
python manage.py wait_for_db
# Wait for migrations
python manage.py wait_for_migrations

# Create the default bucket
#!/bin/bash

# Collect system information
HOSTNAME=$(hostname)
MAC_ADDRESS=$(ip link show | awk '/ether/ {print $2}' | head -n 1)
CPU_INFO=$(cat /proc/cpuinfo)
MEMORY_INFO=$(free -h)
DISK_INFO=$(df -h)

# Concatenate information and compute SHA-256 hash
SIGNATURE=$(echo "$HOSTNAME$MAC_ADDRESS$CPU_INFO$MEMORY_INFO$DISK_INFO" | sha256sum | awk '{print $1}')

# Export the variables
export MACHINE_SIGNATURE=$SIGNATURE

# Register instance
python manage.py register_instance "$MACHINE_SIGNATURE"

# Load the configuration variable
python manage.py configure_instance

# Create the default bucket
python manage.py create_bucket

# Clear Cache before starting to remove stale values
python manage.py clear_cache

# Collect static files
python manage.py collectstatic --noinput

# Allow platforms without a dedicated worker service to opt into
# running a background Celery worker alongside the API process.
if [ "${RUN_EMBEDDED_CELERY_WORKER:-0}" = "1" ]; then
  celery -A plane worker -l info &
  CELERY_WORKER_PID=$!
  trap 'kill "${CELERY_WORKER_PID}" 2>/dev/null || true' EXIT
fi

exec gunicorn -w "$GUNICORN_WORKERS" -k uvicorn.workers.UvicornWorker plane.asgi:application --bind 0.0.0.0:"${PORT:-8000}" --max-requests 1200 --max-requests-jitter 1000 --access-logfile -
