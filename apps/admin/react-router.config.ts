import type { Config } from "@react-router/dev/config";

// Keep config loading independent from workspace package build order. React Router
// evaluates this file before Turbo can guarantee that @plane/utils/dist exists.
function joinUrlPath(...segments: string[]): string {
  const parts = segments.flatMap((segment) =>
    segment
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
  );

  return parts.length > 0 ? `/${parts.join("/")}` : "";
}

const normalizedBasePath = joinUrlPath(process.env.VITE_ADMIN_BASE_PATH ?? "", "/") || "/";
const basePath = normalizedBasePath === "/" ? "/" : `${normalizedBasePath}/`;

export default {
  appDirectory: "app",
  basename: basePath,
  // Admin runs as a client-side app; build a static client bundle only
  ssr: false,
} satisfies Config;
