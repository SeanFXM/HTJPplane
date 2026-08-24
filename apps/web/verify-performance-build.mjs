/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = join(appDirectory, "build", "client");
const assetsDirectory = join(clientDirectory, "assets");

function assertBuildInvariant(condition, message) {
  if (!condition) {
    throw new Error(`Performance build verification failed: ${message}`);
  }
}

function assetPathFromUrl(assetUrl) {
  return join(clientDirectory, assetUrl.replace(/^\//, ""));
}

function unique(items) {
  return [...new Set(items)];
}

assertBuildInvariant(existsSync(clientDirectory), "apps/web/build/client does not exist; run the web build first");

const indexHtml = readFileSync(join(clientDirectory, "index.html"), "utf8");
const initialModuleUrls = unique(
  [...indexHtml.matchAll(/rel="modulepreload" href="([^"]+\.js)"/g)].map((match) => match[1])
);
const initialModuleBodies = initialModuleUrls.map((assetUrl) => readFileSync(assetPathFromUrl(assetUrl)));
const initialModuleGzipBytes = initialModuleBodies.reduce(
  (total, body) => total + gzipSync(body, { level: 6 }).length,
  0
);

// Keep a little headroom for normal dependency churn while preventing the
// initial application shell from silently absorbing another large feature.
const maximumInitialModuleGzipBytes = 700 * 1024;
assertBuildInvariant(
  initialModuleGzipBytes <= maximumInitialModuleGzipBytes,
  `initial module preloads are ${initialModuleGzipBytes} bytes gzip (budget: ${maximumInitialModuleGzipBytes})`
);

const rootFontUrls = unique(
  [...indexHtml.matchAll(/(\/assets\/[^"'&\s)]+\.(?:woff2?|ttf))/g)].map((match) => match[1])
);
const rootFontBytes = rootFontUrls.reduce((total, assetUrl) => total + statSync(assetPathFromUrl(assetUrl)).size, 0);
const maximumRootFontBytes = 450 * 1024;
assertBuildInvariant(
  rootFontBytes <= maximumRootFontBytes,
  `root document references ${rootFontBytes} bytes of fonts (budget: ${maximumRootFontBytes})`
);
assertBuildInvariant(
  rootFontUrls.every((assetUrl) => assetUrl.endsWith(".woff2")),
  "the root document must only reference compressed WOFF2 fonts"
);

const manifestFileName = readdirSync(assetsDirectory).find((fileName) => /^manifest-.*\.js$/.test(fileName));
assertBuildInvariant(manifestFileName, "React Router client manifest was not generated");

const manifestSource = readFileSync(join(assetsDirectory, manifestFileName), "utf8").trim();
const manifestPayload = manifestSource.slice(manifestSource.indexOf("=") + 1).replace(/;$/, "");
const manifest = JSON.parse(manifestPayload);
const issueListRouteIds = Object.keys(manifest.routes).filter((routeId) => routeId.includes("/issues/(list)/"));
assertBuildInvariant(issueListRouteIds.length > 0, "no work-item list routes were found in the client manifest");

const forbiddenStaticFeaturePattern =
  /\/(?:editor|use-editor-flagging|generateCategoricalChart|mobile-header|workitems-insight|modal-content)-/i;

for (const routeId of issueListRouteIds) {
  const routeFiles = [];
  let currentRoute = manifest.routes[routeId];

  while (currentRoute) {
    routeFiles.push(currentRoute.module, ...(currentRoute.imports ?? []));
    currentRoute = currentRoute.parentId ? manifest.routes[currentRoute.parentId] : undefined;
  }

  const forbiddenImports = unique(routeFiles.filter((fileName) => forbiddenStaticFeaturePattern.test(fileName)));
  assertBuildInvariant(
    forbiddenImports.length === 0,
    `${routeId} statically imports deferred features: ${forbiddenImports.join(", ")}`
  );
}

console.log(
  `Verified web performance build: ${initialModuleUrls.length} initial modules (${Math.round(initialModuleGzipBytes / 1024)} KiB gzip), ` +
    `${rootFontUrls.length} root fonts (${Math.round(rootFontBytes / 1024)} KiB), ` +
    `${issueListRouteIds.length} work-item list routes without deferred heavy features.`
);
