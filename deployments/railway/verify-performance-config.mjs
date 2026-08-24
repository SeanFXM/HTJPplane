#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readRepositoryFile = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

const caddyfile = readRepositoryFile("deployments/railway/Caddyfile");
assert.match(caddyfile, /encode\s+zstd\s+gzip/, "Caddy must negotiate zstd and gzip compression");
assert.match(
  caddyfile,
  /handle_path\s+\/god-mode\/assets\/\*[\s\S]*?try_files\s+\{path\}\s+=404[\s\S]*?Cache-Control\s+"public, max-age=31536000, immutable"[\s\S]*?file_server/,
  "Caddy must cache existing God Mode bundles and hard-404 missing ones"
);
assert.match(
  caddyfile,
  /handle\s+\/assets\/\*[\s\S]*?try_files\s+\{path\}\s+=404[\s\S]*?Cache-Control\s+"public, max-age=31536000, immutable"[\s\S]*?file_server/,
  "Caddy must cache existing web bundles and hard-404 missing ones"
);
assert.match(
  caddyfile,
  /handle\s+\/workbox-\*\.js[\s\S]*?try_files\s+\{path\}\s+=404[\s\S]*?Cache-Control\s+"public, max-age=31536000, immutable"[\s\S]*?file_server/,
  "Caddy must cache existing Workbox bundles and hard-404 missing ones"
);
assert.match(
  caddyfile,
  /handle\s+\/sw\.js[\s\S]*?try_files\s+\{path\}\s+=404[\s\S]*?Cache-Control\s+"no-cache"[\s\S]*?file_server/,
  "Caddy must revalidate the service worker and hard-404 it when absent"
);
assert.match(
  caddyfile,
  /handle_path\s+\/god-mode\/\*[\s\S]*?Cache-Control\s+"no-cache"[\s\S]*?file_server/,
  "Caddy must revalidate the Admin SPA shell"
);
assert.match(
  caddyfile,
  /handle_path\s+\/\*[\s\S]*?Cache-Control\s+"no-cache"[\s\S]*?file_server/,
  "Caddy must revalidate the web SPA shell"
);

const nginxAssetPrefixes = new Map([
  ["apps/web/nginx/nginx.conf", ["/assets/"]],
  ["apps/admin/nginx/nginx.conf", ["/god-mode/assets/"]],
  ["apps/web/nginx/nginx.railway.conf", ["/assets/", "/god-mode/assets/"]],
]);

for (const [nginxPath, assetPrefixes] of nginxAssetPrefixes) {
  const nginxConfig = readRepositoryFile(nginxPath);
  assert.match(nginxConfig, /gzip\s+on;/, `${nginxPath} must enable compression`);
  assert.match(nginxConfig, /gzip_vary\s+on;/, `${nginxPath} must vary compressed responses by encoding`);
  assert.match(
    nginxConfig,
    /public, max-age=31536000, immutable/,
    `${nginxPath} must emit immutable cache headers for hashed assets`
  );
  assert.match(nginxConfig, /default\s+"no-cache";/, `${nginxPath} must revalidate mutable HTML`);
  assert.doesNotMatch(
    nginxConfig,
    /add_header\s+Cache-Control\s+\$static_asset_cache_control\s+always;/,
    `${nginxPath} must not attach immutable headers to hard 404 responses`
  );

  for (const assetPrefix of assetPrefixes) {
    const escapedPrefix = assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const assetLocation = new RegExp(
      `location\\s+\\^~\\s+${escapedPrefix}\\s*\\{[\\s\\S]*?try_files\\s+\\$uri\\s+=404;[\\s\\S]*?\\}`
    );
    assert.match(
      nginxConfig,
      assetLocation,
      `${nginxPath} must return a hard 404 for missing bundles below ${assetPrefix}`
    );
  }
}

for (const nginxPath of ["apps/web/nginx/nginx.conf", "apps/web/nginx/nginx.railway.conf"]) {
  const nginxConfig = readRepositoryFile(nginxPath);
  assert.match(
    nginxConfig,
    /location\s+~\s+\^\/workbox-\[A-Za-z0-9_-\]\+\\\.js\$\s*\{[\s\S]*?try_files\s+\$uri\s+=404;/,
    `${nginxPath} must hard-404 a missing Workbox runtime`
  );
  assert.match(
    nginxConfig,
    /location\s+=\s+\/sw\.js\s*\{[\s\S]*?try_files\s+\$uri\s+=404;/,
    `${nginxPath} must hard-404 a missing service worker`
  );
}

const railwayStart = readRepositoryFile("deployments/railway/start.sh");
assert.match(
  railwayStart,
  /GUNICORN_WORKERS="\$\{GUNICORN_WORKERS:-2\}"/,
  "Railway must default to two Gunicorn workers"
);

const apiEntrypoint = readRepositoryFile("apps/api/bin/docker-entrypoint-api.sh");
assert.match(
  apiEntrypoint,
  /gunicorn\s+-w\s+"\$\{GUNICORN_WORKERS:-2\}"/,
  "The API entrypoint must retain a safe two-worker fallback"
);

const djangoSettings = readRepositoryFile("apps/api/plane/settings/common.py");
assert.match(
  djangoSettings,
  /database_config\["CONN_MAX_AGE"\]\s*=\s*0/,
  "Django ASGI deployments must not enable unsupported persistent connections"
);

const cloudflareWorker = readRepositoryFile("deployments/cloudflare-pages/_worker.js");
assert.match(
  cloudflareWorker,
  /headers\.set\("Cache-Control", "public, max-age=31536000, immutable"\)/,
  "Cloudflare Pages must preserve browser caching when it serves the web bundle"
);
assert.match(
  cloudflareWorker,
  /isStrictStaticAsset\s+&&\s+contentType\.includes\("text\/html"\)/,
  "Cloudflare Pages must reject SPA fallbacks for missing bundles and service workers"
);
assert.match(cloudflareWorker, /"Cache-Control":\s*"no-store"/, "Cloudflare Pages must not cache missing bundles");
assert.match(
  cloudflareWorker,
  /contentType\.includes\("text\/html"\)[\s\S]*?headers\.set\("Cache-Control", "no-cache"\)/,
  "Cloudflare Pages must revalidate SPA documents"
);

const cloudflareWorkerModule = await import(
  `data:text/javascript;base64,${Buffer.from(cloudflareWorker).toString("base64")}`
);
const runCloudflareAssetRequest = async (pathname, staticResponse) =>
  cloudflareWorkerModule.default.fetch(new Request(`https://example.test${pathname}`), {
    ASSETS: { fetch: async () => staticResponse },
  });

const immutableAssetResponse = await runCloudflareAssetRequest(
  "/assets/app-hash.js",
  new Response("export {};", { headers: { "Content-Type": "application/javascript" } })
);
assert.equal(
  immutableAssetResponse.headers.get("Cache-Control"),
  "public, max-age=31536000, immutable",
  "Cloudflare Pages must cache an existing hashed asset"
);

const missingAssetResponse = await runCloudflareAssetRequest(
  "/assets/missing.js",
  new Response("<html>SPA fallback</html>", { headers: { "Content-Type": "text/html" } })
);
assert.equal(missingAssetResponse.status, 404, "Cloudflare Pages must hard-404 a missing hashed asset");
assert.equal(
  missingAssetResponse.headers.get("Cache-Control"),
  "no-store",
  "Cloudflare Pages must not negatively cache a missing hashed asset"
);

const serviceWorkerResponse = await runCloudflareAssetRequest(
  "/sw.js",
  new Response("self.addEventListener('fetch', () => {});", {
    headers: { "Content-Type": "application/javascript" },
  })
);
assert.equal(
  serviceWorkerResponse.headers.get("Cache-Control"),
  "no-cache",
  "Cloudflare Pages must revalidate the service worker"
);

const navigationResponse = await runCloudflareAssetRequest(
  "/workspace/projects",
  new Response("<html>app</html>", { headers: { "Content-Type": "text/html" } })
);
assert.equal(
  navigationResponse.headers.get("Cache-Control"),
  "no-cache",
  "Cloudflare Pages must revalidate SPA navigation documents"
);

console.log("Verified compression, immutable asset caching, API concurrency, and ASGI database connection safety.");
