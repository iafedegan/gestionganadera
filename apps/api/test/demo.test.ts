import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { type Db, createPgliteDb } from "../src/db.js";

const H = { "x-requested-with": "ganaderia" };

describe("cuentas de muestra", () => {
  let db: Db;
  let on: FastifyInstance;
  let off: FastifyInstance;

  beforeAll(async () => {
    db = await createPgliteDb();
    on = await buildApp({ db, demo: true });
    off = await buildApp({ db });
  }, 60_000);

  afterAll(async () => {
    await on.close();
    await off.close();
    await db.close();
  });

  const enter = (app: FastifyInstance, key: string) =>
    app.inject({ method: "POST", url: "/v1/demo/login", headers: H, payload: { key } });
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
    `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;

  it("está apagado si el servidor no lo habilita", async () => {
    expect((await off.inject({ method: "GET", url: "/v1/demo/users" })).statusCode).toBe(404);
    expect((await enter(off, "pequeno")).statusCode).toBe(404);
  });

  it("lista los perfiles y el Secretario Técnico sin datos sensibles", async () => {
    const res = await on.inject({ method: "GET", url: "/v1/demo/users" });
    expect(res.statusCode).toBe(200);
    const list = res.json() as { key: string; label: string; description: string }[];
    expect(list.map((u) => u.key)).toEqual([
      "rol_admin",
      "rol_mayordomo",
      "rol_veterinario",
      "rol_operario",
      "rol_tecnico",
      "sin_datos",
      "pequeno",
      "mediano",
      "grande",
      "completo",
      "vet_grande",
      "secretario",
    ]);
    // Ningún correo (el «@» de TECNIG@N es parte del nombre, no una dirección).
    expect(JSON.stringify(list)).not.toMatch(/[\w.-]+@[\w-]+\.[\w.]+/);
  });

  it("el Secretario Técnico de muestra entra sin ganadería y con su región", async () => {
    const res = await enter(on, "secretario");
    expect(res.statusCode).toBe(200);
    expect(res.json().memberships).toEqual([]);
    const cookie = `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
    const me = await on.inject({ url: "/v1/gremio/yo", headers: { cookie } });
    expect(me.json().staff).toMatchObject({
      tecnigan: "TECNIG@N de Córdoba",
      departments: ["Córdoba"],
    });
    // Entrar de nuevo no duplica la cuenta.
    expect((await enter(on, "secretario")).statusCode).toBe(200);
  });

  it("rechaza una cuenta que no existe", async () => {
    expect((await enter(on, "inventada")).statusCode).toBe(400);
  });

  it("la cuenta sin datos entra con el asistente inicial pendiente y vacía", async () => {
    const res = await enter(on, "sin_datos");
    expect(res.statusCode).toBe(200);
    expect(res.json().onboardingPending).toBe(true);
    const cookie = cookieOf(res);
    const orgId = res.json().memberships[0].organizationId as string;
    const farms = await on.inject({
      method: "GET",
      url: `/v1/farms?organizationId=${orgId}`,
      headers: { cookie },
    });
    expect(farms.json()).toEqual([]);
  });

  it("la cuenta pequeña trae fincas, animales y su perfil, y vuelve a entrar sin duplicar", async () => {
    const first = await enter(on, "pequeno");
    expect(first.statusCode).toBe(200);
    expect(first.json().onboardingPending).toBeFalsy();
    const orgId = first.json().memberships[0].organizationId as string;
    const cookie = cookieOf(first);

    const pull = await on.inject({
      method: "GET",
      url: `/v1/sync/pull?organizationId=${orgId}&since=0&limit=500`,
      headers: { cookie },
    });
    const body = pull.json() as { changes: { entity: string }[]; cursor: number; hasMore: boolean };
    const count = (e: string) => body.changes.filter((c) => c.entity === e).length;
    expect(count("farm")).toBe(1);
    expect(count("animal")).toBeGreaterThanOrEqual(20);
    expect(count("animal_event") + (body.hasMore ? 1 : 0)).toBeGreaterThan(0);

    const profile = await on.inject({
      method: "GET",
      url: `/v1/profile?organizationId=${orgId}`,
      headers: { cookie },
    });
    expect(profile.json().profile.focus).toBe("leche");

    const again = await enter(on, "pequeno");
    expect(again.json().memberships[0].organizationId).toBe(orgId);
    const rows = await db.admin((q) =>
      q<{ n: string }>(
        "SELECT count(*) AS n FROM app_user WHERE email = 'demo-pequeno@demo.ganaderia.local'",
      ),
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("la cuenta completa trae el lindero y los potreros de su primera finca", async () => {
    expect((await enter(on, "completo")).statusCode).toBe(200);
    const [m] = await db.admin((q) =>
      q<{ n: string }>(
        `SELECT count(DISTINCT fm.farm_id) AS n FROM farm_map fm JOIN farm f ON f.id = fm.farm_id
          JOIN membership ms ON ms.organization_id = f.organization_id
          JOIN app_user u ON u.id = ms.user_id WHERE u.email LIKE 'demo-completo%'`,
      ),
    );
    expect(Number(m?.n)).toBe(1);
  });

  it("la veterinaria de «Ganadero grande» entra a esa ganadería", async () => {
    const vet = (await enter(on, "vet_grande")).json();
    const owner = (await enter(on, "grande")).json();
    expect(vet.memberships).toHaveLength(1);
    expect(vet.memberships[0].role).toBe("veterinario");
    expect(vet.memberships[0].organizationId).toBe(owner.memberships[0].organizationId);

    // El aviso que se envía en esa ganadería le llega a ella y puede confirmarlo.
    const organizationId = owner.memberships[0].organizationId;
    const sent = await on.inject({
      method: "POST",
      url: "/v1/urgencias",
      headers: { ...H, cookie: cookieOf(await enter(on, "grande")) },
      payload: { organizationId, reason: "sangrado", message: "Sangra mucho" },
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const inbox = await on.inject({
      url: `/v1/urgencias?organizationId=${organizationId}`,
      headers: { ...H, cookie: cookieOf(await enter(on, "vet_grande")) },
    });
    expect(inbox.json().items).toMatchObject([{ canAck: true }]);

    // Si alguien le quitó el acceso en la muestra, al volver a entrar lo recupera.
    await db.admin((q) =>
      q("UPDATE membership SET valid_until = now() WHERE user_id = $1", [vet.userId]),
    );
    expect((await enter(on, "vet_grande")).json().memberships).toHaveLength(1);
  });

  it("cada perfil por rol entra a la ganadería completa con su rol, sin duplicarse", async () => {
    const roles = {
      rol_admin: "admin_entidad",
      rol_mayordomo: "mayordomo",
      rol_veterinario: "veterinario",
      rol_operario: "operario",
      rol_tecnico: "tecnico",
    };
    const orgs = new Set<string>();
    for (const [key, role] of Object.entries(roles)) {
      const res = await enter(on, key);
      expect(res.statusCode).toBe(200);
      const m = res.json().memberships;
      expect(m).toHaveLength(1);
      expect(m[0].role).toBe(role);
      orgs.add(m[0].organizationId);
      expect((await enter(on, key)).json().memberships).toHaveLength(1);
    }
    expect(orgs.size).toBe(1);
  });

  it("el dueño ve los veterinarios registrados y agrega uno a su equipo", async () => {
    await enter(on, "rol_veterinario");
    const owner = await enter(on, "grande");
    const organizationId = owner.json().memberships[0].organizationId;
    const cookie = cookieOf(owner);
    const list = async () =>
      (
        await on.inject({
          url: `/v1/team/veterinarios?organizationId=${organizationId}`,
          headers: { ...H, cookie },
        })
      ).json().items as { userId: string; displayName: string; inTeam: boolean }[];
    const valeria = (await list()).find((v) => v.displayName.startsWith("Valeria"));
    expect(valeria?.inTeam).toBe(false);
    expect(JSON.stringify(await list())).not.toContain("@");
    const add = () =>
      on.inject({
        method: "POST",
        url: "/v1/team/veterinarios",
        headers: { ...H, cookie },
        payload: { organizationId, userId: valeria?.userId },
      });
    expect((await add()).statusCode).toBe(201);
    expect((await add()).statusCode).toBe(400);
    expect((await list()).find((v) => v.userId === valeria?.userId)?.inTeam).toBe(true);
    expect((await enter(on, "rol_veterinario")).json().memberships).toHaveLength(2);
    // Un operario no puede consultar la lista.
    const other = await enter(on, "rol_operario");
    const denied = await on.inject({
      url: `/v1/team/veterinarios?organizationId=${other.json().memberships[0].organizationId}`,
      headers: { ...H, cookie: cookieOf(other) },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("nadie puede iniciar sesión con contraseña en una cuenta de muestra", async () => {
    await enter(on, "pequeno");
    for (const password of ["demo", "demo-pequeno", "123456", "Password1"]) {
      const res = await on.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: H,
        payload: { email: "demo-pequeno@demo.ganaderia.local", password },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it("cada cuenta ve solo lo suyo", async () => {
    const a = await enter(on, "pequeno");
    const b = await enter(on, "sin_datos");
    const orgB = b.json().memberships[0].organizationId as string;
    const res = await on.inject({
      method: "GET",
      url: `/v1/farms?organizationId=${orgB}`,
      headers: { cookie: cookieOf(a) },
    });
    expect(res.statusCode).toBe(403);
  });
});
