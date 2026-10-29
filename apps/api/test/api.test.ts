import type { PullResponse, PushResponse } from "@ganaderia/contracts";
import { uuidv7 } from "@ganaderia/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };

let db: Db;
let app: FastifyInstance;
let orgA: string;
let orgB: string;
let farmA: string;
let farmA2: string;
let farmB: string;

async function addUser(email: string, orgId: string, role: string, farmId: string | null = null) {
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    const rows = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$1,$2) RETURNING id",
      [email, hash],
    );
    await q(
      "INSERT INTO membership (user_id, organization_id, role, farm_id) VALUES ($1,$2,$3,$4)",
      [rows[0]?.id, orgId, role, farmId],
    );
  });
}

async function loginAs(email: string, password = PASSWORD): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === "sid");
  expect(c).toBeDefined();
  return `sid=${c?.value}`;
}

const cmd = (farmId: string, tag: string, extra: Record<string, unknown> = {}, id = uuidv7()) => ({
  id,
  type: "animal.register",
  clientTs: new Date().toISOString(),
  payload: {
    id: uuidv7(),
    farmId,
    tag,
    species: "bovino",
    sex: "hembra",
    category: "vaca",
    entry: { reason: "inventario_inicial", occurredAt: "2026-10-01" },
    ...extra,
  },
});

async function push(cookie: string, orgId: string, commands: unknown[]) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/sync/push",
    headers: { ...H, cookie },
    payload: { organizationId: orgId, deviceId: "dispositivo-prueba", commands },
  });
  return { status: res.statusCode, body: res.json() as PushResponse };
}

async function pull(cookie: string, orgId: string, since = 0, limit = 200) {
  const res = await app.inject({
    method: "GET",
    url: `/v1/sync/pull?organizationId=${orgId}&since=${since}&limit=${limit}`,
    headers: { cookie },
  });
  return { status: res.statusCode, body: res.json() as PullResponse };
}

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db });
  const ids = await db.admin(async (q) => {
    const [a] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Org A') RETURNING id",
    );
    const [b] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Org B') RETURNING id",
    );
    const f = async (org: string, code: string) =>
      (
        await q<{ id: string }>(
          "INSERT INTO farm (organization_id, code, name, species_present) VALUES ($1,$2,$2,ARRAY['bovino','bufalino']) RETURNING id",
          [org, code],
        )
      )[0]?.id as string;
    return {
      a: a?.id as string,
      b: b?.id as string,
      fa: await f(a?.id as string, "A1"),
      fa2: await f(a?.id as string, "A2"),
      fb: await f(b?.id as string, "B1"),
    };
  });
  orgA = ids.a;
  orgB = ids.b;
  farmA = ids.fa;
  farmA2 = ids.fa2;
  farmB = ids.fb;
  await addUser("dueno-a@test.local", orgA, "propietario");
  await addUser("operario-a@test.local", orgA, "operario");
  await addUser("dueno-b@test.local", orgB, "propietario");
  await addUser("solo-finca2@test.local", orgA, "propietario", farmA2);
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("autenticación y sesión", () => {
  it("rechaza contraseña incorrecta y no revela si el usuario existe", async () => {
    const mal = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "dueno-a@test.local", password: "x" },
    });
    const noExiste = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "nadie@test.local", password: "x" },
    });
    expect(mal.statusCode).toBe(401);
    expect(noExiste.statusCode).toBe(401);
    expect(mal.json()).toEqual(noExiste.json());
  });

  it("emite cookie httpOnly SameSite=Strict y un lease offline de 72 h", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "dueno-a@test.local", password: PASSWORD },
    });
    const c = res.cookies.find((x) => x.name === "sid");
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe("Strict");
    const lease = new Date(res.json().offlineLeaseUntil).getTime() - Date.now();
    expect(lease).toBeGreaterThan(71.9 * 3_600_000);
    expect(lease).toBeLessThanOrEqual(72 * 3_600_000);
  });

  it("exige sesión y encabezado anti-CSRF", async () => {
    expect(
      (await app.inject({ method: "GET", url: `/v1/farms?organizationId=${orgA}` })).statusCode,
    ).toBe(401);
    const sinHeader = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "a@b.co", password: "x" },
    });
    expect(sinHeader.statusCode).toBe(403);
  });

  it("bloquea tras 5 intentos fallidos", async () => {
    await addUser("bloqueo@test.local", orgA, "operario");
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: H,
        payload: { email: "bloqueo@test.local", password: "mala" },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: H,
      payload: { email: "bloqueo@test.local", password: PASSWORD },
    });
    expect(res.statusCode).toBe(429);
  });

  it("el cierre de sesión invalida la cookie", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { ...H, cookie } });
    const res = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe("registro de animales por comandos idempotentes", () => {
  it("acepta un alta y la entrega en la descarga", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const c = cmd(farmA, "bov-001");
    const { body } = await push(cookie, orgA, [c]);
    expect(body.results[0]?.status).toBe("accepted");
    const p = await pull(cookie, orgA);
    const animales = p.body.changes.filter((x) => x.entity === "animal");
    expect(animales).toHaveLength(1);
    expect(animales[0]?.data).toMatchObject({
      tag: "BOV-001",
      species: "bovino",
      status: "activo",
    });
  });

  it("un reenvío no duplica y devuelve la misma respuesta", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const c = cmd(farmA, "BOV-IDEM");
    const first = await push(cookie, orgA, [c]);
    const second = await push(cookie, orgA, [c, c]);
    expect(
      second.body.results.every((r) => JSON.stringify(r) === JSON.stringify(first.body.results[0])),
    ).toBe(true);
    const n = await db.tenant(orgA, (q) => q("SELECT 1 FROM animal WHERE tag = 'BOV-IDEM'"));
    expect(n).toHaveLength(1);
  });

  it("marca conflicto con un arete activo duplicado dentro de la organización", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    await push(cookie, orgA, [cmd(farmA, "DUP-1")]);
    const { body } = await push(cookie, orgA, [cmd(farmA2, "dup-1")]);
    expect(body.results[0]).toMatchObject({ status: "conflict", code: "TAG_DUPLICADO" });
  });

  it("permite el mismo arete en otra organización", async () => {
    const a = await loginAs("dueno-a@test.local");
    const b = await loginAs("dueno-b@test.local");
    await push(a, orgA, [cmd(farmA, "COMUN-1")]);
    const { body } = await push(b, orgB, [cmd(farmB, "COMUN-1")]);
    expect(body.results[0]?.status).toBe("accepted");
  });

  it("rechaza al operario (sin permiso de alta)", async () => {
    const cookie = await loginAs("operario-a@test.local");
    const { body } = await push(cookie, orgA, [cmd(farmA, "OPE-1")]);
    expect(body.results[0]).toMatchObject({ status: "rejected", code: "PERMISO_DENEGADO" });
  });

  it("rechaza un comando mal formado sin romper el lote", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const { body } = await push(cookie, orgA, [
      { id: uuidv7(), type: "otra.cosa" },
      cmd(farmA, "LOTE-OK"),
    ]);
    expect(body.results[0]?.status).toBe("rejected");
    expect(body.results[1]?.status).toBe("accepted");
  });

  it("valida genealogía: madre de otra especie es rechazada", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const madre = cmd(farmA, "BUF-MADRE", { species: "bufalino", sex: "hembra" });
    await push(cookie, orgA, [madre]);
    const { body } = await push(cookie, orgA, [
      cmd(farmA, "BOV-HIJA", { species: "bovino", motherId: madre.payload.id }),
    ]);
    expect(body.results[0]).toMatchObject({ status: "rejected", code: "MADRE_INVALIDA" });
  });

  it("rechaza fechas futuras", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const { body } = await push(cookie, orgA, [
      cmd(farmA, "FUT-1", { entry: { reason: "compra", occurredAt: "2999-01-01" } }),
    ]);
    expect(body.results[0]).toMatchObject({ status: "rejected", code: "FECHA_FUTURA" });
  });
});

describe("aislamiento entre organizaciones y fincas (CA L01)", () => {
  it("no permite descargar otra organización aunque se conozca su id", async () => {
    const b = await loginAs("dueno-b@test.local");
    expect((await pull(b, orgA)).status).toBe(403);
    const res = await app.inject({
      method: "GET",
      url: `/v1/farms?organizationId=${orgA}`,
      headers: { cookie: b },
    });
    expect(res.statusCode).toBe(403);
  });

  it("no permite registrar en una finca ajena aunque se conozca su id", async () => {
    const b = await loginAs("dueno-b@test.local");
    const { body } = await push(b, orgB, [cmd(farmA, "ROBO-1")]);
    expect(body.results[0]).toMatchObject({ status: "rejected" });
    const n = await db.admin((q) => q("SELECT 1 FROM animal WHERE tag = 'ROBO-1'"));
    expect(n).toHaveLength(0);
  });

  it("RLS: el contexto de una organización no ve filas de otra, ni con consultas sin filtro", async () => {
    const filas = await db.tenant(orgB, (q) =>
      q<{ organization_id: string }>("SELECT organization_id FROM animal"),
    );
    expect(filas.every((r) => r.organization_id === orgB)).toBe(true);
    const fincas = await db.tenant(orgB, (q) => q("SELECT * FROM farm WHERE id = $1", [farmA]));
    expect(fincas).toHaveLength(0);
  });

  it("RLS: no se puede insertar filas de otra organización", async () => {
    await expect(
      db.tenant(orgB, (q) =>
        q(
          "INSERT INTO farm (organization_id, code, name, species_present) VALUES ($1,'X','X',ARRAY['bovino'])",
          [orgA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("un usuario restringido a una finca solo recibe esa finca", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    await push(dueno, orgA, [cmd(farmA2, "F2-1")]);
    const solo = await loginAs("solo-finca2@test.local");
    const p = await pull(solo, orgA);
    const fincas = p.body.changes.filter((c) => c.entity === "farm").map((c) => c.data.id);
    expect(fincas.every((id) => id === farmA2)).toBe(true);
    const animales = p.body.changes.filter((c) => c.entity === "animal");
    expect(animales.length).toBeGreaterThan(0);
    expect(animales.every((c) => c.data.farmId === farmA2)).toBe(true);
    const full = await pull(dueno, orgA);
    expect(full.body.scope).not.toBe(p.body.scope);
  });
});

describe("descarga incremental", () => {
  it("pagina y el cursor permite continuar sin repetir ni perder", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const all = await pull(cookie, orgA, 0, 500);
    const total = all.body.changes.length;
    const seen: number[] = [];
    let since = 0;
    for (let i = 0; i < 100; i++) {
      const page = await pull(cookie, orgA, since, 3);
      seen.push(...page.body.changes.map((c) => c.version));
      since = page.body.cursor;
      if (!page.body.hasMore) break;
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    const next = await pull(cookie, orgA, since);
    expect(next.body.changes).toHaveLength(0);
  });
});

describe("inmutabilidad y auditoría", () => {
  it("los eventos de animal no se pueden modificar ni borrar", async () => {
    await expect(db.admin((q) => q("UPDATE animal_event SET type = 'x'"))).rejects.toThrow(
      /solo agregar/,
    );
    await expect(db.admin((q) => q("DELETE FROM animal_event"))).rejects.toThrow(/solo agregar/);
  });

  it("la cadena de auditoría verifica y detecta alteraciones", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const ok = await app.inject({
      method: "GET",
      url: `/v1/audit/verify?organizationId=${orgA}`,
      headers: { cookie },
    });
    expect(ok.json()).toMatchObject({ ok: true });
    expect(ok.json().count).toBeGreaterThan(5);

    // Un operario no puede consultar la auditoría.
    const op = await loginAs("operario-a@test.local");
    const denied = await app.inject({
      method: "GET",
      url: `/v1/audit/verify?organizationId=${orgA}`,
      headers: { cookie: op },
    });
    expect(denied.statusCode).toBe(403);

    // La alteración directa está bloqueada por trigger.
    await expect(db.admin((q) => q("UPDATE audit_log SET action = 'x'"))).rejects.toThrow(
      /solo agregar/,
    );
  });
});

describe("fincas", () => {
  it("el propietario crea una finca; el operario no", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const ok = await app.inject({
      method: "POST",
      url: "/v1/farms",
      headers: { ...H, cookie: dueno },
      payload: {
        organizationId: orgA,
        code: "NUEVA-1",
        name: "Finca nueva",
        speciesPresent: ["bovino"],
      },
    });
    expect(ok.statusCode).toBe(201);
    const dup = await app.inject({
      method: "POST",
      url: "/v1/farms",
      headers: { ...H, cookie: dueno },
      payload: { organizationId: orgA, code: "NUEVA-1", name: "Otra", speciesPresent: ["bovino"] },
    });
    expect(dup.statusCode).toBe(409);
    const op = await loginAs("operario-a@test.local");
    const no = await app.inject({
      method: "POST",
      url: "/v1/farms",
      headers: { ...H, cookie: op },
      payload: { organizationId: orgA, code: "NUEVA-2", name: "No", speciesPresent: ["bovino"] },
    });
    expect(no.statusCode).toBe(403);
  });
});
