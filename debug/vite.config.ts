import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  // Load .env.local from the project root (not debug/) so we can read PORT
  // even though this config file lives under debug/.
  const env = loadEnv(mode, PROJECT_ROOT, "");
  const port = Number(env.PORT ?? process.env.PORT ?? 3456);

  return {
    root: path.resolve(__dirname),
    envDir: PROJECT_ROOT,
    plugins: [react(), tailwindcss()],
    server: {
<<<<<<< Updated upstream
      host: "0.0.0.0",
=======
      host: true,
>>>>>>> Stashed changes
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${port}`,
          rewrite: (p) => p.replace(/^\/api/, ""),
          configure: (proxy) => {
            proxy.on("error", () => {
              /* ignore — server may be restarting */
            });
          },
        },
        "/ws": {
          target: `ws://localhost:${port}`,
          ws: true,
          configure: (proxy) => {
            proxy.on("error", () => {
              /* WS proxy EPIPE on reconnect is harmless */
            });
          },
        },
      },
    },
    build: { outDir: path.resolve(__dirname, "dist") },
  };
});
