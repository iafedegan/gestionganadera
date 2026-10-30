// Prepara la salida para Vercel: estáticos en public/ y la API empaquetada en api/index.js.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("public", { recursive: true, force: true });
mkdirSync("public/app", { recursive: true });
cpSync("apps/landing/dist", "public", { recursive: true });
cpSync("apps/web/dist", "public/app", { recursive: true });

await build({
  entryPoints: ["apps/api/src/vercel.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["@node-rs/argon2", "pg-native", "@electric-sql/pglite"],
  logLevel: "warning",
  // import.meta no existe en CommonJS; la ruta de migraciones llega por MIGRATIONS_DIR.
  define: { "import.meta.url": "undefined" },
});
console.log("Listo: public/ y api/index.js");
