import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { type Db, createPgliteDb } from "../src/db.js";

let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "gg-static-"));
  const landing = join(root, "landing");
  const web = join(root, "web");
  mkdirSync(join(landing, "assets"), { recursive: true });
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(landing, "index.html"), "<title>LANDING</title>");
  writeFileSync(join(landing, "assets", "a-1234.js"), "console.log(1)");
  writeFileSync(join(web, "index.html"), "<title>APP</title>");
  writeFileSync(join(web, "sw.js"), "// sw");
  writeFileSync(join(web, "assets", "b-5678.js"), "console.log(2)");
  db = await createPgliteDb();
  app = await buildApp({ db, landingDir: landing, appDir: web });
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("un solo origen: landing, app y API", () => {
  it("la raíz sirve la landing", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("LANDING");
  });

  it("/app/ sirve la aplicación y /app redirige", async () => {
    const res = await app.inject({ method: "GET", url: "/app/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("APP");
    const redirect = await app.inject({ method: "GET", url: "/app" });
    expect([301, 302, 308]).toContain(redirect.statusCode);
    expect(redirect.headers.location).toBe("/app/");
  });

  it("cualquier ruta bajo /app/ abre la portada de la aplicación", async () => {
    const res = await app.inject({ method: "GET", url: "/app/alguna/ruta" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("APP");
  });

  it("los archivos con huella son inmutables y el service worker se revalida", async () => {
    const asset = await app.inject({ method: "GET", url: "/app/assets/b-5678.js" });
    expect(asset.headers["cache-control"]).toContain("immutable");
    const sw = await app.inject({ method: "GET", url: "/app/sw.js" });
    expect(sw.headers["cache-control"]).toBe("no-cache");
    const index = await app.inject({ method: "GET", url: "/app/" });
    expect(index.headers["cache-control"]).toBe("no-cache");
  });

  it("la API sigue sin caché y los desconocidos fuera de /app/ dan 404 JSON", async () => {
    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(200);
    expect(health.headers["cache-control"]).toBe("no-store");
    const nada = await app.inject({ method: "GET", url: "/v1/no-existe" });
    expect(nada.statusCode).toBe(404);
    expect(nada.json()).toMatchObject({ error: "NO_ENCONTRADO" });
  });

  it("los encabezados de seguridad llegan también a los estáticos", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});
