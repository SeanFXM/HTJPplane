#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readRepositoryFile = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

const getAvailablePort = () =>
  new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      assert.ok(address && typeof address !== "string", "Unable to allocate an Admin verification port");
      socket.close(() => resolvePort(address.port));
    });
  });

async function verifyLocalProductionServer() {
  const port = await getAvailablePort();
  const serverProcess = spawn(
    process.execPath,
    ["apps/admin/serve-production.mjs", "apps/admin/build/client", String(port)],
    { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] }
  );
  let serverOutput = "";
  serverProcess.stdout.on("data", (chunk) => (serverOutput += chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => (serverOutput += chunk.toString()));

  try {
    const deepLinkUrl = `http://127.0.0.1:${port}/god-mode/general`;
    const fetchWhenReady = async (attemptsRemaining) => {
      assert.equal(serverProcess.exitCode, null, `Admin production server exited early:\n${serverOutput}`);
      try {
        const response = await fetch(deepLinkUrl);
        if (response.ok) return response;
      } catch {
        // The child process may still be binding its socket.
      }

      if (attemptsRemaining <= 1) return undefined;
      await wait(50);
      return fetchWhenReady(attemptsRemaining - 1);
    };

    const deepLinkResponse = await fetchWhenReady(40);
    assert.ok(deepLinkResponse?.ok, `Admin production deep link did not become ready:\n${serverOutput}`);
    const html = await deepLinkResponse.text();
    const assetPath = html.match(/\/god-mode\/assets\/[^"'?]+\.js/)?.[0];
    assert.ok(assetPath, "Admin production HTML does not reference a JavaScript asset");

    const assetResponse = await fetch(`http://127.0.0.1:${port}${assetPath}`);
    assert.equal(assetResponse.status, 200, `Admin production asset returned ${assetResponse.status}`);
    assert.match(
      assetResponse.headers.get("content-type") ?? "",
      /^(?:application|text)\/javascript/,
      "Admin production server returned the SPA HTML fallback for a JavaScript asset"
    );
  } finally {
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGTERM");
      await Promise.race([once(serverProcess, "exit"), wait(2_000)]);
    }
  }
}

const caddyfile = readRepositoryFile("deployments/railway/Caddyfile");
const apiWebUrls = readRepositoryFile("apps/api/plane/web/urls.py");
const apiWebViews = readRepositoryFile("apps/api/plane/web/views.py");

assert.match(apiWebUrls, /path\("health\/ready\/",\s*readiness_check\)/, "Django must expose API readiness");
assert.match(apiWebViews, /cursor\.execute\("SELECT 1"\)/, "API readiness must verify the database connection");
assert.match(caddyfile, /handle\s+\/health\s*\{/, "Caddy must expose the aggregate Railway health endpoint");
assert.match(
  caddyfile,
  /@admin_missing\s+not\s+file\s+\/index\.html/,
  "Railway readiness must fail when the Admin index is not mounted"
);
assert.match(
  caddyfile,
  /rewrite\s+\*\s+\/health\/ready\//,
  "Railway readiness must call Django's database-backed readiness endpoint"
);
assert.match(
  caddyfile,
  /handle\s+\/health\s*\{[\s\S]*?reverse_proxy\s+localhost:3004[\s\S]*?\}/,
  "Railway readiness must be served by the API process"
);
assert.match(caddyfile, /redir\s+\/god-mode\s+\/god-mode\/\s+308/, "Caddy must canonicalize /god-mode/");
assert.match(caddyfile, /handle_path\s+\/god-mode\/\*/, "Caddy must reserve the complete God Mode subtree");
assert.match(
  caddyfile,
  /try_files\s+\{path\}\s+\{path\}\/\s+\/index\.html/,
  "Caddy must fall back deep God Mode routes to the admin index"
);

for (const nginxPath of ["apps/admin/nginx/nginx.conf", "apps/web/nginx/nginx.railway.conf"]) {
  const nginxConfig = readRepositoryFile(nginxPath);
  assert.match(nginxConfig, /location\s+=\s+\/god-mode\s*\{/, `${nginxPath} must canonicalize /god-mode`);
  assert.match(nginxConfig, /location\s+\^~\s+\/god-mode\/\s*\{/, `${nginxPath} must reserve /god-mode/`);
  assert.match(
    nginxConfig,
    /try_files\s+\$uri\s+\$uri\/\s+\/god-mode\/index\.html;/,
    `${nginxPath} must fall back deep links to the admin index`
  );
}

const legacyWebDockerfile = readRepositoryFile("apps/web/Dockerfile.web.railway");
assert.match(
  legacyWebDockerfile,
  /^FROM node:22-bullseye-slim AS builder$/m,
  "The Railway web image must name its build stage"
);
assert.match(legacyWebDockerfile, /pnpm -C apps\/admin run build/, "The Railway web image must build Admin");
assert.match(
  legacyWebDockerfile,
  /COPY --from=builder \/app\/apps\/web\/build\/client\s+\/usr\/share\/nginx\/html/,
  "The Railway web runtime must copy Web from its local build stage"
);
assert.match(
  legacyWebDockerfile,
  /apps\/admin\/build\/client\s+\/usr\/share\/nginx\/html\/god-mode/,
  "The Railway web image must mount Admin at /god-mode"
);

const aioDockerfile = readRepositoryFile("deployments/railway/Dockerfile.aio");
assert.match(
  aioDockerfile,
  /^ENV HOTONE_INTERNAL_MODE=1$/m,
  "The AIO image must enable Hotone's authoritative internal product policy"
);
assert.match(
  aioDockerfile,
  /apps\/admin\/build\/client\s+\/app\/admin/,
  "The AIO image must copy the Admin client bundle"
);
assert.match(
  aioDockerfile,
  /HEALTHCHECK[\s\S]*\$\{PORT:-80\}\/health/,
  "The AIO image healthcheck must use the aggregate readiness endpoint"
);

const railwayConfig = JSON.parse(readRepositoryFile("deployments/railway/railway.json"));
assert.equal(
  railwayConfig.deploy?.healthcheckPath,
  "/health",
  "Railway must probe the aggregate API and Admin readiness contract"
);

execFileSync(process.execPath, ["apps/admin/verify-production-build.mjs", "apps/admin/build/client", "/god-mode/"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
await verifyLocalProductionServer();

console.log("Verified God Mode routing, local production serving, and aggregate Railway API/Admin readiness.");
