#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readRepositoryFile = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

const supervisor = readRepositoryFile("deployments/railway/supervisor.conf");
const startScript = readRepositoryFile("deployments/railway/start.sh");

for (const processName of ["MIGRATOR", "WORKER", "BEAT", "SPACE", "LIVE"]) {
  assert.match(
    supervisor,
    new RegExp(`ENABLE_${processName}:-1`),
    `${processName} must have a migration-safe runtime switch`
  );
}

for (const processName of ["worker", "beat", "space", "live"]) {
  assert.match(
    supervisor,
    new RegExp(`\\[program:${processName}\\][\\s\\S]*?autorestart=unexpected`),
    `${processName} must not restart-loop after an intentional clean exit`
  );
}

assert.match(
  startScript,
  /API_BASE_URL="\$\{API_BASE_URL:-http:\/\/127\.0\.0\.1:3004\}"/,
  "Live must call the colocated API over loopback by default"
);
assert.match(
  startScript,
  /CORS_ALLOWED_ORIGINS="\$\{CORS_ALLOWED_ORIGINS:-\$proto:\/\/\$DOMAIN_NAME\}"/,
  "AIO must not add an insecure HTTP origin to production CORS by default"
);

console.log("Verified Railway AIO process gates and secure same-origin defaults.");
