import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Inline joinUrlPath to avoid resolving @plane/utils during config load (avoids race with utils:dev watch)
function joinUrlPath(...segments: string[]): string {
  const valid = segments.filter((s) => s !== "");
  if (valid.length === 0) return "";
  const parts = valid.flatMap((s) =>
    s
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
  );
  return parts.length > 0 ? `/${parts.join("/")}` : "";
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, __dirname, "VITE_");
  const processEnv = Object.keys(process.env)
    .filter((key) => key.startsWith("VITE_"))
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = process.env[key] ?? "";
      return acc;
    }, {});
  const viteEnv = { ...fileEnv, ...processEnv };
  const basePath = joinUrlPath(viteEnv.VITE_SPACE_BASE_PATH ?? "", "/") || "/";

  return {
    base: basePath,
    define: {
      "process.env": JSON.stringify(viteEnv),
    },
    build: {
      assetsInlineLimit: 0,
    },
    plugins: [reactRouter(), tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
    resolve: {
      alias: {
        // Next.js compatibility shims used within space
        "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
      },
      dedupe: ["react", "react-dom"],
    },
    server: {
      host: "127.0.0.1",
    },
  };
});
