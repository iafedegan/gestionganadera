import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { createPgDb, createPgliteDb } from "./db.js";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 4173);

// Producción: PostgreSQL (DATABASE_URL). Desarrollo: PGlite persistente en disco, sin Docker.
const db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
const landingDir =
  process.env.LANDING_DIR ?? fileURLToPath(new URL("../../landing/dist", import.meta.url));
const appDir = process.env.APP_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
const app = await buildApp({
  db,
  production,
  landingDir,
  appDir,
  ...(allowedOrigins ? { allowedOrigins } : {}),
});

const stop = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
console.log(
  `Sitio y API en http://localhost:${port}  (landing en /, aplicación en /app/, API en /v1/)`,
);
