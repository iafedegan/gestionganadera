import type {
  CourseDto,
  CourseModuleDto,
  NewsItemDto,
  StoreCatalogDto,
  StoreCategoryDto,
  StoreProductDto,
  StoreSearchDto,
} from "@ganaderia/contracts";

/**
 * Ecosistema FEDEGÁN 5.0: la app no duplica lo que ya existe en el gremio, lo conecta.
 * - Noticias: feed público de CONtexto Ganadero.
 * - Capacitación: cursos de la Escuela Virtual FEDEGÁN–FNG.
 * - Tienda: búsqueda pública de productos de TvGan (Odoo).
 * - Conocimiento: búsqueda en el archivo de CONtexto Ganadero para el asistente.
 * Cada respuesta se guarda en memoria un tiempo; si la fuente falla se sirve la última buena.
 */

export interface KnowledgeHit {
  n: number;
  title: string;
  url: string;
  kind: "articulo" | "archivo";
  summary: string;
}

export interface Ecosistema {
  news(): Promise<NewsItemDto[]>;
  courses(): Promise<CourseDto[]>;
  storeSearch(term: string): Promise<StoreSearchDto>;
  /** Categorías con productos publicados, con su cantidad. */
  storeCategories(): Promise<StoreCategoryDto[]>;
  /** Todo lo publicado en la tienda, o en una categoría. */
  storeCatalog(category?: string): Promise<StoreCatalogDto>;
  knowledge(question: string): Promise<KnowledgeHit[]>;
}

export interface EcosistemaOptions {
  fetch?: typeof fetch;
  contextoUrl?: string;
  escuelaUrl?: string;
  tvganUrl?: string;
  now?: () => number;
}

const MIN = 60_000;
const UA = "GestionGanadera/1.0 (+app de gestion ganadera)";

/* ───────────── Utilidades de texto ───────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Texto plano: las etiquetas de bloque separan palabras; las de línea (resaltados) no. */
export const stripTags = (s: string) =>
  decodeEntities(
    s
      .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|section|article)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1] !== undefined ? cdata(m[1]) : null;
}

/** Solo direcciones http(s): nunca se pasa a la app un enlace javascript: o data:. */
function safeUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function withoutTracking(url: string): string {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return u.toString();
}

/* ───────────── Noticias (RSS de CONtexto Ganadero) ───────────── */

export function parseRss(xml: string, limit = 30): NewsItemDto[] {
  const out: NewsItemDto[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1] ?? "";
    const url = safeUrl(tag(block, "link") ?? tag(block, "guid"));
    const title = stripTags(tag(block, "title") ?? "");
    if (!url || !title) continue;
    const content = tag(block, "content:encoded") ?? "";
    const image =
      safeUrl(block.match(/<media:content[^>]*url="([^"]+)"/i)?.[1]) ??
      safeUrl(block.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1]) ??
      safeUrl(content.match(/<img[^>]*src="([^"]+)"/i)?.[1]);
    const date = tag(block, "pubDate");
    const parsed = date ? new Date(date.trim()) : null;
    out.push({
      title,
      url: withoutTracking(url),
      summary: stripTags(tag(block, "description") ?? "").slice(0, 400),
      image,
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      category: tag(block, "category") ? stripTags(tag(block, "category") ?? "") : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ───────────── Escuela Virtual ───────────── */

// Rutas de la Escuela que no son cursos.
const NOT_COURSES = new Set(["carnet", "mis-cursos", "perfil"]);

/** Catálogo conocido: se muestra si la Escuela no responde (títulos según su sitio). */
export const COURSE_FALLBACK: Array<Pick<CourseDto, "slug" | "title" | "summary">> = [
  {
    slug: "fundamentos-de-la-ganaderia-colombiana",
    title: "Fundamentos de la ganadería colombiana",
    summary: "",
  },
  {
    slug: "etapas-de-la-produccion-ganadera",
    title: "Etapas de la producción ganadera",
    summary: "",
  },
  { slug: "razas-bovinas", title: "Razas bovinas", summary: "" },
  { slug: "bufalos", title: "Búfalos", summary: "" },
  {
    slug: "salud-animal",
    title: "Salud animal",
    summary: "Enfermedades, primeros auxilios y manejo del animal",
  },
  { slug: "genetica-y-reproduccion", title: "Genética y reproducción", summary: "" },
  {
    slug: "alimentacion-animal-y-manejo-de-praderas",
    title: "Alimentación animal y manejo de praderas",
    summary: "",
  },
  { slug: "administracion-ganadera", title: "Administración ganadera", summary: "" },
  { slug: "productos-de-ganaderia", title: "Productos de la ganadería", summary: "" },
  {
    slug: "buenas-practicas-ganaderas-y-sello-ambiental",
    title: "Buenas prácticas ganaderas y sello ambiental",
    summary: "",
  },
  {
    slug: "ganaderia-sostenible-y-medio-ambiente",
    title: "Ganadería sostenible y medio ambiente",
    summary: "",
  },
];

export function parseCourseSlugs(html: string): string[] {
  const slugs = new Set<string>();
  for (const m of html.matchAll(/href="\/escuela-virtual\/([a-z0-9-]+)"/g)) {
    const s = m[1];
    if (s && !NOT_COURSES.has(s)) slugs.add(s);
  }
  return [...slugs];
}

export function parseCoursePage(html: string): { title: string | null; summary: string } {
  const raw = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const title = raw ? stripTags(raw).replace(/\s*·\s*Escuela Virtual.*$/i, "") : null;
  const summary = stripTags(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "");
  return { title: title || null, summary };
}

type CourseDetail = Pick<
  CourseDto,
  | "image"
  | "level"
  | "lessonCount"
  | "duration"
  | "instructor"
  | "description"
  | "outcomes"
  | "modules"
>;

/** Texto de la página, un elemento por línea (sin íconos, scripts ni estilos). */
function pageTokens(html: string): string[] {
  const body = html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "");
  return decodeEntities(body.replace(/<[^>]*>/g, "\n"))
    .split("\n")
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const LEVELS = ["Básico", "Intermedio", "Avanzado"];
const DURATION = /^(?:\d+\s*h)?(?:\s*\d+\s*min)?$/;

/**
 * Ficha de un curso de la Escuela Virtual: nivel, lecciones, duración, instructor, lo que se
 * aprende, el temario y la descripción. La Escuela no publica una API; se lee su página, así
 * que lo que no se encuentre se omite en vez de inventarse.
 */
export function parseCourseDetail(html: string, origin: string): CourseDetail {
  const t = pageTokens(html);
  const at = (label: string, from = 0) => t.findIndex((x, i) => i >= from && x === label);

  const out: CourseDetail = {};

  const img = html.match(/\/_next\/image\?url=(%2Fcursos%2F[^&"]+)/)?.[1];
  if (img) out.image = safeUrl(decodeURIComponent(img), origin);

  const level = t.find((x) => LEVELS.includes(x));
  if (level) out.level = level;
  const lessons = t.map((x) => x.match(/^(\d+)\s+lecciones?$/)?.[1]).find(Boolean);
  if (lessons) out.lessonCount = Number(lessons);
  const dur = t.find((x) => /\d/.test(x) && DURATION.test(x));
  if (dur) out.duration = dur;

  const iInstr = t.findIndex((x) => /^Instructor:?$/.test(x));
  if (iInstr >= 0 && t[iInstr + 1]) out.instructor = t[iInstr + 1] ?? null;

  const iLearn = at("Lo que aprenderá");
  const iContent = at("Contenido del curso");
  if (iLearn >= 0 && iContent > iLearn) out.outcomes = t.slice(iLearn + 1, iContent);

  if (iContent >= 0) {
    const iDesc = at("Descripción", iContent);
    const rows = t.slice(iContent + 2, iDesc > iContent ? iDesc : undefined);
    const modules: CourseModuleDto[] = [];
    let cur: CourseModuleDto | null = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? "";
      if (/^\d{2}$/.test(row)) {
        cur = { title: rows[i + 1] ?? "", lessons: [] };
        modules.push(cur);
        i += 2; // título y «N lecciones»
        continue;
      }
      if (!cur || row === "Vista previa") continue;
      const next = rows[i + 1] ?? "";
      const preview = next === "Vista previa";
      const mins = (preview ? rows[i + 2] : next) ?? "";
      const hasDuration = /^\d+\s*(min|h)\b/.test(mins);
      cur.lessons.push({ title: row, duration: hasDuration ? mins : null, preview });
      i += (preview ? 1 : 0) + (hasDuration ? 1 : 0);
    }
    const filled = modules.filter((m) => m.lessons.length > 0);
    if (filled.length > 0) out.modules = filled;
    if (iDesc >= 0) {
      const iEnd = t.findIndex((x, i) => i > iDesc && x === "Instructor");
      const desc = t.slice(iDesc + 1, iEnd > iDesc ? iEnd : iDesc + 2).join(" ");
      if (desc) out.description = desc.slice(0, 1500);
    }
  }
  return out;
}

/* ───────────── Tienda TvGan (Odoo) ───────────── */

interface OdooHit {
  name?: string;
  website_url?: string;
  image_url?: string;
  detail?: string;
  extra_link?: string;
}

export function parseStoreHits(base: string, hits: OdooHit[]): StoreProductDto[] {
  const out: StoreProductDto[] = [];
  for (const h of hits) {
    const url = safeUrl(h.website_url, base);
    const name = stripTags(h.name ?? "");
    // Odoo mezcla categorías con productos: aquí solo van productos.
    if (!url || !name || new URL(url).pathname.startsWith("/shop/category/")) continue;
    // Odoo marca las categorías como botones después del rótulo «Categorías».
    const cats = [
      ...(h.extra_link ?? "").matchAll(/<button[^>]*onclick[^>]*>([\s\S]*?)<\/button>/g),
    ]
      .map((c) => stripTags(c[1] ?? ""))
      .filter(Boolean);
    const price = stripTags(h.detail ?? "");
    out.push({
      name,
      url,
      image: safeUrl(h.image_url?.replace(/\/image_128$/, "/image_256"), base),
      price: price || null,
      category: cats.find((c) => c.toUpperCase() !== "OFERTAS") ?? cats[0] ?? null,
    });
  }
  return out;
}

/** Categorías de la tienda (clave de la app, nombre, ruta en Odoo). Las vacías no se muestran. */
export const STORE_CATEGORIES: Array<[string, string, string]> = [
  ["ofertas", "Ofertas", "/shop/category/ofertas-agropecuarias-253"],
  ["ganado", "Ganado y subastas", "/shop/category/ganado-179"],
  ["semillas", "Semillas", "/shop/category/semillas-213"],
  ["cercas", "Cercas", "/shop/category/cercas-132"],
  ["equipos", "Equipos y maquinaria", "/shop/category/equipos-y-maquinarias-151"],
  ["identificacion", "Identificación animal", "/shop/category/identificacion-animal-180"],
  ["reproduccion", "Reproducción", "/shop/category/reproduccion-209"],
  ["alimentos", "Alimentos y sustitutos", "/shop/category/alimentos-y-sustitutos-124"],
  ["fertilizantes", "Fertilizantes", "/shop/category/fertilizantes-174"],
  ["jeringas", "Jeringas y agujas", "/shop/category/jeringas-y-agujas-187"],
  ["medicamentos", "Medicamentos", "/shop/category/medicamentos-193"],
  ["plagas", "Control de plagas", "/shop/category/control-de-plagas-145"],
  ["desinfeccion", "Protección y desinfección", "/shop/category/proteccion-y-desinfeccion-206"],
  ["vaqueria", "Monturas y vaquería", "/shop/category/vaqueria-237"],
  ["carne", "Lotes de carne", "/shop/category/carne-254"],
  ["leche", "Lotes de leche", "/shop/category/leche-255"],
  ["doble-proposito", "Doble propósito", "/shop/category/doble-proposito-242"],
];

/** Páginas como máximo por listado (24 productos cada una). */
const MAX_PAGES = 20;

/** Lee una página del listado de la tienda (Odoo): las tarjetas y la última página. */
export function parseShopPage(
  html: string,
  base: string,
): { items: StoreProductDto[]; lastPage: number } {
  const items: StoreProductDto[] = [];
  const cards = html.split(/<form\b[^>]*class="oe_product_cart\b/).slice(1);
  for (const card of cards) {
    const head = card.slice(0, card.indexOf(">") + 1);
    const label = head.match(/aria-label="([^"]*)"/)?.[1];
    const href = card.match(/href="(\/shop\/(?!category\/|cart|wishlist)[^"#?]+)"/)?.[1];
    const url = safeUrl(href, base);
    const name = stripTags(
      label ?? card.match(/o_wsale_products_item_title[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1] ?? "",
    );
    if (!url || !name) continue;
    const img =
      card.match(/<img[^>]*src="([^"]+)"[^>]*oe_product_image_img\b/)?.[1] ??
      card.match(/<img[^>]*src="([^"]+)"/)?.[1];
    const priceBlock = card.match(/class="product_price"[\s\S]*?<\/div>/)?.[0] ?? "";
    const value = priceBlock.match(/oe_currency_value">([^<]+)</)?.[1];
    const badge = stripTags(
      card.match(/class="o_ribbons[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "",
    );
    items.push({
      name,
      url,
      image: safeUrl(img?.replace(/\/image_1024\//, "/image_512/"), base),
      price: value ? `$ ${value.trim()}` : null,
      category: null,
      badge: badge || null,
    });
  }
  const pages = [...html.matchAll(/\/page\/(\d+)/g)].map((m) => Number(m[1]));
  return { items, lastPage: Math.min(MAX_PAGES, Math.max(1, ...pages)) };
}

/* ───────────── Conector ───────────── */

export function createEcosistema(opts: EcosistemaOptions = {}): Ecosistema {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const contexto = (opts.contextoUrl ?? "https://www.contextoganadero.com").replace(/\/$/, "");
  const escuela = (opts.escuelaUrl ?? "https://fedegan.vercel.app/escuela-virtual").replace(
    /\/$/,
    "",
  );
  const tvgan = (opts.tvganUrl ?? "https://www.tvgan.com.co").replace(/\/$/, "");
  const escuelaOrigin = new URL(escuela).origin;

  const cache = new Map<string, { at: number; value: unknown }>();
  /** Memoria con vencimiento; si la fuente falla se devuelve lo último bueno. */
  async function memo<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value as T;
    try {
      const value = await load();
      cache.set(key, { at: now(), value });
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
      return value;
    } catch (err) {
      if (hit) return hit.value as T;
      throw err;
    }
  }

  async function get(url: string, timeoutMs = 10_000): Promise<string> {
    const res = await doFetch(url, {
      headers: { "user-agent": UA, accept: "*/*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return res.text();
  }

  async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
    return (await res.json()) as T;
  }

  /** Lee todas las páginas de un listado de la tienda; una categoría vacía responde 404 y es lista vacía. */
  function catalog(key?: string): Promise<StoreCatalogDto> {
    const cat = key ? STORE_CATEGORIES.find(([k]) => k === key) : undefined;
    if (key && !cat) return Promise.reject(new Error(`categoría desconocida: ${key}`));
    const path = cat ? cat[2] : "/shop";
    return memo(`store:catalog:${key ?? "*"}`, 30 * MIN, async () => {
      const page = async (n: number): Promise<string | null> => {
        const res = await doFetch(`${tvgan}${path}${n > 1 ? `/page/${n}` : ""}`, {
          headers: { "user-agent": UA, accept: "text/html" },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`tienda respondió ${res.status}`);
        return res.text();
      };
      const first = await page(1);
      const seen = new Set<string>();
      const items: StoreProductDto[] = [];
      const add = (list: StoreProductDto[]) => {
        for (const p of list) {
          if (seen.has(p.url)) continue;
          seen.add(p.url);
          items.push(cat ? { ...p, category: cat[1] } : p);
        }
      };
      if (first) {
        const p1 = parseShopPage(first, tvgan);
        add(p1.items);
        const rest = await Promise.all(
          Array.from({ length: p1.lastPage - 1 }, (_, i) => page(i + 2)),
        );
        for (const html of rest) if (html) add(parseShopPage(html, tvgan).items);
      }
      return {
        items,
        category: cat ? cat[1] : null,
        url: `${tvgan}${path}`,
        updatedAt: new Date(now()).toISOString(),
      };
    });
  }

  return {
    news: () =>
      memo("news", 15 * MIN, async () => {
        const items = parseRss(await get(`${contexto}/feed.xml`));
        if (items.length === 0) throw new Error("feed sin noticias");
        return items;
      }),

    courses: () =>
      // Una hora: los cursos nuevos o cambiados en la Escuela aparecen en la app sin publicar nada.
      memo("courses", 60 * MIN, async () => {
        let slugs: string[] = [];
        try {
          slugs = parseCourseSlugs(await get(escuela));
        } catch {
          /* se usa el catálogo conocido */
        }
        if (slugs.length === 0) slugs = COURSE_FALLBACK.map((c) => c.slug);
        const known = new Map(COURSE_FALLBACK.map((c) => [c.slug, c]));
        const courses = await Promise.all(
          slugs.slice(0, 40).map(async (slug): Promise<CourseDto> => {
            const url = `${escuelaOrigin}/escuela-virtual/${slug}`;
            const fallbackTitle =
              known.get(slug)?.title ??
              slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
            try {
              const html = await get(url, 8_000);
              const page = parseCoursePage(html);
              return {
                slug,
                url,
                title: page.title ?? fallbackTitle,
                summary: page.summary || known.get(slug)?.summary || "",
                ...parseCourseDetail(html, escuelaOrigin),
              };
            } catch {
              return { slug, url, title: fallbackTitle, summary: known.get(slug)?.summary ?? "" };
            }
          }),
        );
        // La Escuela repite un mismo texto de descripción en todos los cursos mientras no escribe
        // el de cada uno: no se muestra repetido.
        const seen = new Map<string, number>();
        for (const c of courses)
          if (c.description) seen.set(c.description, (seen.get(c.description) ?? 0) + 1);
        return courses.map((c) =>
          c.description && (seen.get(c.description) ?? 0) > 1 ? { ...c, description: "" } : c,
        );
      }),

    storeSearch: (term: string) => {
      const q = term.trim().replace(/\s+/g, " ").slice(0, 80);
      const moreUrl = `${tvgan}/shop?search=${encodeURIComponent(q)}`;
      return memo(`store:${q.toLowerCase()}`, 10 * MIN, async () => {
        const r = await postJson<{
          result?: { results?: OdooHit[]; results_count?: number };
          error?: unknown;
        }>(
          `${tvgan}/website/snippet/autocomplete`,
          {
            jsonrpc: "2.0",
            method: "call",
            params: {
              search_type: "products",
              term: q,
              order: "name asc",
              limit: 8,
              max_nb_chars: 140,
              options: {
                displayImage: true,
                displayDescription: false,
                displayExtraLink: true,
                displayDetail: true,
                allowFuzzy: true,
              },
            },
          },
          10_000,
        );
        if (!r.result) throw new Error("la tienda no devolvió resultados");
        const items = parseStoreHits(tvgan, r.result.results ?? []);
        return { items, total: r.result.results_count ?? items.length, moreUrl };
      });
    },

    storeCatalog: (category?: string) => catalog(category),

    storeCategories: () =>
      memo("store:categories", 30 * MIN, async () => {
        const all = await Promise.all(
          STORE_CATEGORIES.map(async ([key, label, path]): Promise<StoreCategoryDto> => {
            const c = await catalog(key).catch(() => null);
            return { key, label, url: `${tvgan}${path}`, count: c?.items.length ?? 0 };
          }),
        );
        return all.filter((c) => c.count > 0);
      }),

    knowledge: (question: string) =>
      memo(`kn:${question.trim().toLowerCase().slice(0, 300)}`, 30 * MIN, async () => {
        const r = await postJson<{
          sources?: Array<{
            n?: number;
            title?: string;
            url?: string;
            kind?: string;
            summary?: string;
          }>;
        }>(
          `${contexto}/api/assistant`,
          { question: question.slice(0, 1000), sessionId: "gestion-ganadera" },
          25_000,
        );
        return (r.sources ?? [])
          .flatMap((s, i): KnowledgeHit[] => {
            const url = safeUrl(s.url, contexto);
            const title = stripTags(s.title ?? "");
            if (!url || !title) return [];
            return [
              {
                n: i + 1,
                title,
                url,
                kind: s.kind === "archivo" ? "archivo" : "articulo",
                summary: stripTags(s.summary ?? "").slice(0, 700),
              },
            ];
          })
          .slice(0, 6)
          .map((s, i) => ({ ...s, n: i + 1 }));
      }),
  };
}

/**
 * Conector con las direcciones del entorno. ECOSISTEMA=0 lo apaga (p. ej. sin salida a internet).
 * CONTEXTO_URL, ESCUELA_URL y TVGAN_URL permiten apuntar a otros ambientes.
 */
export function ecosistemaFromEnv(env: NodeJS.ProcessEnv = process.env): Ecosistema | null {
  if (env.ECOSISTEMA === "0") return null;
  return createEcosistema({
    ...(env.CONTEXTO_URL ? { contextoUrl: env.CONTEXTO_URL } : {}),
    ...(env.ESCUELA_URL ? { escuelaUrl: env.ESCUELA_URL } : {}),
    ...(env.TVGAN_URL ? { tvganUrl: env.TVGAN_URL } : {}),
  });
}
