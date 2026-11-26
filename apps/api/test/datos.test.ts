import { DATA_CONSENT_VERSION } from "@ganaderia/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AskFn } from "../src/assistant.js";
import { hashPassword } from "../src/auth.js";
import { REQUESTS_PER_DAY } from "../src/datos.js";
import { type Db, createPgliteDb } from "../src/db.js";

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };
const ask: AskFn = async () => ({ text: "", inputTokens: 0, outputTokens: 0, refused: false });

let db: Db;
let app: FastifyInstance;
let cookieOwner = "";
let cookieWorker = "";
let orgA = "";

async function addUser(email: string, name: string, orgId: string, role: string) {
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    const [u] = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
      [email, name, hash],
    );
    await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
      u?.id,
      orgId,
      role,
    ]);
  });
}

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask, ecosistema: null });
  const [a, b] = await db.admin((q) =>
    q<{ id: string }>(
      "INSERT INTO organization (name, department) VALUES ('Hato A', 'Meta'), ('Hato B', 'Cesar') RETURNING id",
    ),
  );
  orgA = a?.id as string;
  await db.admin(async (q) => {
    await q(
      "INSERT INTO farm (organization_id, code, name, species_present) VALUES ($1,'F1','La Esperanza',ARRAY['bovino']), ($2,'F1','Ajena',ARRAY['bovino'])",
      [orgA, b?.id],
    );
  });
  await addUser("duena@datos.local", "Dueña Pérez", orgA, "propietario");
  await addUser("operario@datos.local", "Operario Gómez", orgA, "operario");
  cookieOwner = await login("duena@datos.local");
  cookieWorker = await login("operario@datos.local");
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("protocolo de datos del productor", () => {
  it("pide el consentimiento la primera vez y guarda cada cambio como historial", async () => {
    const h = { cookie: cookieOwner, ...H };
    expect((await app.inject({ url: "/v1/me/consentimiento" })).statusCode).toBe(401);

    const first = (await app.inject({ url: "/v1/me/consentimiento", headers: h })).json();
    expect(first).toEqual({ currentVersion: DATA_CONSENT_VERSION, consent: null, required: true });

    const saved = await app.inject({
      method: "PUT",
      url: "/v1/me/consentimiento",
      headers: h,
      payload: { version: DATA_CONSENT_VERSION, sectorAnalysis: true, shareTechnical: false },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      required: false,
      consent: { sectorAnalysis: true, shareTechnical: false },
    });

    await app.inject({
      method: "PUT",
      url: "/v1/me/consentimiento",
      headers: h,
      payload: { version: DATA_CONSENT_VERSION, sectorAnalysis: false, shareTechnical: true },
    });
    const now = (await app.inject({ url: "/v1/me/consentimiento", headers: h })).json();
    expect(now.consent).toMatchObject({ sectorAnalysis: false, shareTechnical: true });
    const [n] = await db.admin((q) =>
      q<{ n: number | string }>("SELECT count(*) AS n FROM data_consent"),
    );
    expect(Number(n?.n)).toBe(2);
  });

  it("no acepta una versión vieja del texto", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/consentimiento",
      headers: { cookie: cookieOwner, ...H },
      payload: { version: "2020-01", sectorAnalysis: true, shareTechnical: true },
    });
    expect(res.statusCode).toBe(409);
  });

  it("entrega a la dueña los datos de su ganadería y nada de otra", async () => {
    const res = await app.inject({ url: "/v1/me/datos", headers: { cookie: cookieOwner, ...H } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="mis-datos-/);
    const body = res.json();
    expect(body.cuenta).toEqual({ correo: "duena@datos.local", nombre: "Dueña Pérez" });
    expect(body.consentimientos).toHaveLength(2);
    expect(body.ganaderias).toHaveLength(1);
    const farms = body.ganaderias[0].datos.farm as { name: string }[];
    expect(farms.map((f) => f.name)).toEqual(["La Esperanza"]);
    expect(JSON.stringify(body)).not.toContain("Ajena");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("al operario no le entrega los datos de la finca, solo los suyos", async () => {
    const body = (
      await app.inject({ url: "/v1/me/datos", headers: { cookie: cookieWorker, ...H } })
    ).json();
    expect(body.ganaderias[0]).toMatchObject({ rol: "operario", datos: null });
    expect(body.consentimientos).toEqual([]);
  });

  it("recibe solicitudes de rectificación con límite diario", async () => {
    const h = { cookie: cookieOwner, ...H };
    const bad = await app.inject({
      method: "POST",
      url: "/v1/me/solicitudes",
      headers: h,
      payload: { kind: "rectificacion", message: "corto" },
    });
    expect(bad.statusCode).toBe(400);
    for (let i = 0; i < REQUESTS_PER_DAY; i++) {
      const ok = await app.inject({
        method: "POST",
        url: "/v1/me/solicitudes",
        headers: h,
        payload: { kind: "rectificacion", message: `El área de la finca es 40 ha, no 4 (${i}).` },
      });
      expect(ok.statusCode).toBe(201);
    }
    const tooMany = await app.inject({
      method: "POST",
      url: "/v1/me/solicitudes",
      headers: h,
      payload: { kind: "consulta", message: "¿Quién ve los datos de mi finca?" },
    });
    expect(tooMany.statusCode).toBe(429);
    const list = (await app.inject({ url: "/v1/me/solicitudes", headers: h })).json();
    expect(list.items).toHaveLength(REQUESTS_PER_DAY);
    expect(list.items[0].status).toBe("recibida");
    const other = (
      await app.inject({ url: "/v1/me/solicitudes", headers: { cookie: cookieWorker, ...H } })
    ).json();
    expect(other.items).toEqual([]);
  });
});
