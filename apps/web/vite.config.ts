import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, __dirname, "VITE_");
  const processEnv = Object.keys(process.env)
    .filter((key) => key.startsWith("VITE_"))
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = process.env[key] ?? "";
      return acc;
    }, {});
  const viteEnv = { ...fileEnv, ...processEnv };

  return {
    define: {
      "process.env": JSON.stringify(viteEnv),
    },
    build: {
      assetsInlineLimit: 0,
    },
    plugins: [reactRouter(), tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
    resolve: {
      alias: {
        // Next.js compatibility shims used within web
        "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
        "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
        "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
      },
      dedupe: ["react", "react-dom", "@headlessui/react"],
    },
    server: {
      host: "127.0.0.1",
    },
    // No SSR-specific overrides needed; alias resolves to ESM build
  };
});
