import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
const H = { "x-requested-with": "ganaderia" };

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask: null });
  const hash = await hashPassword("clave-de-prueba-123");
  await db.admin(async (q) => {
    const [o] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('R') RETURNING id",
    );
    const [u] = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ('r@x.local','R',$1) RETURNING id",
      [hash],
    );
    await q(
      "INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,'propietario')",
      [u?.id, o?.id],
    );
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

const loginAs = (remember?: boolean) =>
  app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email: "r@x.local", password: "clave-de-prueba-123", remember },
  });

describe("sesión recordada en la app instalada", () => {
  it("dura 12 horas en el navegador y 30 días en la app instalada", async () => {
    const normal = await loginAs();
    expect(normal.cookies.find((c) => c.name === "sid")?.maxAge).toBe(12 * 3600);
    const kept = await loginAs(true);
    expect(kept.cookies.find((c) => c.name === "sid")?.maxAge).toBe(30 * 24 * 3600);
    const [row] = await db.admin((q) =>
      q<{ h: number }>(
        "SELECT round(extract(epoch FROM (expires_at - now())) / 3600)::int AS h FROM session ORDER BY expires_at DESC LIMIT 1",
      ),
    );
    expect(row?.h).toBeGreaterThan(700);
  });
});
