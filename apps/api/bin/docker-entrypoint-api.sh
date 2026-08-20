#!/bin/bash
set -e
python manage.py wait_for_db
# Wait for migrations
python manage.py wait_for_migrations

# A parallel validation deployment may share production dependencies. In that
# mode, start Django without registering another instance, mutating the bucket,
# publishing trace work, or clearing the production Redis cache. Normal API and
# cutover deployments keep the existing bootstrap behaviour by default.
if [ "${SKIP_API_BOOTSTRAP:-0}" != "1" ]; then
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

  # Register instance and synchronize runtime configuration
  python manage.py register_instance "$MACHINE_SIGNATURE"
  python manage.py configure_instance

  # Create the default bucket and remove stale cached configuration
  python manage.py create_bucket
  python manage.py clear_cache
else
  echo "Skipping API bootstrap side effects for parallel validation"
fi

# Collect static files
python manage.py collectstatic --noinput

# Allow platforms without a dedicated worker service to opt into
# running a background Celery worker alongside the API process.
# Cap concurrency: Celery's prefork pool defaults to one process per CPU the
# container can see (often 8+ on shared hosts), and each process loads the full
# Django app — easily >1GB of RAM. CELERY_WORKER_CONCURRENCY (default 2) bounds it.
if [ "${RUN_EMBEDDED_CELERY_WORKER:-0}" = "1" ]; then
  celery -A plane worker -l info --concurrency="${CELERY_WORKER_CONCURRENCY:-2}" &
  CELERY_WORKER_PID=$!
  trap 'kill "${CELERY_WORKER_PID}" 2>/dev/null || true' EXIT
fi

exec gunicorn -w "$GUNICORN_WORKERS" -k uvicorn.workers.UvicornWorker plane.asgi:application --bind 0.0.0.0:"${PORT:-8000}" --max-requests 1200 --max-requests-jitter 1000 --access-logfile -
