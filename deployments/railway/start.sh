#!/bin/bash
# Plane All-In-One entrypoint for Railway.
# Env vars come straight from the Railway dashboard — we only derive a few
# defaults here, then hand off to supervisord (which inherits the environment
# and passes it to every child process).
set -e

echo "------------------------------------------------"
echo " Plane Community — All-In-One (Railway)"
echo "------------------------------------------------"

# --- required vars (incl. secrets — NO insecure default, fail hard) ---------
missing=0
for key in DATABASE_URL REDIS_URL AMQP_URL SECRET_KEY LIVE_SERVER_SECRET_KEY; do
	if [ -z "${!key}" ]; then
		echo "  ❌ $key is not set"
		missing=1
	fi
done
if [ "$missing" = "1" ]; then
	echo "Aborting: required vars missing. Set DATABASE_URL, REDIS_URL, AMQP_URL, and"
	echo "the secrets SECRET_KEY / LIVE_SERVER_SECRET_KEY. Generate a secret with:"
	echo "    python -c 'import secrets; print(secrets.token_hex(32))'"
	exit 1
fi

# S3-compatible object storage (Cloudflare R2 / AWS S3 / etc.)
for key in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET_NAME AWS_S3_ENDPOINT_URL; do
	[ -z "${!key}" ] && echo "  ⚠️  $key not set — file uploads will fail until configured"
done

# --- Caddy listen address: Railway injects $PORT ----------------------------
export SITE_ADDRESS=":${PORT:-80}"

# --- sensible defaults (override any of these in Railway) -------------------
export USE_MINIO="${USE_MINIO:-0}"
export GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
export CELERY_WORKER_CONCURRENCY="${CELERY_WORKER_CONCURRENCY:-2}"
export FILE_SIZE_LIMIT="${FILE_SIZE_LIMIT:-5242880}"
# SECRET_KEY / LIVE_SERVER_SECRET_KEY are validated as required above — no default.
export API_KEY_RATE_LIMIT="${API_KEY_RATE_LIMIT:-60/minute}"
export BUCKET_NAME="${BUCKET_NAME:-${AWS_S3_BUCKET_NAME}}"
# We run a dedicated [worker] under supervisor, so do NOT also embed one in api.
export RUN_EMBEDDED_CELERY_WORKER="0"

# --- derive public URLs / CORS from the domain, if provided -----------------
if [ -n "$DOMAIN_NAME" ]; then
	proto="${APP_PROTOCOL:-https}"
	export WEB_URL="${WEB_URL:-$proto://$DOMAIN_NAME}"
	export APP_DOMAIN="${APP_DOMAIN:-$DOMAIN_NAME}"
	export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://$DOMAIN_NAME,https://$DOMAIN_NAME}"
fi

echo "✅ Booting: SITE_ADDRESS=$SITE_ADDRESS  GUNICORN_WORKERS=$GUNICORN_WORKERS  CELERY_WORKER_CONCURRENCY=$CELERY_WORKER_CONCURRENCY  ENABLE_SPACE=${ENABLE_SPACE:-1}  ENABLE_LIVE=${ENABLE_LIVE:-1}"
echo "------------------------------------------------"

exec /usr/local/bin/supervisord -c /etc/supervisor/conf.d/supervisor.conf
