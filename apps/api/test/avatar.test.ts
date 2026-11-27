import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

const H = { "x-requested-with": "ganaderia" };
const PASSWORD = "clave-de-prueba-123";
const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
let db: Db;
let app: FastifyInstance;

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}
const put = (cookie: string, image: string | null) =>
  app.inject({
    method: "PUT",
    url: "/v1/me/avatar",
    headers: { ...H, cookie },
    payload: { image },
  });

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db });
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    for (const email of ["ana@foto.local", "demo-x@demo.ganaderia.local"])
      await q("INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$1,$2)", [
        email,
        hash,
      ]);
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("foto de perfil", () => {
  it("se guarda, vuelve en la sesión y se puede quitar", async () => {
    const cookie = await login("ana@foto.local");
    const res = await put(cookie, FOTO);
    expect(res.statusCode, res.body).toBe(200);
    const me = await app.inject({ url: "/v1/auth/me", headers: { ...H, cookie } });
    expect(me.json().avatar).toBe(FOTO);
    expect((await put(cookie, null)).json().avatar).toBeUndefined();
  });

  it("rechaza lo que no es una imagen pequeña y no guarda fotos de las cuentas de muestra", async () => {
    const cookie = await login("ana@foto.local");
    expect((await put(cookie, "data:text/html;base64,PGI+")).statusCode).toBe(400);
    expect((await put(cookie, "https://ejemplo.com/a.jpg")).statusCode).toBe(400);
    expect((await put(cookie, `data:image/png;base64,${"A".repeat(200_001)}`)).statusCode).toBe(
      400,
    );
    expect((await put(await login("demo-x@demo.ganaderia.local"), FOTO)).statusCode).toBe(403);
  });
});
