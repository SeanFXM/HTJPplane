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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isBackend = BACKEND_PREFIXES.some(
      (p) => url.pathname === p || url.pathname.startsWith(p + "/"),
    );

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
    return env.ASSETS.fetch(request);
  },
};
