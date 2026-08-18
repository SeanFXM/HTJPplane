#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const buildDirectory = resolve(process.argv[2] ?? "build/client");
const expectedBasePath = process.argv[3];
const indexPath = resolve(buildDirectory, "index.html");

assert.ok(existsSync(indexPath), `Admin build is missing ${indexPath}`);

const html = readFileSync(indexPath, "utf8");
const basename = html.match(/"basename":"([^"]+)"/)?.[1];

assert.ok(basename, "Admin index does not declare a React Router basename");
assert.ok(basename.startsWith("/"), `Admin basename must be absolute, received ${basename}`);
assert.ok(basename.endsWith("/"), `Admin basename must end with a slash, received ${basename}`);

if (expectedBasePath) {
  const normalizedExpectedBasePath = `/${expectedBasePath}`.replace(/\/{2,}/g, "/").replace(/\/?$/, "/");
  assert.equal(
    basename,
    normalizedExpectedBasePath,
    `Admin basename must be ${normalizedExpectedBasePath}, received ${basename}`
  );
}

if (basename !== "/") {
  const brokenAssetPrefix = `${basename.slice(0, -1)}assets/`;
  assert.ok(!html.includes(brokenAssetPrefix), `Admin index contains malformed asset URLs under ${brokenAssetPrefix}`);
}

const resourceUrls = new Set(
  [...html.matchAll(/(?:href|src)="(\/[^"?#]+)"|(?:import|import\()\s*["'](\/[^"'?#]+)["']/g)]
    .map((match) => match[1] ?? match[2])
    .filter((url) => /\.(?:css|gif|ico|js|png|svg|woff2?)$/.test(url))
);

assert.ok(resourceUrls.size > 0, "Admin index does not reference any production assets");

const assertDeployableResource = (resourceUrl) => {
  assert.ok(resourceUrl.startsWith(basename), `Admin asset escapes ${basename}: ${resourceUrl}`);
  const relativeAssetPath = resourceUrl.slice(basename.length);
  assert.ok(relativeAssetPath, `Admin asset URL has no file path: ${resourceUrl}`);
  assert.ok(existsSync(resolve(buildDirectory, relativeAssetPath)), `Admin asset does not exist: ${resourceUrl}`);
};

resourceUrls.forEach(assertDeployableResource);

const manifestUrl = [...resourceUrls].find((url) => /\/assets\/manifest-[^/]+\.js$/.test(url));
assert.ok(manifestUrl, "Admin route manifest is not referenced by index.html");

const manifest = readFileSync(resolve(buildDirectory, manifestUrl.slice(basename.length)), "utf8");
assert.match(manifest, /"path":"general"/, "Admin route manifest does not include the /general route");
const manifestResourceUrls = new Set(
  [...manifest.matchAll(/["'](\/[^"'?#]+\.(?:css|gif|ico|js|png|svg|woff2?))["']/g)].map((match) => match[1])
);
manifestResourceUrls.forEach(assertDeployableResource);

const bundledJavaScript = readdirSync(resolve(buildDirectory, "assets"))
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => readFileSync(resolve(buildDirectory, "assets", fileName), "utf8"))
  .join("\n");
const expectedGeneralRecoveryTarget = `location.assign("${basename}general/")`;
assert.ok(
  bundledJavaScript.includes(expectedGeneralRecoveryTarget),
  `Admin recovery action must stay inside its basename: ${expectedGeneralRecoveryTarget}`
);
if (basename !== "/") {
  assert.ok(
    !bundledJavaScript.includes('location.assign("/general/")'),
    "Admin recovery action must not navigate to the web application's /general route"
  );
}

console.log(
  `Verified admin SPA at ${basename}: /general route and ${new Set([...resourceUrls, ...manifestResourceUrls]).size} assets are deployable.`
);
