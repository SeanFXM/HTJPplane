// Cloudflare Pages advanced-mode worker for the Plane `web` project.
//
// Goal: keep ONE origin (no CORS, no rebuild on domain change). The web SPA is
// served from Pages' CDN; everything that belongs to the backend is reverse-
// proxied to the Railway AIO container.
//
// Set BACKEND_URL as a Pages environment variable, e.g.
//   BACKEND_URL = https://plane.up.railway.app
//
// Place this file at the ROOT of the `web` Pages project (alongside index.html
// / the contents of apps/web/build/client). Pages auto-detects `_worker.js`.

const BACKEND_PREFIXES = ["/api", "/auth", "/spaces", "/live", "/god-mode"];
const IMMUTABLE_ASSET_PATH = /^\/(?:assets\/|workbox-[A-Za-z0-9_-]+\.js$)/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isBackend = BACKEND_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

    if (isBackend) {
      const backend = env.BACKEND_URL;
      if (!backend) return new Response("BACKEND_URL not configured", { status: 500 });
      const target = new URL(backend);
      target.pathname = url.pathname;
      target.search = url.search;
      // Pass the request through untouched (preserves websockets for /live).
      return fetch(new Request(target, request));
    }

    // Static SPA assets (with the _redirects SPA fallback applied by Pages).
    const response = await env.ASSETS.fetch(request);
    const isImmutableAsset = IMMUTABLE_ASSET_PATH.test(url.pathname);
    const isServiceWorker = url.pathname === "/sw.js";
    const isStrictStaticAsset = isImmutableAsset || isServiceWorker;
    const contentType = response.headers.get("content-type") ?? "";

    // `_redirects` rewrites unknown URLs to index.html. Never return that HTML
    // as a missing JavaScript or stylesheet; clients otherwise report a vague
    // MIME/syntax error and may retain the response for a full cache lifetime.
    if (isStrictStaticAsset && contentType.includes("text/html")) {
      return new Response("Asset not found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers(response.headers);
    if (isImmutableAsset && response.ok) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (isServiceWorker) {
      headers.set("Cache-Control", "no-cache");
    } else if (contentType.includes("text/html")) {
      headers.set("Cache-Control", "no-cache");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
