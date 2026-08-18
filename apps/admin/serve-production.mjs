#!/usr/bin/env node

import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const buildDirectory = resolve(process.argv[2] ?? "build/client");
const indexPath = resolve(buildDirectory, "index.html");
const port = Number(process.env.ADMIN_PREVIEW_PORT ?? process.argv[3] ?? 3001);
const host = process.env.ADMIN_PREVIEW_HOST ?? "127.0.0.1";

assert.ok(existsSync(indexPath), `Admin build is missing ${indexPath}. Run pnpm --filter=admin build first.`);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, `Invalid Admin preview port: ${port}`);

const indexHtml = readFileSync(indexPath, "utf8");
const basename = indexHtml.match(/"basename":"([^"]+)"/)?.[1];
assert.equal(basename, "/god-mode/", `Admin production server requires /god-mode/, received ${basename}`);

const basenameWithoutTrailingSlash = basename.slice(0, -1);
const buildDirectoryPrefix = `${buildDirectory}${sep}`;
const contentTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(request, response, filePath) {
  const fileStats = statSync(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Length", fileStats.size);
  response.setHeader("Content-Type", contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://admin.local");

    if (requestUrl.pathname === "/" || requestUrl.pathname === basenameWithoutTrailingSlash) {
      response.writeHead(308, { Location: basename });
      response.end();
      return;
    }

    if (!requestUrl.pathname.startsWith(basename)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const relativePath = decodeURIComponent(requestUrl.pathname.slice(basename.length));
    const requestedPath = resolve(buildDirectory, relativePath || "index.html");

    if (requestedPath !== buildDirectory && !requestedPath.startsWith(buildDirectoryPrefix)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const isStaticFile = existsSync(requestedPath) && statSync(requestedPath).isFile();
    sendFile(request, response, isStaticFile ? requestedPath : indexPath);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`Hotone Japan Admin is available at http://${host}:${port}${basename}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
