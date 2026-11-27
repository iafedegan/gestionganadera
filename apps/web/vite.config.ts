import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const api = { "/v1": { target: "http://127.0.0.1:4173", changeOrigin: false } };

export default defineConfig({
  // La aplicación vive en /app/; la landing ocupa la raíz del mismo servidor.
  base: "/app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["logo.png", "apple-touch-icon.png"],
      manifest: {
        name: "GanSmart",
        short_name: "GanSmart",
        description: "Gestión de fincas, animales y registros de campo, también sin conexión.",
        lang: "es-CO",
        start_url: "/app/?source=pwa",
        scope: "/app/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f3d2e",
        theme_color: "#F2F2F7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Todo el shell, las fuentes y el motor SQLite quedan disponibles sin red.
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/app/index.html",
        navigateFallbackDenylist: [/^\/v1\//],
      },
    }),
  ],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  worker: { format: "es" },
  server: { proxy: api },
  preview: { proxy: api },
});
