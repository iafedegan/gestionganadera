import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const api = { "/v1": { target: "http://127.0.0.1:3000", changeOrigin: false } };

export default defineConfig({
  // La aplicación vive en /app/; la landing ocupa la raíz del mismo servidor.
  base: "/app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Sistema Integral de Gestión Ganadera",
        short_name: "Gestión Ganadera",
        description: "Gestión de fincas, animales y registros de campo, también sin conexión.",
        lang: "es-CO",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F5F4F0",
        theme_color: "#0F3D2E",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
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
