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
      // «autoUpdate»: el service worker nuevo se activa de inmediato; el registro va en lib/appUpdate.
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["logo.png", "apple-touch-icon.png", "sw-avisos.js"],
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
        // Sin esto la versión nueva se queda esperando a que se cierren todas las pestañas.
        skipWaiting: true,
        clientsClaim: true,
        // Todo el shell, las fuentes y el motor SQLite quedan disponibles sin red.
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/app/index.html",
        navigateFallbackDenylist: [/^\/v1\//],
        // Al tocar una notificación de urgencia se vuelve a la aplicación.
        importScripts: ["sw-avisos.js"],
      },
    }),
  ],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  worker: { format: "es" },
  server: { proxy: api },
  preview: { proxy: api },
});
