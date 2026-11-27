import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const H = { "x-requested-with": "ganaderia" };
const PASSWORD = "clave-de-prueba-123";
let db: Db;
let app: FastifyInstance;
const ids: Record<string, string> = {};

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
  app = await buildApp({ db });
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    const org = async (name: string) =>
      (
        await q<{ id: string }>("INSERT INTO organization (name) VALUES ($1) RETURNING id", [name])
      )[0]?.id;
    const a = await org("Chats");
    const b = await org("Ajena");
    for (const [email, role, o] of [
      ["dueno@c.local", "propietario", a],
      ["vet@c.local", "veterinario", a],
      ["extrano@c.local", "veterinario", b],
    ]) {
      const [u] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$1,$2) RETURNING id",
        [email, hash],
      );
      ids[email as string] = u?.id as string;
      await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
        u?.id,
        o,
        role,
      ]);
    }
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("chats del equipo", () => {
  it("dos personas del mismo equipo conversan; un extraño no", async () => {
    const owner = await login("dueno@c.local");
    const vet = await login("vet@c.local");
    const out = await login("extrano@c.local");
    const get = (cookie: string, url: string) => app.inject({ url, headers: { ...H, cookie } });
    const contacts = async (c: string) => (await get(c, "/v1/chats")).json().items;
    expect(await contacts(owner)).toMatchObject([
      { name: "vet@c.local", role: "veterinario", unread: 0, lastMessage: null },
    ]);
    const url = (to: string) => `/v1/chats/${ids[to]}/mensajes`;
    const say = (cookie: string, to: string, payload: object) =>
      app.inject({ method: "POST", url: url(to), headers: { ...H, cookie }, payload });
    expect((await say(owner, "vet@c.local", { body: "Buenos días" })).statusCode).toBe(201);
    const photo = Buffer.from("foto-de-prueba").toString("base64");
    await say(owner, "vet@c.local", { media: { type: "image/jpeg", data: photo } });
    expect(await contacts(vet)).toMatchObject([
      { unread: 2, lastMessage: { mine: false, preview: "Foto" } },
    ]);
    const msgs = (await get(vet, url("dueno@c.local"))).json().items;
    expect(msgs).toMatchObject([{ body: "Buenos días", mine: false }, { mediaType: "image/jpeg" }]);
    expect(await contacts(vet)).toMatchObject([{ unread: 0 }]);
    const file = await get(vet, `${url("dueno@c.local")}/${msgs[1].id}/archivo`);
    expect(file.body).toBe("foto-de-prueba");

    expect((await say(out, "dueno@c.local", { body: "hola" })).statusCode).toBe(403);
    expect((await get(out, url("vet@c.local"))).statusCode).toBe(403);
    // Quien sale del equipo pierde la conversación.
    await db.admin((q) =>
      q("UPDATE membership SET valid_until = now() WHERE user_id = $1", [ids["vet@c.local"]]),
    );
    expect((await get(owner, url("vet@c.local"))).statusCode).toBe(403);
  });
});
