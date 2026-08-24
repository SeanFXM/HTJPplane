#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readRepositoryFile = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

const supervisor = readRepositoryFile("deployments/railway/supervisor.conf");
const startScript = readRepositoryFile("deployments/railway/start.sh");
const dockerIgnore = readRepositoryFile(".dockerignore");
const apiEntryPoint = readRepositoryFile("apps/api/bin/docker-entrypoint-api.sh");

const getProgramSection = (processName) => {
  const section = supervisor.match(new RegExp(`\\[program:${processName}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  assert.ok(section, `Supervisor program ${processName} must exist`);
  return section[1];
};

for (const processName of ["migrator", "worker", "beat", "space", "live"]) {
  const programSection = getProgramSection(processName);
  assert.match(
    programSection,
    new RegExp(`ENABLE_${processName.toUpperCase()}:-1`),
    `${processName} must have a migration-safe runtime switch`
  );
}

for (const processName of ["worker", "beat", "space", "live"]) {
  const programSection = getProgramSection(processName);
  assert.match(
    programSection,
    /autorestart=unexpected/,
    `${processName} must not restart-loop after an intentional clean exit`
  );
  assert.match(programSection, /startsecs=0/, `${processName} must report a disabled clean exit instead of FATAL`);
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
for (const requiredVariable of [
  "DOMAIN_NAME",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET_NAME",
  "AWS_S3_ENDPOINT_URL",
]) {
  assert.match(
    startScript,
    new RegExp(`for key in[\\s\\S]*?${requiredVariable}`),
    `${requiredVariable} must be fail-hard`
  );
}
assert.match(dockerIgnore, /^\*\*\/\.env\.\*$/m, "Nested environment files must never enter the Docker build context");
assert.match(
  apiEntryPoint,
  /SKIP_API_BOOTSTRAP:-0/,
  "Parallel AIO validation must be able to skip API bootstrap side effects"
);

console.log("Verified Railway AIO process gates, secret exclusions, and secure same-origin defaults.");
