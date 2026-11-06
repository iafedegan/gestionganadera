import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createPgDb } from "./db.js";

/**
 * Entrada para Vercel: la API como función. La instancia se reutiliza entre peticiones
 * mientras la función siga «caliente». Requiere DATABASE_URL (PostgreSQL externo).
 */
process.env.MIGRATIONS_DIR ??= join(process.cwd(), "apps", "api", "migrations");

let ready: Promise<FastifyInstance> | null = null;

function boot(): Promise<FastifyInstance> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL.");
  const origins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
  ready ??= (async () => {
    const db = await createPgDb(url);
    const app = await buildApp({
      db,
      production: true,
      demo: process.env.DEMO_LOGIN === "1",
      ...(origins ? { allowedOrigins: origins } : {}),
    });
    await app.ready();
    return app;
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await boot();
    app.server.emit("request", req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "SERVICIO_NO_DISPONIBLE",
        message: "El servidor no está disponible.",
      }),
    );
  }
}
