import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import type { AskFn } from "./assistant.js";
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
// Solo desarrollo: ASSISTANT_FAKE=1 responde sin llamar a la IA y muestra los datos que recibiría.
const fakeAsk: AskFn = async ({ messages }) => {
  const last = String(messages.at(-1)?.content ?? "");
  const data = last.match(/<datos_finca>\n([\s\S]*?)\n<\/datos_finca>/)?.[1] ?? "";
  return {
    text: `**Modo de prueba** (sin IA). Estos son los datos que recibiría el asistente:\n${data
      .split("\n")
      .map((l) => `- ${l}`)
      .join("\n")}\n\nPara hoy: configure ANTHROPIC_API_KEY para respuestas reales.`,
    inputTokens: 0,
    outputTokens: 0,
    refused: false,
  };
};

const app = await buildApp({
  db,
  production,
  ...(!production && process.env.ASSISTANT_FAKE === "1" ? { ask: fakeAsk } : {}),
  // En desarrollo el selector de cuentas de muestra viene activo; en producción solo con DEMO_LOGIN=1.
  demo: !production || process.env.DEMO_LOGIN === "1",
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
