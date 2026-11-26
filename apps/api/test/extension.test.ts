import { DATA_CONSENT_VERSION } from "@ganaderia/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AskFn } from "../src/assistant.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };
const ask: AskFn = async () => ({ text: "", inputTokens: 0, outputTokens: 0, refused: false });

let db: Db;
let app: FastifyInstance;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function user(email: string, name: string) {
  const hash = await hashPassword(PASSWORD);
  const [u] = await db.admin((q) =>
    q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
      [email, name, hash],
    ),
  );
  return u?.id as string;
}
async function member(userId: string, orgId: string, role = "propietario") {
  await db.admin((q) =>
    q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
      userId,
      orgId,
      role,
    ]),
  );
}
async function share(userId: string, on: boolean) {
  await db.admin((q) =>
    q(
      "INSERT INTO data_consent (user_id, version, sector_analysis, share_technical) VALUES ($1,$2,false,$3)",
      [userId, DATA_CONSENT_VERSION, on],
    ),
  );
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
const as = (who: string) => ({ cookie: cookies[who] as string, ...H });

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask, ecosistema: null });
  const orgs = await db.admin((q) =>
    q<{ id: string }>(
      `INSERT INTO organization (name, department, municipality) VALUES
        ('Hato Ana', 'Córdoba', 'Montería'), ('Hato Beto', 'Cordoba', 'Lorica'), ('Hato Caro', 'Antioquia', 'Caucasia')
       RETURNING id`,
    ),
  );
  ids.orgA = orgs[0]?.id as string;
  ids.orgB = orgs[1]?.id as string;
  ids.orgC = orgs[2]?.id as string;
  const [f] = await db.admin((q) =>
    q<{ id: string }>(
      "INSERT INTO farm (organization_id, code, name, species_present, livestock_area_ha, total_area_ha) VALUES ($1,'F1','El Roble',ARRAY['bovino'],40,50) RETURNING id",
      [ids.orgA],
    ),
  );
  ids.farmA = f?.id as string;
  ids.ana = await user("ana@ext.local", "Ana Pérez");
  ids.beto = await user("beto@ext.local", "Beto Díaz");
  ids.caro = await user("caro@ext.local", "Caro Ruiz");
  ids.sec = await user("sec@ext.local", "Secretaría Córdoba");
  await member(ids.ana as string, ids.orgA as string);
  await member(ids.beto as string, ids.orgB as string);
  await member(ids.caro as string, ids.orgC as string);
  await share(ids.ana as string, true);
  await share(ids.beto as string, false);
  await share(ids.caro as string, true);
  await db.admin((q) =>
    q(
      "INSERT INTO gremio_staff (user_id, role, tecnigan, departments) VALUES ($1,'secretario_tecnico','TECNIG@N de Córdoba',ARRAY['Córdoba'])",
      [ids.sec],
    ),
  );
  for (const who of ["ana", "beto", "caro", "sec"]) cookies[who] = await login(`${who}@ext.local`);
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("extensión híbrida con adopción verificada", () => {
  it("sin autorización de compartir no se puede escalar al Secretario Técnico", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/extension/consultas",
      headers: as("beto"),
      payload: {
        organizationId: ids.orgB,
        topic: "sanidad",
        question: "¿Cada cuánto vacuno contra aftosa?",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("COMPARTIR_REQUERIDO");
  });

  it("nadie escala por una ganadería que no es suya", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/extension/consultas",
      headers: as("caro"),
      payload: {
        organizationId: ids.orgA,
        topic: "otro",
        question: "Consulta por otra finca ajena.",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("el Secretario ve solo las ganaderías de su región que autorizaron, y conversa por la consulta", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/extension/consultas",
      headers: as("ana"),
      payload: {
        organizationId: ids.orgA,
        farmId: ids.farmA,
        topic: "reproduccion",
        question: "Mis novillas paren a los 40 meses. ¿Qué hago?",
        aiAnswer: "Revise la curva de crecimiento y la suplementación.",
      },
    });
    expect(created.statusCode).toBe(201);
    ids.case = created.json().id;
    expect(created.json()).toMatchObject({ status: "abierta", organizationName: "Hato Ana" });

    const inbox = (await app.inject({ url: "/v1/gremio/bandeja", headers: as("sec") })).json();
    expect(inbox.staff.tecnigan).toBe("TECNIG@N de Córdoba");
    expect(
      inbox.organizations.map((o: { organizationName: string }) => o.organizationName),
    ).toEqual(["Hato Ana"]);
    expect(inbox.organizations[0].farms[0]).toMatchObject({
      name: "El Roble",
      areaHa: 40,
      animals: 0,
    });
    expect(inbox.cases).toHaveLength(1);

    const reply = await app.inject({
      method: "POST",
      url: `/v1/extension/consultas/${ids.case}/mensajes`,
      headers: as("sec"),
      payload: { body: "Pésela cada mes y apunte a 300 kg al primer servicio." },
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json().case.status).toBe("respondida");
    expect(reply.json().messages[0]).toMatchObject({ fromStaff: true });

    const back = await app.inject({
      method: "POST",
      url: `/v1/extension/consultas/${ids.case}/mensajes`,
      headers: as("ana"),
      payload: { body: "Gracias, empiezo esta semana." },
    });
    expect(back.json().case.status).toBe("abierta");

    const other = await app.inject({
      url: `/v1/extension/consultas/${ids.case}`,
      headers: as("caro"),
    });
    expect(other.statusCode).toBe(403);
    const nonStaff = await app.inject({ url: "/v1/gremio/bandeja", headers: as("ana") });
    expect(nonStaff.statusCode).toBe(403);
  });

  it("solo el Secretario recomienda; la ganadería declara la adopción y el técnico la verifica", async () => {
    const byOwner = await app.inject({
      method: "POST",
      url: "/v1/extension/recomendaciones",
      headers: as("ana"),
      payload: {
        organizationId: ids.orgA,
        topic: "nutricion",
        title: "Suplementar novillas en verano",
      },
    });
    expect(byOwner.statusCode).toBe(403);
    const otherRegion = await app.inject({
      method: "POST",
      url: "/v1/extension/recomendaciones",
      headers: as("sec"),
      payload: { organizationId: ids.orgC, topic: "nutricion", title: "Fuera de su región" },
    });
    expect(otherRegion.statusCode).toBe(403);

    const reco = await app.inject({
      method: "POST",
      url: "/v1/extension/recomendaciones",
      headers: as("sec"),
      payload: {
        organizationId: ids.orgA,
        farmId: ids.farmA,
        caseId: ids.case,
        topic: "nutricion",
        title: "Pesar las novillas cada mes y suplementar",
        detail: "Meta: 300 kg al primer servicio.",
        indicator: "edadPrimerParto",
        dueOn: "2027-02-28",
      },
    });
    expect(reco.statusCode).toBe(201);
    ids.reco = reco.json().id;
    expect(reco.json()).toMatchObject({
      status: "pendiente",
      indicator: "edadPrimerParto",
      fromStaff: true,
    });

    const early = await app.inject({
      method: "POST",
      url: `/v1/extension/recomendaciones/${ids.reco}/verificar`,
      headers: as("sec"),
      payload: { note: "" },
    });
    expect(early.statusCode).toBe(409);

    const staffSets = await app.inject({
      method: "PATCH",
      url: `/v1/extension/recomendaciones/${ids.reco}`,
      headers: as("sec"),
      payload: { status: "adoptada" },
    });
    expect(staffSets.statusCode).toBe(403);

    const adopted = await app.inject({
      method: "PATCH",
      url: `/v1/extension/recomendaciones/${ids.reco}`,
      headers: as("ana"),
      payload: { status: "adoptada" },
    });
    expect(adopted.json()).toMatchObject({ status: "adoptada" });
    expect(adopted.json().adoptedAt).toBeTruthy();

    const selfVerify = await app.inject({
      method: "POST",
      url: `/v1/extension/recomendaciones/${ids.reco}/verificar`,
      headers: as("ana"),
      payload: {},
    });
    expect(selfVerify.statusCode).toBe(403);

    const verified = await app.inject({
      method: "POST",
      url: `/v1/extension/recomendaciones/${ids.reco}/verificar`,
      headers: as("sec"),
      payload: { note: "Vi la báscula y los registros." },
    });
    expect(verified.json()).toMatchObject({ verificationNote: "Vi la báscula y los registros." });

    const locked = await app.inject({
      method: "PATCH",
      url: `/v1/extension/recomendaciones/${ids.reco}`,
      headers: as("ana"),
      payload: { status: "descartada" },
    });
    expect(locked.statusCode).toBe(409);
  });

  it("la verificación en campo y los indicadores quedan en el resumen de la ganadería", async () => {
    const v = await app.inject({
      method: "POST",
      url: "/v1/gremio/verificaciones",
      headers: as("sec"),
      payload: {
        organizationId: ids.orgA,
        farmId: ids.farmA,
        visitedOn: "2026-11-20",
        note: "Línea base medida.",
      },
    });
    expect(v.statusCode).toBe(201);

    const sum = (
      await app.inject({ url: `/v1/extension?organizationId=${ids.orgA}`, headers: as("ana") })
    ).json();
    expect(sum.shares).toBe(true);
    expect(sum.tecnigan).toBe("TECNIG@N de Córdoba");
    expect(sum.verifications[0]).toMatchObject({ farmId: ids.farmA, visitedOn: "2026-11-20" });
    expect(sum.indicators).toMatchObject({
      recommendations: 1,
      adopted: 1,
      verified: 1,
      verifiedAdoptionRate: 100,
      escalated: 1,
      secondLevelAttentions: 1,
    });

    const inbox = (await app.inject({ url: "/v1/gremio/bandeja", headers: as("sec") })).json();
    expect(inbox.organizations[0].farms[0].verifiedOn).toBe("2026-11-20");

    const notMine = await app.inject({
      url: `/v1/extension?organizationId=${ids.orgA}`,
      headers: as("caro"),
    });
    expect(notMine.statusCode).toBe(403);
  });

  it("si el dueño retira la autorización, el Secretario deja de ver la ganadería", async () => {
    await share(ids.ana as string, false);
    const thread = await app.inject({
      url: `/v1/extension/consultas/${ids.case}`,
      headers: as("sec"),
    });
    expect(thread.statusCode).toBe(403);
    const inbox = (await app.inject({ url: "/v1/gremio/bandeja", headers: as("sec") })).json();
    expect(inbox.organizations).toEqual([]);
    expect(inbox.cases).toEqual([]);
    // La ganadería sigue viendo lo suyo.
    const own = await app.inject({
      url: `/v1/extension/consultas/${ids.case}`,
      headers: as("ana"),
    });
    expect(own.statusCode).toBe(200);
  });
});
