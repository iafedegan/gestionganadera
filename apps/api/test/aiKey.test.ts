import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { open, seal } from "../src/aiKey.js";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const H = { "x-requested-with": "ganaderia" };
const PASSWORD = "clave-de-prueba-123";
// Valor inventado, sin relación con ninguna clave real.
const KEY = "clave-falsa-para-pruebas-0000-WXYZ";
const seen: { url: string; key: string | null; body: string }[] = [];
const fakeFetch = (async (url: string, init?: RequestInit) => {
  const key = new Headers(init?.headers).get("x-goog-api-key");
  seen.push({ url, key, body: String(init?.body ?? "") });
  if (key !== KEY) return new Response("{}", { status: 400 });
  if (url.endsWith(":generateContent"))
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Todo bien en la finca." }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
  return Response.json({ name: "models/gemini-flash-latest" });
}) as typeof fetch;

let db: Db;
let app: FastifyInstance;
let org = "";

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}
const save = (cookie: string, apiKey: string | null) =>
  app.inject({
    method: "PUT",
    url: "/v1/assistant/config",
    headers: { ...H, cookie },
    payload: { organizationId: org, apiKey },
  });

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask: null, geminiFetch: fakeFetch });
  const hash = await hashPassword(PASSWORD);
  org = await db.admin(async (q) => {
    const [o] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Con IA') RETURNING id",
    );
    for (const [email, role] of [
      ["dueno@ia.local", "propietario"],
      ["operario@ia.local", "operario"],
    ]) {
      const [u] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$1,$2) RETURNING id",
        [email, hash],
      );
      await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
        u?.id,
        o?.id,
        role,
      ]);
    }
    return o?.id as string;
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("clave de Gemini en las variables del servidor", () => {
  it("activa el asistente sin que nadie escriba una clave", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    const server = await buildApp({ db, geminiFetch: fakeFetch });
    vi.unstubAllEnvs();
    const login = await server.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "operario@ia.local", password: PASSWORD },
    });
    const cookie = `sid=${login.cookies.find((c) => c.name === "sid")?.value}`;
    const res = await server.inject({
      method: "POST",
      url: "/v1/assistant",
      headers: { ...H, cookie },
      payload: { organizationId: org, question: "¿Cómo va la finca?" },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().answer).toBe("Todo bien en la finca.");
    expect(seen.at(-1)?.key).toBe(KEY);
    await server.close();
  });
});

describe("clave propia de Gemini", () => {
  it("cifra y descifra; un texto alterado no se lee", () => {
    const s = seal(KEY);
    expect(s).not.toContain(KEY);
    expect(open(s)).toBe(KEY);
    expect(open(`${s}x`.replace(/^./, "!"))).toBeNull();
  });

  it("solo el propietario la guarda, y una clave rechazada por Google no queda", async () => {
    expect((await save(await login("operario@ia.local"), KEY)).statusCode).toBe(403);
    const bad = await save(await login("dueno@ia.local"), "otra-clave-que-no-sirve-123456");
    expect(bad.statusCode).toBe(422);
    const rows = await db.admin((q) => q("SELECT 1 FROM org_ai"));
    expect(rows).toHaveLength(0);
  });

  it("la guarda cifrada, nunca la devuelve y el asistente responde con ella", async () => {
    const cookie = await login("dueno@ia.local");
    const res = await save(cookie, KEY);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ configured: true, last4: "WXYZ" });
    expect(res.body).not.toContain(KEY);
    const [row] = await db.admin((q) => q<{ key_cipher: string }>("SELECT key_cipher FROM org_ai"));
    expect(row?.key_cipher).not.toContain(KEY);

    const answer = await app.inject({
      method: "POST",
      url: "/v1/assistant",
      headers: { ...H, cookie },
      payload: { organizationId: org, question: "¿Cómo va la finca?" },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json().answer).toBe("Todo bien en la finca.");
    const call = seen.at(-1);
    expect(call?.url).not.toContain(KEY);
    expect(call?.body).toContain("¿Cómo va la finca?");

    expect((await save(cookie, null)).json().configured).toBe(false);
  });

  it("usa la clave que envía el dispositivo sin guardarla", async () => {
    const cookie = await login("dueno@ia.local");
    const res = await app.inject({
      method: "POST",
      url: "/v1/assistant",
      headers: { ...H, cookie },
      payload: {
        organizationId: org,
        question: "¿Cómo va la finca?",
        ownAi: { apiKey: KEY, model: "gemini-flash-latest" },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(seen.at(-1)?.key).toBe(KEY);
    expect(seen.at(-1)?.body).not.toContain(KEY);
    expect(await db.admin((q) => q("SELECT 1 FROM org_ai"))).toHaveLength(0);
  });
});
