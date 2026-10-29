import { buildApp } from "./app.js";
import { createPgDb, createPgliteDb } from "./db.js";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);

// Producción: PostgreSQL (DATABASE_URL). Desarrollo: PGlite persistente en disco, sin Docker.
const db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
const app = await buildApp({ db, production, ...(allowedOrigins ? { allowedOrigins } : {}) });

const stop = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
console.log(`API escuchando en http://127.0.0.1:${port}`);
