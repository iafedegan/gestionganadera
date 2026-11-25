import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AskFn } from "../src/assistant.js";
import { hashPassword } from "../src/auth.js";
import { type Db, createPgliteDb } from "../src/db.js";
import {
  type Ecosistema,
  createEcosistema,
  parseCourseDetail,
  parseCoursePage,
  parseCourseSlugs,
  parseRss,
  parseShopPage,
  parseStoreHits,
} from "../src/ecosistema.js";

const PASSWORD = "clave-de-prueba-123";
const H = { "x-requested-with": "ganaderia" };

/* ───────────── Lectura de las fuentes ───────────── */

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Precio del ganado &amp; la leche</title>
<link>https://www.contextoganadero.com/articulo/precio?utm_source=rss&amp;utm_medium=feed</link>
<description><![CDATA[<p>Resumen con <b>negrita</b></p>]]></description>
<pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate><category>Economía</category>
<content:encoded><![CDATA[<p><img src="https://cdn.example/foto.jpg"/></p>]]></content:encoded></item>
<item><title>Enlace peligroso</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe("lectura de fuentes del ecosistema", () => {
  it("lee el RSS de CONtexto: limpia el texto, quita utm y descarta enlaces no http", () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Precio del ganado & la leche",
      url: "https://www.contextoganadero.com/articulo/precio",
      summary: "Resumen con negrita",
      image: "https://cdn.example/foto.jpg",
      category: "Economía",
      publishedAt: "2026-11-24T10:00:00.000Z",
    });
  });

  it("toma los cursos de la Escuela Virtual sin las páginas de cuenta", () => {
    const html =
      '<a href="/escuela-virtual/salud-animal"></a><a href="/escuela-virtual/carnet"></a><a href="/escuela-virtual/salud-animal"></a><a href="/escuela-virtual/bufalos"></a>';
    expect(parseCourseSlugs(html)).toEqual(["salud-animal", "bufalos"]);
    expect(
      parseCoursePage(
        '<title>Salud Animal · Escuela Virtual FEDEGÁN</title><meta name="description" content="Enfermedades y manejo"',
      ),
    ).toEqual({ title: "Salud Animal", summary: "Enfermedades y manejo" });
  });

  it("lee la ficha de un curso: nivel, lecciones, instructor, qué se aprende y temario", () => {
    const html = `<img src="/_next/image?url=%2Fcursos%2Fcurso-01.jpg&amp;w=1920">
      <ul><li><svg><path/></svg> Básico</li><li>9<!-- --> <!-- -->lecciones</li><li>1 h 9 min</li></ul>
      <p>Instructor: <b>M.V. Ana Pérez</b></p>
      <h2>Lo que aprenderá</h2><ul><li>Pastos</li><li>Sanidad</li></ul>
      <h2>Contenido del curso</h2><p>1 módulos · 2 lecciones · 15 min</p>
      <div><span>01</span><h3>Bloque uno</h3><span>2 lecciones</span>
        <ul><li>Introducción</li><li>Vista previa</li><li>8 min</li><li>Cierre</li><li>7 min</li></ul></div>
      <h2>Descripción</h2><p>Curso de prueba.</p><h2>Instructor</h2><p>Ana</p>`;
    expect(parseCourseDetail(html, "https://escuela.co")).toEqual({
      image: "https://escuela.co/cursos/curso-01.jpg",
      level: "Básico",
      lessonCount: 9,
      duration: "1 h 9 min",
      instructor: "M.V. Ana Pérez",
      outcomes: ["Pastos", "Sanidad"],
      modules: [
        {
          title: "Bloque uno",
          lessons: [
            { title: "Introducción", duration: "8 min", preview: true },
            { title: "Cierre", duration: "7 min", preview: false },
          ],
        },
      ],
      description: "Curso de prueba.",
    });
    expect(parseCourseDetail("<p>sin datos</p>", "https://escuela.co")).toEqual({});
  });

  it("convierte los resultados de TvGan en productos con enlace y precio", () => {
    const [p] = parseStoreHits("https://www.tvgan.com.co", [
      {
        name: "Jeringa automática 50 ml",
        website_url: "/shop/jeringa-6845",
        image_url: "/web/image/product.template/6845/image_128",
        detail: '$ <span class="oe_currency_value">282.743,80</span>',
        extra_link:
          '<button disabled>Categorías</button><button onclick="x">JERINGAS DESECHABLES</button><button onclick="y">OFERTAS</button>',
      },
    ]);
    expect(p).toEqual({
      name: "Jeringa automática 50 ml",
      url: "https://www.tvgan.com.co/shop/jeringa-6845",
      image: "https://www.tvgan.com.co/web/image/product.template/6845/image_256",
      price: "$ 282.743,80",
      category: "JERINGAS DESECHABLES",
    });
  });

  it("lee las tarjetas del listado de TvGan con precio, foto, cinta y páginas", () => {
    const card = (id: number, name: string, price: string, ribbon = "") => `
      <form role="article" class="oe_product_cart h-100 d-flex " aria-label="${name}">
        <a href="/shop/p-${id}" class="oe_product_image_link"><span><img src="/web/image/product.product/${id}/image_1024/x?unique=1" class="img oe_product_image_img h-100"/></span>
        ${ribbon ? `<span data-ribbon-id="30" class="o_ribbons o_wsale_badge" style="x">${ribbon}</span>` : ""}</a>
        <div class="product_price" aria-label="Precio"><span>$ <span class="oe_currency_value">${price}</span></span></div>
      </form>`;
    const html = `${card(1, "CERCA 50 KM", "507.055,10", "PROMOCIÓN")}${card(2, "SEMILLA &amp; MÁS", "18.909,30")}
      <a href="/shop/page/2">2</a><a href="/shop/page/7">7</a>`;
    const r = parseShopPage(html, "https://www.tvgan.com.co");
    expect(r.lastPage).toBe(7);
    expect(r.items).toEqual([
      {
        name: "CERCA 50 KM",
        url: "https://www.tvgan.com.co/shop/p-1",
        image: "https://www.tvgan.com.co/web/image/product.product/1/image_512/x?unique=1",
        price: "$ 507.055,10",
        category: null,
        badge: "PROMOCIÓN",
      },
      {
        name: "SEMILLA & MÁS",
        url: "https://www.tvgan.com.co/shop/p-2",
        image: "https://www.tvgan.com.co/web/image/product.product/2/image_512/x?unique=1",
        price: "$ 18.909,30",
        category: null,
        badge: null,
      },
    ]);
  });

  it("trae todas las páginas del catálogo y deja fuera las categorías vacías", async () => {
    const card = (id: number) =>
      `<form class="oe_product_cart x" aria-label="P${id}"><a href="/shop/p-${id}"></a></form>`;
    const pageHtml = (ids: number[], last: number) =>
      `${ids.map(card).join("")}<a href="/shop/page/${last}"></a>`;
    const urls: string[] = [];
    const eco = createEcosistema({
      tvganUrl: "https://t.co",
      fetch: (async (u: string) => {
        urls.push(u);
        if (u === "https://t.co/shop") return new Response(pageHtml([1, 2], 3));
        if (u === "https://t.co/shop/page/2") return new Response(pageHtml([3, 2], 3));
        if (u === "https://t.co/shop/page/3") return new Response(pageHtml([4], 3));
        if (u.includes("/cercas-132")) return new Response(pageHtml([9], 1));
        return new Response("no", { status: 404 });
      }) as typeof fetch,
    });
    const all = await eco.storeCatalog();
    expect(all.items.map((p) => p.name)).toEqual(["P1", "P2", "P3", "P4"]);
    const cats = await eco.storeCategories();
    expect(cats).toEqual([
      { key: "cercas", label: "Cercas", url: "https://t.co/shop/category/cercas-132", count: 1 },
    ]);
    const cercas = await eco.storeCatalog("cercas");
    expect(cercas.items[0]?.category).toBe("Cercas");
    await expect(eco.storeCatalog("inventada")).rejects.toThrow();
  });

  it("guarda en memoria y sirve lo último bueno si la fuente falla", async () => {
    let calls = 0;
    let fail = false;
    let t = 0;
    const eco = createEcosistema({
      now: () => t,
      fetch: (async () => {
        calls++;
        if (fail) throw new Error("sin red");
        return new Response(RSS, { status: 200 });
      }) as typeof fetch,
    });
    expect(await eco.news()).toHaveLength(1);
    expect(await eco.news()).toHaveLength(1);
    expect(calls).toBe(1);
    t += 60 * 60_000;
    fail = true;
    expect(await eco.news()).toHaveLength(1);
    expect(calls).toBe(2);
  });
});

/* ───────────── Rutas de la API ───────────── */

let db: Db;
let app: FastifyInstance;
let off: FastifyInstance;
let cookieA: string;
let cookieB: string;
const prompts: string[] = [];

const fakeEco: Ecosistema = {
  news: async () => [
    {
      title: "Nota",
      url: "https://x.co/n",
      summary: "",
      image: null,
      publishedAt: null,
      category: null,
    },
  ],
  courses: async () => [
    { slug: "salud-animal", title: "Salud animal", summary: "", url: "https://x.co/c" },
  ],
  storeSearch: async (q) => ({ items: [], total: 0, moreUrl: `https://x.co/shop?search=${q}` }),
  storeCategories: async () => [
    { key: "cercas", label: "Cercas", url: "https://x.co/m", count: 2 },
  ],
  storeCatalog: async (c) => ({
    items: [
      {
        name: "Cerca 50 km",
        url: "https://x.co/p",
        image: null,
        price: "$ 1",
        category: c ?? null,
      },
    ],
    category: c ?? null,
    url: "https://x.co/shop",
    updatedAt: "2026-11-24T00:00:00.000Z",
  }),
  knowledge: async () => [
    {
      n: 1,
      title: "Cómo controlar la garrapata",
      url: "https://x.co/g",
      kind: "articulo",
      summary: "Baños y rotación.",
    },
    { n: 2, title: "Otra nota", url: "https://x.co/o", kind: "archivo", summary: "" },
  ],
};

const fakeAsk: AskFn = async ({ messages }) => {
  prompts.push(String(messages.at(-1)?.content ?? ""));
  return { text: "Rote los potreros [1].", inputTokens: 1, outputTokens: 1, refused: false };
};

async function addUser(email: string, name: string, orgId: string) {
  const hash = await hashPassword(PASSWORD);
  await db.admin(async (q) => {
    const [u] = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
      [email, name, hash],
    );
    await q(
      "INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,'propietario')",
      [u?.id, orgId],
    );
  });
}

async function login(target: FastifyInstance, email: string) {
  const res = await target.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: H,
    payload: { email, password: PASSWORD },
  });
  return `sid=${res.cookies.find((c) => c.name === "sid")?.value}`;
}

let orgA = "";

beforeAll(async () => {
  db = await createPgliteDb();
  app = await buildApp({ db, ask: fakeAsk, ecosistema: fakeEco });
  off = await buildApp({ db, ask: fakeAsk, ecosistema: null });
  const [a, b] = await db.admin(async (q) => [
    ...(await q<{ id: string }>(
      "INSERT INTO organization (name, department) VALUES ('Hato A', 'Córdoba'), ('Hato B', NULL) RETURNING id",
    )),
  ]);
  orgA = a?.id as string;
  await addUser("ana@comunidad.local", "Ana María Pérez", orgA);
  await addUser("beto@comunidad.local", "Beto", b?.id as string);
  for (let i = 0; i < 3; i++)
    await addUser(`r${i}@comunidad.local`, `Reportero ${i}`, b?.id as string);
  cookieA = await login(app, "ana@comunidad.local");
  cookieB = await login(app, "beto@comunidad.local");
});

afterAll(async () => {
  await app.close();
  await off.close();
  await db.close();
});

describe("rutas del ecosistema", () => {
  it("exigen sesión y responden con el conector", async () => {
    expect((await app.inject({ url: "/v1/ecosistema/noticias" })).statusCode).toBe(401);
    const res = await app.inject({ url: "/v1/ecosistema/noticias", headers: { cookie: cookieA } });
    expect(res.json().items[0].title).toBe("Nota");
    const cursos = await app.inject({ url: "/v1/ecosistema/cursos", headers: { cookie: cookieA } });
    expect(cursos.json().items).toHaveLength(1);
  });

  it("el catálogo valida la categoría", async () => {
    const ok = await app.inject({
      url: "/v1/ecosistema/tienda/catalogo?categoria=cercas",
      headers: { cookie: cookieA },
    });
    expect(ok.json().items[0].category).toBe("cercas");
    const bad = await app.inject({
      url: "/v1/ecosistema/tienda/catalogo?categoria=../x",
      headers: { cookie: cookieA },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("la tienda exige una búsqueda de al menos dos letras", async () => {
    const bad = await app.inject({
      url: "/v1/ecosistema/tienda?q=a",
      headers: { cookie: cookieA },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      url: "/v1/ecosistema/tienda?q=sal",
      headers: { cookie: cookieA },
    });
    expect(ok.json().moreUrl).toContain("search=sal");
  });

  it("sin conector responde 503", async () => {
    const c = await login(off, "ana@comunidad.local");
    const res = await off.inject({ url: "/v1/ecosistema/noticias", headers: { cookie: c } });
    expect(res.statusCode).toBe(503);
  });

  it("el asistente recibe las notas del gremio y devuelve solo las citadas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/assistant",
      headers: { ...H, cookie: cookieA },
      payload: { organizationId: orgA, question: "¿Cómo controlo la garrapata?" },
    });
    expect(res.statusCode).toBe(200);
    expect(prompts.at(-1)).toContain("<conocimiento_gremio>");
    expect(prompts.at(-1)).toContain("[1] Cómo controlar la garrapata");
    expect(res.json().sources).toEqual([
      { n: 1, title: "Cómo controlar la garrapata", url: "https://x.co/g", kind: "articulo" },
    ]);
  });
});

describe("comunidad de productores", () => {
  let postId = "";

  it("publica con nombre corto y región, nunca la finca", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/comunidad",
      headers: { ...H, cookie: cookieA },
      payload: {
        topic: "sanidad",
        title: "Garrapata en verano",
        body: "¿Qué les ha funcionado este año?",
      },
    });
    expect(res.statusCode).toBe(201);
    const post = res.json();
    postId = post.id;
    expect(post).toMatchObject({ authorName: "Ana M.", region: "Córdoba", mine: true, replies: 0 });
  });

  it("valida el contenido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/comunidad",
      headers: { ...H, cookie: cookieA },
      payload: { topic: "sanidad", title: "Hola", body: "corto" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("otro productor responde y ve la publicación como ajena", async () => {
    const r = await app.inject({
      method: "POST",
      url: `/v1/comunidad/${postId}/respuestas`,
      headers: { ...H, cookie: cookieB },
      payload: { body: "Rotación de potreros y baños cada 21 días." },
    });
    expect(r.statusCode).toBe(201);
    const t = await app.inject({ url: `/v1/comunidad/${postId}`, headers: { cookie: cookieB } });
    expect(t.json().post.mine).toBe(false);
    expect(t.json().replies).toHaveLength(1);
    const list = await app.inject({
      url: "/v1/comunidad?topic=sanidad",
      headers: { cookie: cookieB },
    });
    expect(list.json().items[0].replies).toBe(1);
    const search = await app.inject({
      url: "/v1/comunidad?q=garrapata",
      headers: { cookie: cookieB },
    });
    expect(search.json().items).toHaveLength(1);
  });

  it("solo el autor puede retirar lo suyo", async () => {
    const other = await app.inject({
      method: "DELETE",
      url: `/v1/comunidad/post/${postId}`,
      headers: { ...H, cookie: cookieB },
    });
    expect(other.statusCode).toBe(404);
  });

  it("con tres reportes de personas distintas se oculta", async () => {
    for (let i = 0; i < 3; i++) {
      const c = await login(app, `r${i}@comunidad.local`);
      const r = await app.inject({
        method: "POST",
        url: `/v1/comunidad/post/${postId}/reporte`,
        headers: { ...H, cookie: c },
      });
      expect(r.json().hidden).toBe(i === 2);
    }
    const t = await app.inject({ url: `/v1/comunidad/${postId}`, headers: { cookie: cookieA } });
    expect(t.statusCode).toBe(404);
  });
});
