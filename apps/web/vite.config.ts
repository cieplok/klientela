import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The QA/test environment may boot the API on a different port than the dev
// default; `API_PROXY_TARGET` / `WEB_PORT` let that environment point the dev
// proxy at the running API without editing this file.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/trpc": apiTarget,
      "/sync": apiTarget,
      "/health": apiTarget,
    },
  },
  build: {
    outDir: "dist",
  },
});
