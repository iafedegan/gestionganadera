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

/* ───────────── ERP 1 · Insumos y existencias ───────────── */

const env = (type: string, payload: Record<string, unknown>, id = uuidv7()) => ({
  id,
  type,
  clientTs: new Date().toISOString(),
  payload,
});

const newSupply = (name: string, extra: Record<string, unknown> = {}) =>
  env("supply.create", {
    id: uuidv7(),
    name,
    category: "suplemento",
    unit: "kg",
    minStock: 10,
    ...extra,
  });

const receive = (
  supplyId: string,
  farmId: string,
  quantity: number,
  extra: Record<string, unknown> = {},
) => env("stock.receive", { supplyId, farmId, quantity, occurredOn: "2026-10-01", ...extra });

const consume = (
  supplyId: string,
  farmId: string,
  quantity: number,
  extra: Record<string, unknown> = {},
) =>
  env("stock.consume", {
    supplyId,
    farmId,
    quantity,
    occurredOn: "2026-10-20",
    target: { kind: "lote", label: "Lote 1" },
    ...extra,
  });

async function balances(orgId: string, supplyId: string) {
  return db.tenant(orgId, (q) =>
    q<{ lot_code: string | null; balance: number }>(
      `SELECT lot_code, sum(CASE kind WHEN 'entrada' THEN quantity ELSE -quantity END)::float8 AS balance
         FROM stock_movement WHERE supply_id = $1 GROUP BY lot_code ORDER BY lot_code`,
      [supplyId],
    ),
  );
}

describe("insumos: catálogo y permisos", () => {
  it("el propietario crea insumos; el operario no; el nombre no se repite", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const op = await loginAs("operario-a@test.local");
    const ok = await push(dueno, orgA, [newSupply("Sal mineral")]);
    expect(ok.body.results[0]?.status).toBe("accepted");
    const no = await push(op, orgA, [newSupply("Melaza")]);
    expect(no.body.results[0]).toMatchObject({ status: "rejected", code: "PERMISO_DENEGADO" });
    const dup = await push(dueno, orgA, [newSupply("sal MINERAL")]);
    expect(dup.body.results[0]).toMatchObject({ status: "conflict", code: "INSUMO_DUPLICADO" });
  });

  it("el catálogo llega a quien está restringido a una finca", async () => {
    const solo = await loginAs("solo-finca2@test.local");
    const p = await pull(solo, orgA);
    expect(p.body.changes.some((c) => c.entity === "supply")).toBe(true);
  });
});

describe("insumos: recepción y consumo FEFO", () => {
  it("consume del lote que vence primero y deja el saldo correcto", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const s = newSupply("Vacuna aftosa", { category: "medicamento", unit: "dosis" });
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    await push(dueno, orgA, [
      receive(id, farmA, 100, { lotCode: "L-TARDE", expiresOn: "2027-06-01" }),
      receive(id, farmA, 40, { lotCode: "L-PRONTO", expiresOn: "2026-12-15" }),
    ]);
    const res = await push(dueno, orgA, [consume(id, farmA, 60)]);
    expect(res.body.results[0]?.status).toBe("accepted");
    const b = await balances(orgA, id);
    expect(b).toEqual([
      { lot_code: "L-PRONTO", balance: 0 },
      { lot_code: "L-TARDE", balance: 80 },
    ]);
  });

  it("rechaza consumir más de lo disponible y no registra nada", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const s = newSupply("Concentrado");
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    await push(dueno, orgA, [receive(id, farmA, 25)]);
    const res = await push(dueno, orgA, [consume(id, farmA, 26)]);
    expect(res.body.results[0]).toMatchObject({ status: "conflict", code: "STOCK_INSUFICIENTE" });
    expect(await balances(orgA, id)).toEqual([{ lot_code: null, balance: 25 }]);
  });

  it("nunca consume un lote vencido", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const s = newSupply("Antibiótico", { category: "medicamento", unit: "L" });
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    await push(dueno, orgA, [
      receive(id, farmA, 10, {
        occurredOn: "2026-01-01",
        lotCode: "VIEJO",
        expiresOn: "2026-06-01",
      }),
    ]);
    const res = await push(dueno, orgA, [consume(id, farmA, 1)]);
    expect(res.body.results[0]).toMatchObject({ status: "conflict", code: "STOCK_INSUFICIENTE" });
    expect(res.body.results[0]).toMatchObject({ message: expect.stringContaining("vencidos") });
  });

  it("un reenvío no descuenta dos veces", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const s = newSupply("Fertilizante", { category: "fertilizante", unit: "bulto" });
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    await push(dueno, orgA, [receive(id, farmA, 50)]);
    const c = consume(id, farmA, 10);
    await push(dueno, orgA, [c]);
    await push(dueno, orgA, [c, c]);
    expect(await balances(orgA, id)).toEqual([{ lot_code: null, balance: 40 }]);
  });

  it("rechaza fechas futuras, producto ya vencido al recibirlo e insumo inexistente", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const s = newSupply("Sal blanca");
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    const fut = await push(dueno, orgA, [receive(id, farmA, 1, { occurredOn: "2999-01-01" })]);
    expect(fut.body.results[0]).toMatchObject({ code: "FECHA_FUTURA" });
    const venc = await push(dueno, orgA, [receive(id, farmA, 1, { expiresOn: "2026-01-01" })]);
    expect(venc.body.results[0]).toMatchObject({ code: "VALIDACION" });
    const nada = await push(dueno, orgA, [receive(uuidv7(), farmA, 1)]);
    expect(nada.body.results[0]).toMatchObject({ code: "INSUMO_NO_EXISTE" });
  });

  it("los movimientos no se pueden modificar ni borrar", async () => {
    await expect(db.admin((q) => q("UPDATE stock_movement SET quantity = 1"))).rejects.toThrow(
      /solo agregar/,
    );
    await expect(db.admin((q) => q("DELETE FROM stock_movement"))).rejects.toThrow(/solo agregar/);
  });
});

describe("insumos: permisos por finca, costos y aislamiento", () => {
  it("el operario recibe y consume, pero no puede registrar costos", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const op = await loginAs("operario-a@test.local");
    const s = newSupply("Pasto de corte", { category: "alimento" });
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    const r = await push(op, orgA, [receive(id, farmA, 30, { unitCost: 999 })]);
    expect(r.body.results[0]?.status).toBe("accepted");
    const costos = await db.tenant(orgA, (q) =>
      q<{ unit_cost: string | null }>("SELECT unit_cost FROM stock_movement WHERE supply_id = $1", [
        id,
      ]),
    );
    expect(costos[0]?.unit_cost).toBeNull();
  });

  it("el costo solo llega a quien tiene acceso económico", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const op = await loginAs("operario-a@test.local");
    const s = newSupply("Medicamento caro", { category: "medicamento", unit: "dosis" });
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    await push(dueno, orgA, [
      receive(id, farmA, 5, { unitCost: 12500, supplier: "Droguería Demo" }),
    ]);
    const mov = (p: Awaited<ReturnType<typeof pull>>) =>
      p.body.changes.find((c) => c.entity === "stock_movement" && c.data.supplyId === id) as
        | { data: { unitCost: number | null; supplier: string | null } }
        | undefined;
    expect(mov(await pull(dueno, orgA))?.data.unitCost).toBe(12500);
    const vistoPorOperario = mov(await pull(op, orgA));
    expect(vistoPorOperario).toBeDefined();
    expect(vistoPorOperario?.data.unitCost).toBeNull();
  });

  it("un usuario de una finca no mueve existencias de otra", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const solo = await loginAs("solo-finca2@test.local");
    const s = newSupply("Mineral finca 2");
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    const no = await push(solo, orgA, [receive(id, farmA, 5)]);
    expect(no.body.results[0]).toMatchObject({ status: "rejected", code: "PERMISO_DENEGADO" });
    const si = await push(solo, orgA, [receive(id, farmA2, 5)]);
    expect(si.body.results[0]?.status).toBe("accepted");
    const pa = await pull(solo, orgA);
    const movs = pa.body.changes.filter((c) => c.entity === "stock_movement");
    expect(movs.every((c) => c.data.farmId === farmA2)).toBe(true);
  });

  it("otra organización no ve ni usa los insumos ajenos", async () => {
    const dueno = await loginAs("dueno-a@test.local");
    const b = await loginAs("dueno-b@test.local");
    const s = newSupply("Insumo privado de A");
    await push(dueno, orgA, [s]);
    const id = s.payload.id as string;
    const res = await push(b, orgB, [receive(id, farmB, 5)]);
    expect(res.body.results[0]).toMatchObject({ status: "rejected", code: "INSUMO_NO_EXISTE" });
    const pb = await pull(b, orgB);
    expect(pb.body.changes.some((c) => c.entity === "supply" && c.data.id === id)).toBe(false);
    const filas = await db.tenant(orgB, (q) => q("SELECT 1 FROM supply WHERE id = $1", [id]));
    expect(filas).toHaveLength(0);
  });
});

describe("mapa de la finca: linderos y potreros", () => {
  const ring: [number, number][] = [
    [8.47, -75.73],
    [8.47, -75.72],
    [8.48, -75.72],
    [8.48, -75.73],
  ];
  const mapCmd = (farmId: string, baseRevision: number, paddocks = 1, id = uuidv7()) => ({
    id,
    type: "farm.map.save",
    clientTs: new Date().toISOString(),
    payload: {
      farmId,
      baseRevision,
      boundary: ring,
      paddocks: Array.from({ length: paddocks }, (_, i) => ({
        id: `P${i + 1}`,
        name: `Potrero ${i + 1}`,
        forage: "Brachiaria brizantha",
        points: ring,
      })),
    },
  });

  it("guarda revisiones, conserva el historial y lo entrega en la descarga", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const r1 = await push(cookie, orgA, [mapCmd(farmA, 0, 2)]);
    expect(r1.body.results[0]?.status).toBe("accepted");
    const r2 = await push(cookie, orgA, [mapCmd(farmA, 1, 3)]);
    expect(r2.body.results[0]?.status).toBe("accepted");

    const p = await pull(cookie, orgA);
    const maps = p.body.changes.filter((c) => c.entity === "farm_map");
    const last = maps[maps.length - 1];
    expect(last?.entity === "farm_map" && last.data.revision).toBe(2);
    expect(last?.entity === "farm_map" && last.data.paddocks).toHaveLength(3);

    const hist = await db.tenant(orgA, (q) =>
      q<{ revision: number }>(
        "SELECT revision FROM farm_map_revision WHERE farm_id = $1 ORDER BY revision",
        [farmA],
      ),
    );
    expect(hist.map((h) => h.revision)).toEqual([1, 2]);
  });

  it("marca conflicto si otro dispositivo guardó antes (revisión base vieja)", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const r = await push(cookie, orgA, [mapCmd(farmA, 1)]);
    expect(r.body.results[0]).toMatchObject({ status: "conflict", code: "MAPA_DESACTUALIZADO" });
  });

  it("un reenvío del mismo comando no crea otra revisión", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const c = mapCmd(farmA2, 0);
    const a = await push(cookie, orgA, [c]);
    const b = await push(cookie, orgA, [c]);
    expect(b.body.results[0]).toEqual(a.body.results[0]);
    const rev = await db.tenant(orgA, (q) =>
      q<{ revision: number }>("SELECT revision FROM farm_map WHERE farm_id = $1", [farmA2]),
    );
    expect(rev[0]?.revision).toBe(1);
  });

  it("el operario no puede editar el mapa", async () => {
    const op = await loginAs("operario-a@test.local");
    const r = await push(op, orgA, [mapCmd(farmA, 2)]);
    expect(r.body.results[0]).toMatchObject({ status: "rejected", code: "PERMISO_DENEGADO" });
  });

  it("no permite guardar el mapa de una finca de otra organización", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const r = await push(cookie, orgA, [mapCmd(farmB, 0)]);
    expect(r.body.results[0]?.status).toBe("rejected");
    const otra = await db.tenant(orgB, (q) =>
      q("SELECT 1 FROM farm_map WHERE farm_id = $1", [farmB]),
    );
    expect(otra).toHaveLength(0);
  });

  it("rechaza coordenadas fuera de rango", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const bad = mapCmd(farmA, 2);
    bad.payload.boundary = [
      [95, -75],
      [8, -75],
      [8, -74],
    ];
    const r = await push(cookie, orgA, [bad]);
    expect(r.body.results[0]).toMatchObject({ status: "rejected", code: "VALIDACION" });
  });

  it("el historial de revisiones no se puede modificar", async () => {
    await expect(
      db.admin((q) => q("UPDATE farm_map_revision SET revision = 99 WHERE farm_id = $1", [farmA])),
    ).rejects.toThrow();
  });
});

describe("ubicación aproximada", () => {
  const VERCEL = { "x-vercel-ip-latitude": "4.7110", "x-vercel-ip-longitude": "-74.0721" };

  it("exige sesión", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/geo/approx", headers: VERCEL });
    expect(res.statusCode).toBe(401);
  });

  it("devuelve la posición de las cabeceras de Vercel y 404 si faltan o no son válidas", async () => {
    await addUser("geo@a.test", orgA, "propietario");
    const cookie = await loginAs("geo@a.test");
    const get = (headers: Record<string, string>) =>
      app.inject({ method: "GET", url: "/v1/geo/approx", headers: { ...H, cookie, ...headers } });

    const ok = await get(VERCEL);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ lat: 4.711, lng: -74.0721 });
    expect((await get({})).statusCode).toBe(404);
    expect((await get({ ...VERCEL, "x-vercel-ip-latitude": "999" })).statusCode).toBe(404);
  });
});

describe("perfil de la finca", () => {
  const perfil = {
    speciesPresent: ["bovino", "bufalino"],
    productionFocus: "leche",
    productionSystem: "ciclo_completo",
    totalAreaHa: 64,
    livestockAreaHa: 48,
    areaUnit: "fanegada",
    latitude: 8.47,
    longitude: -75.73,
    speciesSettings: {
      bovino: { weaningMonths: 8, dryOffDays: 305 },
      bufalino: { weaningMonths: 7, dryOffDays: 270 },
    },
  };
  const send = (method: "POST" | "PUT", url: string, cookie: string, payload: unknown) =>
    app.inject({ method, url, headers: { ...H, cookie }, payload: payload as object });

  it("crea la finca con su perfil y lo publica en la sincronización", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const res = await send("POST", "/v1/farms", cookie, {
      organizationId: orgA,
      code: "PERFIL-1",
      name: "La Esperanza",
      ...perfil,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: "La Esperanza", ...perfil });
    const feed = await app.inject({
      method: "GET",
      url: `/v1/sync/pull?organizationId=${orgA}&since=0&limit=500`,
      headers: { ...H, cookie },
    });
    const change = (feed.json() as PullResponse).changes.find(
      (c) => c.entity === "farm" && c.data.code === "PERFIL-1",
    );
    expect(change?.data).toMatchObject({ livestockAreaHa: 48, areaUnit: "fanegada" });
  });

  it("rechaza área ganadera mayor que la total y ubicación incompleta", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const base = { organizationId: orgA, code: "MAL", name: "Mal", speciesPresent: ["bovino"] };
    const area = await send("POST", "/v1/farms", cookie, {
      ...base,
      totalAreaHa: 10,
      livestockAreaHa: 11,
    });
    expect(area.statusCode).toBe(400);
    expect((await send("POST", "/v1/farms", cookie, { ...base, latitude: 4 })).statusCode).toBe(
      400,
    );
  });

  it("edita el perfil; lo omitido queda vacío y solo se limita a especies presentes", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const res = await send("PUT", `/v1/farms/${farmA2}`, cookie, {
      organizationId: orgA,
      name: "Finca dos",
      speciesPresent: ["bovino"],
      totalAreaHa: 20,
      speciesSettings: perfil.speciesSettings,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: "Finca dos",
      totalAreaHa: 20,
      livestockAreaHa: null,
      latitude: null,
      speciesSettings: { bovino: perfil.speciesSettings.bovino },
    });
    expect(res.json().speciesSettings.bufalino).toBeUndefined();
  });

  it("no deja quitar una especie con animales activos", async () => {
    const cookie = await loginAs("dueno-a@test.local");
    const pushed = await push(cookie, orgA, [cmd(farmA, "PERFIL-BOV")]);
    expect(pushed.status).toBe(200);
    const res = await send("PUT", `/v1/farms/${farmA}`, cookie, {
      organizationId: orgA,
      name: "A1",
      speciesPresent: ["bufalino"],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("ESPECIE_CON_ANIMALES");
  });

  it("respeta permisos, finca asignada y organización", async () => {
    await addUser("operario-perfil@test.local", orgA, "operario");
    const body = { organizationId: orgA, name: "X", speciesPresent: ["bovino"] };
    const op = await loginAs("operario-perfil@test.local");
    expect((await send("PUT", `/v1/farms/${farmA}`, op, body)).statusCode).toBe(403);
    const soloFinca2 = await loginAs("solo-finca2@test.local");
    expect((await send("PUT", `/v1/farms/${farmA}`, soloFinca2, body)).statusCode).toBe(403);
    const dueno = await loginAs("dueno-a@test.local");
    expect((await send("PUT", `/v1/farms/${farmB}`, dueno, body)).statusCode).toBe(404);
  });
});
