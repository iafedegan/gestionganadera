import { defineConfig } from "vite";

export default defineConfig({
  // El paquete de SQLite-WASM carga su .wasm con rutas relativas; no debe pre-empaquetarse.
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  worker: { format: "es" },
});
