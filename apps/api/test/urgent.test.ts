import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const H = { "x-requested-with": "ganaderia" };
const PASSWORD = "clave-de-prueba-123";
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
const list = async (cookie: string) =>
  (
    await app.inject({ url: `/v1/urgencias?organizationId=${org}`, headers: { ...H, cookie } })
  ).json().items;

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db });
  const hash = await hashPassword(PASSWORD);
  org = await db.admin(async (q) => {
    const [o] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Urgencias') RETURNING id",
    );
    for (const [email, role] of [
      ["operario@u.local", "operario"],
      ["vet@u.local", "veterinario"],
      ["otro@u.local", "operario"],
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

describe("avisos urgentes al veterinario", () => {
  it("con el animal, envía su hoja de vida y trazabilidad", async () => {
    const [ids] = await db.admin(async (q) => {
      const [u] = await q<{ id: string }>("SELECT id FROM app_user WHERE email = 'vet@u.local'");
      const [f] = await q<{ id: string }>(
        "INSERT INTO farm (organization_id, code, name, species_present) VALUES ($1,'F','La Prueba',ARRAY['bovino']) RETURNING id",
        [org],
      );
      const rows = await q<{ id: string }>(
        `INSERT INTO animal (id, organization_id, farm_id, tag, species, sex, category, created_by)
         VALUES (gen_random_uuid(),$1,$2,'PR-1','bovino','hembra','vaca',$3) RETURNING id`,
        [org, f?.id, u?.id],
      );
      await q(
        `INSERT INTO animal_event (organization_id, farm_id, animal_id, type, occurred_on, tz, user_id, source, payload)
         VALUES ($1,$2,$3,'salud','2026-01-10','America/Bogota',$4,'prueba','{"kind":"Control","product":"Revisión"}')`,
        [org, f?.id, rows[0]?.id, u?.id],
      );
      return rows;
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/urgencias",
      headers: { ...H, cookie: await login("otro@u.local") },
      payload: { organizationId: org, animalId: ids?.id, reason: "sangrado", message: "Sangra" },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      farmName: "La Prueba",
      animal: { tag: "PR-1", events: [{ type: "salud", occurredOn: "2026-01-10" }] },
    });
    await db.admin((q) => q("DELETE FROM urgent_alert"));
  });

  it("llega al veterinario, no se duplica y quien reporta ve la confirmación", async () => {
    const op = await login("operario@u.local");
    const send = () =>
      app.inject({
        method: "POST",
        url: "/v1/urgencias",
        headers: { ...H, cookie: op },
        payload: { organizationId: org, reason: "animal caído", message: "La vaca no se para" },
      });
    const first = await send();
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().recipients).toMatchObject([{ name: "vet@u.local" }]);
    expect((await send()).json().id).toBe(first.json().id);

    const vet = await login("vet@u.local");
    expect(await list(vet)).toMatchObject([{ canAck: true, mine: false, ackBy: null }]);
    expect(await list(await login("otro@u.local"))).toHaveLength(0);

    const ackUrl = `/v1/urgencias/${first.json().id}/atender`;
    const denied = await app.inject({ method: "POST", url: ackUrl, headers: { ...H, cookie: op } });
    expect(denied.statusCode).toBe(403);
    const ok = await app.inject({ method: "POST", url: ackUrl, headers: { ...H, cookie: vet } });
    expect(ok.statusCode).toBe(200);
    expect(await list(op)).toMatchObject([{ mine: true, ackBy: "vet@u.local" }]);

    // Chat: texto y foto entre los dos; nadie más puede leerlo.
    const chat = `/v1/urgencias/${first.json().id}/mensajes`;
    const say = (cookie: string, payload: object) =>
      app.inject({ method: "POST", url: chat, headers: { ...H, cookie }, payload });
    expect((await say(op, { body: "Mire la foto" })).statusCode).toBe(201);
    const photo = Buffer.from("foto-de-prueba").toString("base64");
    expect((await say(vet, { media: { type: "image/jpeg", data: photo } })).statusCode).toBe(201);
    expect((await say(vet, { media: { type: "text/html", data: photo } })).statusCode).toBe(400);
    const msgs = (await app.inject({ url: chat, headers: { ...H, cookie: op } })).json().items;
    expect(msgs).toMatchObject([
      { body: "Mire la foto", mine: true },
      { mediaType: "image/jpeg", mine: false },
    ]);
    expect(await list(op)).toMatchObject([{ lastMessage: { mine: false, preview: "Foto" } }]);
    const file = `${chat}/${msgs[1].id}/archivo`;
    const got = await app.inject({ url: file, headers: { cookie: op, range: "bytes=0-3" } });
    expect(got.statusCode).toBe(206);
    expect(got.body).toBe("foto");
    const other = await login("otro@u.local");
    expect((await app.inject({ url: file, headers: { cookie: other } })).statusCode).toBe(403);
    expect((await say(other, { body: "hola" })).statusCode).toBe(403);
  });
});

describe("una urgencia por animal y chat desde el aviso", () => {
  it("dos avisos del mismo animal se juntan, el chat abre ya y llega en «mias»", async () => {
    await db.admin((q) => q("DELETE FROM urgent_alert"));
    const [a] = await db.admin((q) =>
      q<{ id: string }>("SELECT id FROM animal WHERE tag = 'PR-1' AND organization_id = $1", [org]),
    );
    const op = await login("operario@u.local");
    const otro = await login("otro@u.local");
    const send = (cookie: string, message: string) =>
      app.inject({
        method: "POST",
        url: "/v1/urgencias",
        headers: { ...H, cookie },
        payload: { organizationId: org, animalId: a?.id, reason: "cojera", message },
      });
    const first = (await send(op, "Cojea")).json();
    const again = (await send(otro, "Ya no se para")).json();
    expect(again.id).toBe(first.id);
    expect(again.messageCount).toBe(1);
    // Quien se sumó al aviso también ve la conversación.
    expect(await list(otro)).toMatchObject([{ id: first.id, mine: true }]);

    // Antes de confirmar ya se puede mandar la foto.
    const chat = `/v1/urgencias/${first.id}/mensajes`;
    const pre = await app.inject({
      method: "POST",
      url: chat,
      headers: { ...H, cookie: op },
      payload: { body: "Le mando foto" },
    });
    expect(pre.statusCode).toBe(201);

    const vet = await login("vet@u.local");
    const mias = (
      await app.inject({ url: "/v1/urgencias/mias", headers: { ...H, cookie: vet } })
    ).json();
    expect(mias.organizations).toEqual([org]);
    expect(mias.items).toMatchObject([
      { id: first.id, organizationName: "Urgencias", messageCount: 2, ackBy: null },
    ]);
  });
});
