import { deflateSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AskFn } from "../src/assistant.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";
import { type Pt, decodePng, forestLoss, inside, ringAreaHa } from "../src/forestLoss.js";

/** PNG RGBA de 8 bits; cada fila usa el filtro indicado (0 a 4) para probar el decodificador. */
function png(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[],
  filter = (_y: number) => 0,
) {
  const stride = width * 4;
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) row.push(...pixel(x, y));
    rows.push(row);
  }
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const f = filter(y);
    raw.push(f);
    const prev = y > 0 ? (rows[y - 1] as number[]) : new Array(stride).fill(0);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? (row[i - 4] as number) : 0;
      const b = prev[i] as number;
      const c = i >= 4 ? (prev[i - 4] as number) : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f] as number;
      raw.push(((row[i] as number) - pred + 256) & 255);
    }
  });
  const chunk = (type: string, data: Uint8Array) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", new Uint8Array()),
  ]);
}

describe("lectura de la capa de bosque", () => {
  it("decodifica PNG RGBA con los cinco filtros", () => {
    const px = (x: number, y: number) => [x * 10, y * 20, (x + y) % 256, x === y ? 255 : 0];
    const img = decodePng(png(6, 5, px, (y) => y % 5));
    expect([img.width, img.height]).toEqual([6, 5]);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 6; x++)
        expect([...img.data.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 4)]).toEqual(px(x, y));
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("geometría: punto dentro del lindero y área en hectáreas", () => {
    const sq: Pt[] = [
      [8.7, -75.9],
      [8.7, -75.89],
      [8.71, -75.89],
      [8.71, -75.9],
    ];
    expect(inside(8.705, -75.895, sq)).toBe(true);
    expect(inside(8.72, -75.895, sq)).toBe(false);
    // ~1,1 km por lado: unas 121 ha.
    expect(ringAreaHa(sq)).toBeGreaterThan(118);
    expect(ringAreaHa(sq)).toBeLessThan(124);
  });

  it("cuenta la pérdida por año dentro del lindero y separa la anterior al corte de 2020", async () => {
    // Columnas pares: pérdida de 2022 (la mitad); columnas impares cada cuarta fila: 2015 (un octavo).
    const tile = png(512, 512, (x, y) =>
      x % 2 === 0 ? [255, 0, 22, 255] : y % 4 === 0 ? [255, 0, 15, 255] : [0, 0, 0, 0],
    );
    const fake = (async () => {
      const res = new Response(tile, { status: 200 });
      Object.defineProperty(res, "url", {
        value: "https://tiles.x/umd_tree_cover_loss/v1.13/dynamic/12/1/1.png",
      });
      return res;
    }) as unknown as typeof fetch;
    const box: Pt[] = [
      [8.74, -75.89],
      [8.74, -75.87],
      [8.76, -75.87],
      [8.76, -75.89],
    ];
    const r = await forestLoss(box, { fetch: fake, now: () => new Date("2026-11-26T00:00:00Z") });
    expect(r.version).toBe("v1.13");
    expect(Object.keys(r.byYear)).toEqual(["2022"]);
    expect(r.lossAfterCutoffHa).toBeGreaterThan(0);
    expect(r.lossBeforeCutoffHa).toBeGreaterThan(0);
    expect(r.lossAfterCutoffHa / r.areaHa).toBeGreaterThan(0.45);
    expect(r.lossAfterCutoffHa / r.areaHa).toBeLessThan(0.55);
    expect(r.lossBeforeCutoffHa / r.areaHa).toBeGreaterThan(0.1);
    expect(r.lossBeforeCutoffHa / r.areaHa).toBeLessThan(0.15);
    expect(r.zoom).toBe(12);
  });
});

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };
const ask: AskFn = async () => ({ text: "", inputTokens: 0, outputTokens: 0, refused: false });
let db: Db;
let app: FastifyInstance;
let down: FastifyInstance;
let cookieA = "";
let cookieB = "";
const ids: Record<string, string> = {};
const clean = png(512, 512, () => [0, 0, 0, 0]);

async function login(target: FastifyInstance, email: string) {
  const res = await target.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}

beforeAll(async () => {
  db = await createPgliteDb();
  const ok = (async () => new Response(clean, { status: 200 })) as unknown as typeof fetch;
  const broken = (async () => new Response("caída", { status: 503 })) as unknown as typeof fetch;
  app = await buildApp({ db, ask, ecosistema: null, forestFetch: ok });
  down = await buildApp({ db, ask, ecosistema: null, forestFetch: broken });
  const orgs = await db.admin((q) =>
    q<{ id: string }>(
      "INSERT INTO organization (name, department) VALUES ('Hato A','Córdoba'),('Hato B','Meta') RETURNING id",
    ),
  );
  ids.orgA = orgs[0]?.id as string;
  ids.orgB = orgs[1]?.id as string;
  const [f] = await db.admin((q) =>
    q<{ id: string }>(
      "INSERT INTO farm (organization_id, code, name, species_present) VALUES ($1,'F1','El Roble',ARRAY['bovino']) RETURNING id",
      [ids.orgA],
    ),
  );
  ids.farm = f?.id as string;
  const hash = await hashPassword(PASSWORD);
  for (const [email, org] of [
    ["a@bosque.local", ids.orgA],
    ["b@bosque.local", ids.orgB],
  ] as const) {
    await db.admin(async (q) => {
      const [u] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,'Persona',$2) RETURNING id",
        [email, hash],
      );
      await q(
        "INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,'propietario')",
        [u?.id, org],
      );
    });
  }
  cookieA = await login(app, "a@bosque.local");
  cookieB = await login(app, "b@bosque.local");
});

afterAll(async () => {
  await app.close();
  await down.close();
  await db.close();
});

describe("rutas de trazabilidad", () => {
  const boundary = [
    [8.74, -75.89],
    [8.74, -75.88],
    [8.75, -75.88],
    [8.75, -75.89],
  ];

  it("revisa el lindero, guarda el soporte y lo devuelve como última revisión", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/trazabilidad/bosque",
      headers: { cookie: cookieA, ...H },
      payload: { organizationId: ids.orgA, farmId: ids.farm, boundary },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ farmId: ids.farm, lossAfterCutoffHa: 0, byYear: {} });
    expect(res.json().areaHa).toBeGreaterThan(100);
    const list = await app.inject({
      url: `/v1/trazabilidad?organizationId=${ids.orgA}`,
      headers: { cookie: cookieA, ...H },
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].boundary).toEqual(boundary);
  });

  it("no deja revisar fincas ajenas ni linderos fuera de Colombia", async () => {
    const other = await app.inject({
      method: "POST",
      url: "/v1/trazabilidad/bosque",
      headers: { cookie: cookieB, ...H },
      payload: { organizationId: ids.orgA, farmId: ids.farm, boundary },
    });
    expect(other.statusCode).toBe(403);
    const abroad = await app.inject({
      method: "POST",
      url: "/v1/trazabilidad/bosque",
      headers: { cookie: cookieA, ...H },
      payload: {
        organizationId: ids.orgA,
        farmId: ids.farm,
        boundary: [
          [40, -3],
          [40, -2.9],
          [40.1, -2.9],
        ],
      },
    });
    expect(abroad.statusCode).toBe(400);
    const list = await app.inject({
      url: `/v1/trazabilidad?organizationId=${ids.orgA}`,
      headers: { cookie: cookieB, ...H },
    });
    expect(list.statusCode).toBe(403);
  });

  it("si la fuente no responde lo dice y no guarda nada", async () => {
    const c = await login(down, "a@bosque.local");
    const res = await down.inject({
      method: "POST",
      url: "/v1/trazabilidad/bosque",
      headers: { cookie: c, ...H },
      payload: { organizationId: ids.orgA, farmId: ids.farm, boundary },
    });
    expect(res.statusCode).toBe(502);
    const [n] = await db.admin((q) => q<{ n: string }>("SELECT count(*) AS n FROM forest_check"));
    expect(Number(n?.n)).toBe(1);
  });
});
