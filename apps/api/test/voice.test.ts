import type { VoiceInterpretRequest } from "@ganaderia/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";
import { type VoiceInterpreter, VoiceThrottle, sanitizeInterpretation } from "../src/voice.js";

const TODAY = "2026-10-30";
const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };
const ORG_OTRA = "00000000-0000-4000-8000-000000000001";

const form = (organizationId: string): VoiceInterpretRequest => ({
  organizationId,
  formTitle: "Registrar ordeño",
  fields: [
    {
      name: "tag",
      label: "Animal",
      type: "select",
      required: true,
      value: "BOV-1",
      choices: [
        { value: "BOV-1", label: "BOV-1" },
        { value: "BOV-2", label: "BOV-2" },
      ],
    },
    { name: "fecha", label: "Fecha", type: "date", required: true, value: TODAY },
    { name: "litros", label: "Litros", type: "number", required: true, value: "" },
    { name: "nota", label: "Nota", type: "textarea", required: false, value: "" },
  ],
  context: "BOV-1: vaca",
  history: [],
  alternatives: ["la bov dos dio veinte"],
});

const clean = (raw: unknown) => sanitizeInterpretation(form(ORG_OTRA), raw, TODAY);

describe("validación de lo que dice el modelo", () => {
  it("acepta valores correctos y normaliza opción por etiqueta y coma decimal", () => {
    expect(
      clean({
        values: [
          { name: "tag", value: "BOV-2" },
          { name: "litros", value: "18,5" },
          { name: "fecha", value: "2026-10-29" },
          { name: "nota", value: "Cojea" },
        ],
        question: null,
        action: "continuar",
      }),
    ).toEqual({
      values: { tag: "BOV-2", litros: "18.5", fecha: "2026-10-29", nota: "Cojea" },
      question: null,
      action: "continuar",
    });
  });

  it("descarta lo inventado: animal inexistente, campo extra, fecha futura o imposible, negativos", () => {
    const r = clean({
      values: [
        { name: "tag", value: "VACA-99" },
        { name: "precio", value: "100" },
        { name: "fecha", value: "2026-11-01" },
        { name: "litros", value: "-3" },
      ],
      question: null,
      action: "continuar",
    });
    expect(r?.values).toEqual({});
    const imposible = clean({
      values: [{ name: "fecha", value: "2026-02-31" }],
      question: null,
      action: "continuar",
    });
    expect(imposible?.values).toEqual({});
  });

  it("no guarda con una pregunta abierta y rechaza una forma inválida", () => {
    expect(clean({ values: [], question: "¿Cuál vaca?", action: "guardar" })?.action).toBe(
      "continuar",
    );
    expect(clean({ values: "nada" })).toBeNull();
    expect(clean(null)).toBeNull();
  });

  it("limita las peticiones por usuario y minuto", () => {
    const t = new VoiceThrottle(2);
    expect([t.allow("a", 0), t.allow("a", 1), t.allow("a", 2), t.allow("b", 2)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(t.allow("a", 60_100)).toBe(true);
  });
});

describe("POST /v1/voice/interpret", () => {
  let db: Db;
  let orgId: string;
  const apps: FastifyInstance[] = [];
  const seen: VoiceInterpretRequest[] = [];

  const start = async (voiceInterpreter: VoiceInterpreter | null) => {
    const app = await buildApp({ db, voiceInterpreter });
    apps.push(app);
    return app;
  };
  const login = async (app: FastifyInstance) => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "voz@test.local", password: PASSWORD },
    });
    return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
  };
  const send = (app: FastifyInstance, cookie: string, org = orgId) =>
    app.inject({
      method: "POST",
      url: "/v1/voice/interpret",
      headers: { ...H, cookie },
      payload: form(org),
    });

  beforeAll(async () => {
    db = await createPgliteDb();
    const hash = await hashPassword(PASSWORD);
    orgId = await db.admin(async (q) => {
      const [o] = await q<{ id: string }>(
        "INSERT INTO organization (name) VALUES ('Voz') RETURNING id",
      );
      const [u] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ('voz@test.local','Voz',$1) RETURNING id",
        [hash],
      );
      await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,'operario')", [
        u?.id,
        o?.id,
      ]);
      return o?.id as string;
    });
  }, 60_000);

  afterAll(async () => {
    for (const a of apps) await a.close();
    await db.close();
  });

  it("devuelve lo interpretado ya validado", async () => {
    const app = await start(async (request) => {
      seen.push(request);
      return {
        values: [
          { name: "tag", value: "BOV-2" },
          { name: "tag2", value: "x" },
          { name: "litros", value: "20" },
        ],
        question: "¿Seguro que fueron 20 litros?",
        action: "guardar",
      };
    });
    const res = await send(app, await login(app));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      values: { tag: "BOV-2", litros: "20" },
      question: "¿Seguro que fueron 20 litros?",
      action: "continuar",
    });
    expect(seen[0]?.alternatives).toEqual(["la bov dos dio veinte"]);
  });

  it("exige sesión y pertenecer a la organización", async () => {
    const app = await start(async () => ({ values: [], question: null, action: "continuar" }));
    const anon = await app.inject({
      method: "POST",
      url: "/v1/voice/interpret",
      headers: H,
      payload: form(orgId),
    });
    expect(anon.statusCode).toBe(401);
    expect((await send(app, await login(app), ORG_OTRA)).statusCode).toBe(403);
  });

  it("responde 503 sin intérprete, si falla o si devuelve algo inválido", async () => {
    for (const interpreter of [
      null,
      async () => {
        throw new Error("caído");
      },
      async () => null,
      async () => ({ cualquier: "cosa" }),
    ]) {
      const app = await start(interpreter);
      const res = await send(app, await login(app));
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe("VOZ_NO_DISPONIBLE");
    }
  });
});
