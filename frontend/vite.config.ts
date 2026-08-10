import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:9657",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    // AUDIT-0 OPT-002: source maps are debug-only.  Production builds ship
    // without them unless PITD_SOURCEMAPS=1 is explicitly set.
    sourcemap: process.env.PITD_SOURCEMAPS === "1",
  },
  publicDir: "public",
});
