import { uuidv7 } from "@ganaderia/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { type AskFn, DAILY_LIMIT } from "../src/assistant.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

let db: Db;
let app: FastifyInstance;
let off: FastifyInstance;
let org: string;
let otherOrg: string;
let farm: string;
const calls: Parameters<AskFn>[0][] = [];

const fakeAsk: AskFn = async (input) => {
  calls.push(input);
  return { text: "Revise a la vaca AS-1.", inputTokens: 1200, outputTokens: 80, refused: false };
};

async function addUser(email: string, orgId: string, role: string) {
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    const [u] = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$1,$2) RETURNING id",
      [email, hash],
    );
    await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
      u?.id,
      orgId,
      role,
    ]);
  });
}

async function login(target: FastifyInstance, email: string) {
  const res = await target.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}

const ask = (target: FastifyInstance, cookie: string, payload: object) =>
  target.inject({
    method: "POST",
    url: "/v1/assistant",
    headers: { ...H, cookie },
    payload,
  });

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask: fakeAsk });
  off = await buildApp({ db, ask: null });
  const ids = await db.admin(async (q) => {
    const [a] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Asistente') RETURNING id",
    );
    const [b] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Otra') RETURNING id",
    );
    const [f] = await q<{ id: string }>(
      "INSERT INTO farm (organization_id, code, name, species_present, location_text) VALUES ($1,'F1','La Esperanza',ARRAY['bovino'],'Montería, Córdoba') RETURNING id",
      [a?.id],
    );
    return { a: a?.id as string, b: b?.id as string, f: f?.id as string };
  });
  org = ids.a;
  otherOrg = ids.b;
  farm = ids.f;
  await addUser("dueno@asis.local", org, "propietario");
  await addUser("vet@asis.local", org, "tecnico");

  const cookie = await login(app, "dueno@asis.local");
  const vaca = uuidv7();
  const ev = (type: string, occurredOn: string, data: object) => ({
    id: uuidv7(),
    type: "animal.event.record",
    clientTs: new Date().toISOString(),
    payload: { id: uuidv7(), animalId: vaca, occurredOn, type, data },
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/sync/push",
    headers: { ...H, cookie },
    payload: {
      organizationId: org,
      deviceId: "dispositivo-prueba",
      commands: [
        {
          id: uuidv7(),
          type: "animal.register",
          clientTs: new Date().toISOString(),
          payload: {
            id: vaca,
            farmId: farm,
            tag: "AS-1",
            species: "bovino",
            sex: "hembra",
            category: "vaca",
            entry: { reason: "inventario_inicial", occurredAt: daysAgo(200) },
          },
        },
        ev("servicio", daysAgo(50), { via: "IA", sire: "Toro Brahman" }),
        ev("salud", daysAgo(1), {
          kind: "Tratamiento",
          product: "Oxitetraciclina",
          reason: "Cojera",
          responsible: "Dra. Ruiz",
          cost: null,
          milkWithdrawalDays: 7,
          meatWithdrawalDays: 28,
        }),
      ],
    },
  });
  expect(res.body).toContain('"accepted"');
  expect(res.statusCode, res.body).toBe(200);
}, 60_000);

afterAll(async () => {
  await app.close();
  await off.close();
  await db.close();
});

describe("asistente con IA", () => {
  it("responde con los datos reales de la finca y descuenta la cuota", async () => {
    const cookie = await login(app, "dueno@asis.local");
    const res = await ask(app, cookie, {
      organizationId: org,
      question: "¿Qué debo revisar esta semana?",
      weather: { tempC: 31, maxC: 34, thi: 84, heatDays: 5, rain7d: 12 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ answer: "Revise a la vaca AS-1.", remaining: DAILY_LIMIT - 1 });

    const sent = calls.at(-1);
    expect(sent?.system).toContain("No reemplaza al médico veterinario");
    const last = sent?.messages.at(-1);
    expect(last?.role).toBe("user");
    const text = String(last?.content);
    expect(text).toContain("La Esperanza");
    expect(text).toContain("Servidas hace 35 días o más sin diagnóstico de preñez: AS-1 (50 días)");
    expect(text).toContain("AS-1: Oxitetraciclina, leche hasta");
    expect(text).toContain("ITH 84");
    expect(text.endsWith("¿Qué debo revisar esta semana?")).toBe(true);

    const [u] = await db.admin((q) =>
      q(
        "SELECT questions, input_tokens, output_tokens FROM assistant_usage WHERE organization_id = $1",
        [org],
      ),
    );
    expect(Number(u?.questions)).toBe(1);
    expect(Number(u?.input_tokens)).toBe(1200);
    expect(Number(u?.output_tokens)).toBe(80);
  });

  it("envía el historial empezando por el usuario y sin datos viejos", async () => {
    const cookie = await login(app, "vet@asis.local");
    const res = await ask(app, cookie, {
      organizationId: org,
      question: "¿Y los partos?",
      history: [
        { role: "assistant", text: "Hola" },
        { role: "user", text: "¿Cómo va el hato?" },
        { role: "assistant", text: "Bien." },
      ],
    });
    expect(res.statusCode).toBe(200);
    const msgs = calls.at(-1)?.messages ?? [];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(msgs.at(-1)?.content)).toContain("no tiene acceso a costos");
  });

  it("no deja preguntar por otra ganadería ni sin sesión", async () => {
    const cookie = await login(app, "dueno@asis.local");
    const res = await ask(app, cookie, { organizationId: otherOrg, question: "¿Cómo va?" });
    expect(res.statusCode).toBe(403);
    const anon = await app.inject({
      method: "POST",
      url: "/v1/assistant",
      headers: H,
      payload: { organizationId: org, question: "¿Cómo va?" },
    });
    expect(anon.statusCode).toBe(401);
  });

  it("valida la pregunta", async () => {
    const cookie = await login(app, "dueno@asis.local");
    const res = await ask(app, cookie, { organizationId: org, question: "x".repeat(2000) });
    expect(res.statusCode).toBe(400);
  });

  it("frena al llegar al límite diario", async () => {
    await db.admin((q) =>
      q("UPDATE assistant_usage SET questions = $2 WHERE organization_id = $1", [org, DAILY_LIMIT]),
    );
    const cookie = await login(app, "dueno@asis.local");
    const before = calls.length;
    const res = await ask(app, cookie, { organizationId: org, question: "¿Una más?" });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("LIMITE_DIARIO");
    expect(calls.length).toBe(before);
  });

  it("sin clave configurada avisa que no está activo", async () => {
    const cookie = await login(off, "dueno@asis.local");
    const status = await off.inject({
      method: "GET",
      url: "/v1/assistant/status",
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({ enabled: false });
    const res = await ask(off, cookie, { organizationId: org, question: "¿Cómo va?" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("ASISTENTE_NO_CONFIGURADO");
  });
});
