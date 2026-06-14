#!/usr/bin/env bash
# Build Plane's web + admin static SPAs for hosting on Cloudflare Pages / Netlify.
#
# These two apps are `ssr: false` (pure static client bundles), so a CDN can
# serve them for free — no 24h Node process on Railway.
#
# Two hosting modes (see README.md):
#   MODE=same-origin  (default) — base URLs stay relative; a Cloudflare Worker
#                                  proxies /api,/auth,/spaces,/live to Railway.
#                                  No CORS, no rebuild when the domain changes.
#   MODE=cross-origin            — bake the Railway backend URL into the bundle.
#                                  Requires BACKEND_URL and CORS on the API.
#
# Usage:
#   ./build.sh                                   # same-origin
#   MODE=cross-origin BACKEND_URL=https://api.example.com ./build.sh
#
# Outputs:
#   dist/web    -> upload as Cloudflare Pages project (root path)
#   dist/admin  -> upload as Cloudflare Pages project (served under /god-mode)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deployments/cloudflare-pages/dist"
MODE="${MODE:-same-origin}"

cd "$ROOT"

if [ "$MODE" = "cross-origin" ]; then
	: "${BACKEND_URL:?set BACKEND_URL to your Railway backend, e.g. https://plane-api.up.railway.app}"
	export VITE_API_BASE_URL="$BACKEND_URL"
	export VITE_LIVE_BASE_URL="$BACKEND_URL"
	export VITE_SPACE_BASE_URL="$BACKEND_URL"
	echo "▶ cross-origin build against backend: $BACKEND_URL"
else
	# same-origin: leave *_BASE_URL empty so the app calls relative paths,
	# which the Cloudflare Worker reverse-proxies to Railway.
	export VITE_API_BASE_URL=""
	export VITE_LIVE_BASE_URL=""
	export VITE_SPACE_BASE_URL=""
	echo "▶ same-origin build (relative URLs; proxy /api,/auth,/spaces,/live via Worker)"
fi

# Path-based routing is identical to the AIO setup.
export VITE_API_BASE_PATH="/api"
export VITE_ADMIN_BASE_PATH="/god-mode"
export VITE_SPACE_BASE_PATH="/spaces"
export VITE_LIVE_BASE_PATH="/live"

echo "▶ installing deps…"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

echo "▶ building web + admin…"
pnpm turbo run build --filter=web --filter=admin

rm -rf "$OUT"
mkdir -p "$OUT/web" "$OUT/admin"
cp -R apps/web/build/client/.   "$OUT/web/"
cp -R apps/admin/build/client/. "$OUT/admin/"

# SPA fallback so client-side routes resolve to index.html.
printf '/*    /index.html    200\n'            > "$OUT/web/_redirects"
printf '/god-mode/*    /index.html    200\n'   > "$OUT/admin/_redirects"

echo "✅ done:"
echo "   $OUT/web    -> Cloudflare Pages project (root)"
echo "   $OUT/admin  -> Cloudflare Pages project (mount at /god-mode)"
