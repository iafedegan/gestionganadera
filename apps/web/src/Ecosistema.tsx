import type {
  CommunityPostDto,
  CommunityThreadDto,
  CommunityTopic,
  CourseDto,
  NewsItemDto,
  StoreProductDto,
} from "@ganaderia/contracts";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flag,
  GraduationCap,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Tv,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PageHead } from "./components";
import { fecha, fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { type SupplyOverview, localdb } from "./lib/localdb";
import { matchesStore, priceValue, storeTerm } from "./lib/storeTerm";
import { useApp } from "./state";
import { statusOf } from "./supplies";

/**
 * Ecosistema FEDEGÁN 5.0: en una misma app el productor se informa (CONtexto Ganadero),
 * se capacita (Escuela Virtual), compra (TvGan) y comparte experiencias (Comunidad).
 * La app no copia esas plataformas: muestra su contenido y lleva a ellas para leer, estudiar o pagar.
 */

const KICKER = "Ecosistema FEDEGÁN 5.0";
const ESCUELA = "https://fedegan.vercel.app/escuela-virtual";
const TVGAN = "https://www.tvgan.com.co";

/* ───────────── Datos remotos con copia local ───────────── */

interface Remote<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Fecha de la copia guardada cuando no se pudo actualizar. */
  savedAt: string | null;
  reload(): void;
}

const cacheKey = (k: string) => `gg.eco.${k}`;
function readCache<T>(k: string): { at: string; value: T } | null {
  try {
    const raw = localStorage.getItem(cacheKey(k));
    return raw ? (JSON.parse(raw) as { at: string; value: T }) : null;
  } catch {
    return null;
  }
}
function writeCache(k: string, value: unknown) {
  try {
    localStorage.setItem(cacheKey(k), JSON.stringify({ at: new Date().toISOString(), value }));
  } catch {
    /* sin almacenamiento: solo se pierde la copia para usar sin señal */
  }
}

const messageOf = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión."
    : e instanceof ApiError
      ? e.message
      : "No se pudo cargar. Intente de nuevo.";

/** Carga del servidor; sin señal muestra la última copia guardada en este dispositivo. */
function useRemote<T>(key: string, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<Omit<Remote<T>, "reload">>(() => {
    const c = readCache<T>(key);
    return { data: c?.value ?? null, loading: true, error: null, savedAt: null };
  });
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: se recarga por clave o a pedido
  useEffect(() => {
    let alive = true;
    // Al cambiar de clave (p. ej. otra categoría) se muestra de inmediato su copia guardada.
    const cached = readCache<T>(key);
    setState({ data: cached?.value ?? null, loading: true, error: null, savedAt: null });
    load().then(
      (value) => {
        if (!alive) return;
        writeCache(key, value);
        setState({ data: value, loading: false, error: null, savedAt: null });
      },
      (e) => {
        if (!alive) return;
        const c = readCache<T>(key);
        setState({
          data: c?.value ?? null,
          loading: false,
          error: messageOf(e),
          savedAt: c?.at ?? null,
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

function RemoteState<T>(props: { r: Remote<T>; what: string; children(data: T): ReactNode }) {
  const { r } = props;
  return (
    <>
      {r.error && (
        <output className="banner banner-warn eco-banner">
          {r.savedAt
            ? `${r.error} Se muestra la copia guardada el ${fechaHora(r.savedAt)}.`
            : `${r.error} ${props.what} necesita internet la primera vez.`}{" "}
          <button type="button" className="link" onClick={r.reload}>
            Reintentar
          </button>
        </output>
      )}
      {r.data === null && r.loading && <SkeletonGrid />}
      {r.data !== null && props.children(r.data)}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="eco-grid" aria-busy="true" aria-label="Cargando">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="card eco-skel" />
      ))}
    </div>
  );
}

function OutLink(props: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      className={props.className ?? "eco-out"}
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children} <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

/** Lista desplegable con su rótulo: en el celular abre el selector del sistema, grande y conocido. */
function Picker<K extends string>(props: {
  label: string;
  value: K | "";
  options: { key: K; label: string }[];
  onChange(k: K | ""): void;
  allLabel?: string;
}) {
  return (
    <label className="eco-pick">
      <span className="eco-pick-label">{props.label}</span>
      <span className="eco-pick-box">
        <select value={props.value} onChange={(e) => props.onChange(e.target.value as K | "")}>
          {props.allLabel !== undefined && <option value="">{props.allLabel}</option>}
          {props.options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} aria-hidden="true" />
      </span>
    </label>
  );
}

function SearchBox(props: {
  value: string;
  onChange(v: string): void;
  onSubmit?(): void;
  placeholder: string;
  label: string;
}) {
  return (
    <form
      className="eco-search"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit?.();
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        aria-label={props.label}
        maxLength={80}
        enterKeyHint="search"
      />
    </form>
  );
}

const shortDate = (iso: string | null) => (iso ? fecha(iso) : "");

/** «Hoy», «Ayer» o «23 nov.»: corto, para listas en el celular. */
function relDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 864e5);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/* ───────────── Noticias (CONtexto Ganadero) ───────────── */

export function NoticiasScreen() {
  const r = useRemote("noticias", async () => (await api.news()).items);
  const [cat, setCat] = useState("");
  const [vista, setVista] = useState<"notas" | "sitio">("notas");
  const cats = [...new Set((r.data ?? []).map((n) => n.category).filter(Boolean))] as string[];
  return (
    <section className="page">
      <PageHead
        kicker={KICKER}
        icon={<Newspaper size={30} aria-hidden="true" />}
        title="Noticias del sector"
        lead="Lo último de CONtexto Ganadero, el medio de FEDEGÁN: mercado, sanidad, clima y políticas para el campo."
        actions={<OutLink href="https://www.contextoganadero.com">Abrir CONtexto Ganadero</OutLink>}
      />
      <div className="kit-seg eco-vista">
        <button type="button" aria-pressed={vista === "notas"} onClick={() => setVista("notas")}>
          Notas
        </button>
        <button type="button" aria-pressed={vista === "sitio"} onClick={() => setVista("sitio")}>
          Sitio completo
        </button>
      </div>
      {vista === "sitio" && (
        <>
          <iframe
            className="eco-frame"
            title="CONtexto Ganadero"
            src="https://www.contextoganadero.com/"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="hint eco-hint">
            Si el sitio no aparece, el medio no permite verse dentro de otras aplicaciones:{" "}
            <OutLink href="https://www.contextoganadero.com">ábralo en el navegador</OutLink> o use
            la vista «Notas».
          </p>
        </>
      )}
      {vista === "notas" && (
        <RemoteState r={r} what="Las noticias">
          {(items) => {
            const list = cat ? items.filter((n) => n.category === cat) : items;
            return (
              <>
                {cats.length > 1 && (
                  <div className="card eco-filters">
                    <Picker
                      label="Sección"
                      value={cat}
                      options={cats.map((c) => ({ key: c, label: c }))}
                      onChange={setCat}
                      allLabel="Todas las noticias"
                    />
                  </div>
                )}
                {list.length === 0 ? (
                  <p className="empty">No hay noticias en esta sección por ahora.</p>
                ) : (
                  <div className="eco-grid">
                    {list.map((n, i) => (
                      <NewsCard key={n.url} n={n} lead={i === 0 && !cat} />
                    ))}
                  </div>
                )}
              </>
            );
          }}
        </RemoteState>
      )}
    </section>
  );
}

function NewsCard({ n, lead }: { n: NewsItemDto; lead: boolean }) {
  return (
    <article className={lead ? "card eco-card eco-lead" : "card eco-card"}>
      {n.image && <img className="eco-img" src={n.image} alt="" loading="lazy" />}
      <div className="eco-body">
        <p className="eco-meta">
          {n.category && <span className="eco-tag">{n.category}</span>}
          {shortDate(n.publishedAt)}
        </p>
        <h2 className="eco-title">{n.title}</h2>
        {n.summary && <p className="eco-text">{n.summary}</p>}
        <OutLink href={n.url}>Leer la nota</OutLink>
      </div>
    </article>
  );
}

/** Tarjeta de Inicio: las tres noticias más recientes. */
export function NewsStrip(props: { onOpen(): void }) {
  const r = useRemote("noticias", async () => (await api.news()).items);
  if (!r.data?.length) return null;
  return (
    <article className="card eco-strip">
      <header className="eco-strip-head">
        <span className="eco-strip-icon" aria-hidden="true">
          <Newspaper size={20} />
        </span>
        <div>
          <h2>Noticias de CONtexto Ganadero</h2>
          <p>Lo que pasa en el sector, hoy.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.onOpen}>
          Ver todas
        </button>
      </header>
      <ul>
        {r.data.slice(0, 3).map((n) => (
          <li key={n.url}>
            <a href={n.url} target="_blank" rel="noopener noreferrer">
              {n.title}
            </a>
            <small>
              {relDate(n.publishedAt)}
              {n.category ? ` · ${n.category}` : ""}
            </small>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ───────────── Capacitación (Escuela Virtual) ───────────── */

/** Curso → módulo de la app con el que se relaciona, para orientar al productor. */
const COURSE_AREA: Record<string, string> = {
  "salud-animal": "Sanidad",
  "genetica-y-reproduccion": "Reproducción",
  "alimentacion-animal-y-manejo-de-praderas": "Pasturas",
  "administracion-ganadera": "Economía",
  bufalos: "Búfalos",
  "razas-bovinas": "Genética",
  "buenas-practicas-ganaderas-y-sello-ambiental": "Buenas prácticas",
  "ganaderia-sostenible-y-medio-ambiente": "Sostenibilidad",
  "productos-de-ganaderia": "Leche y carne",
  "etapas-de-la-produccion-ganadera": "Producción",
  "fundamentos-de-la-ganaderia-colombiana": "Para empezar",
};

export function CapacitacionScreen() {
  const r = useRemote("cursos", async () => (await api.courses()).items);
  return (
    <section className="page">
      <PageHead
        kicker={KICKER}
        icon={<GraduationCap size={30} aria-hidden="true" />}
        title="Capacitación"
        lead="Cursos de la Escuela Virtual FEDEGÁN–FNG. Estudie a su ritmo desde el celular y lleve lo aprendido a su finca."
        actions={
          <>
            <OutLink className="btn btn-primary" href={`${ESCUELA}/mis-cursos`}>
              Mis cursos
            </OutLink>
            <OutLink className="btn btn-ghost" href={`${ESCUELA}/carnet`}>
              Mi carné
            </OutLink>
          </>
        }
      />
      <p className="hint eco-hint">
        Los cursos, el avance y los certificados se manejan en la Escuela Virtual con su propia
        cuenta.
      </p>
      <RemoteState r={r} what="El catálogo de cursos">
        {(items) => (
          <div className="eco-grid">
            {items.map((c) => (
              <CourseCard key={c.slug} c={c} />
            ))}
          </div>
        )}
      </RemoteState>
    </section>
  );
}

function CourseFacts({ c }: { c: CourseDto }) {
  const facts = [c.level, c.lessonCount ? `${c.lessonCount} lecciones` : null, c.duration].filter(
    Boolean,
  );
  return facts.length === 0 ? null : (
    <p className="eco-meta">
      {facts.map((f) => (
        <span key={f}>{f}</span>
      ))}
    </p>
  );
}

function CourseCard({ c }: { c: CourseDto }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card eco-card eco-course">
      {c.image && <img className="eco-img" src={c.image} alt="" loading="lazy" />}
      <div className="eco-body">
        <p className="eco-meta">
          <span className="eco-tag">{COURSE_AREA[c.slug] ?? "Curso"}</span>
        </p>
        <h2 className="eco-title">{c.title}</h2>
        {c.summary && <p className="eco-text">{c.summary}</p>}
        <CourseFacts c={c} />
        {c.instructor && <p className="eco-text eco-instr">Instructor: {c.instructor}</p>}
        <div className="eco-actions">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            Ver contenido
          </button>
          <OutLink href={c.url}>Ir al curso</OutLink>
        </div>
      </div>
      {open && <CourseDialog c={c} onClose={() => setOpen(false)} />}
    </article>
  );
}

function CourseDialog({ c, onClose }: { c: CourseDto; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog dialog-form" onClose={onClose} aria-labelledby="eco-cd">
      <header className="dialog-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          ✕
        </button>
        <h2 id="eco-cd">{c.title}</h2>
      </header>
      <div className="dialog-body">
        {c.image && <img className="eco-img eco-cd-img" src={c.image} alt="" />}
        <CourseFacts c={c} />
        {c.instructor && <p className="eco-text">Instructor: {c.instructor}</p>}
        {(c.description || c.summary) && <p className="eco-text">{c.description || c.summary}</p>}
        {c.outcomes && c.outcomes.length > 0 && (
          <>
            <h3 className="eco-sub">Lo que aprenderá</h3>
            <ul className="eco-checks">
              {c.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
        {c.modules && c.modules.length > 0 && (
          <>
            <h3 className="eco-sub">Contenido del curso</h3>
            {c.modules.map((m) => (
              <div key={m.title} className="eco-module">
                <p className="eco-module-title">{m.title}</p>
                <ol className="eco-lessons">
                  {m.lessons.map((l) => (
                    <li key={l.title}>
                      <span>{l.title}</span>
                      {l.duration && <small>{l.duration}</small>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </>
        )}
        <p className="hint">
          Para inscribirse, ver los videos y obtener el certificado, ingrese a la Escuela Virtual
          con su cuenta.
        </p>
        <OutLink className="btn btn-primary eco-cta" href={c.url}>
          Ir al curso en la Escuela Virtual
        </OutLink>
      </div>
    </dialog>
  );
}

/* ───────────── Tienda (TvGan) ───────────── */

type StoreSort = "tienda" | "menor" | "mayor" | "nombre";
const SORT_LABEL: Record<StoreSort, string> = {
  tienda: "Destacados",
  menor: "Menor precio",
  mayor: "Mayor precio",
  nombre: "Nombre (A-Z)",
};

function sortProducts(items: StoreProductDto[], sort: StoreSort): StoreProductDto[] {
  if (sort === "tienda") return items;
  const out = [...items];
  if (sort === "nombre") out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  else {
    const dir = sort === "menor" ? 1 : -1;
    out.sort(
      (a, b) =>
        dir *
        ((priceValue(a.price) ?? Number.POSITIVE_INFINITY) -
          (priceValue(b.price) ?? Number.POSITIVE_INFINITY)),
    );
  }
  return out;
}

function ProductCard({ p }: { p: StoreProductDto }) {
  return (
    <article className="card eco-card eco-product">
      <a
        className="eco-pimg-link"
        href={p.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
      >
        {p.image ? (
          <img className="eco-pimg" src={p.image} alt="" loading="lazy" />
        ) : (
          <span className="eco-pimg eco-noimg" aria-hidden="true">
            <Store size={28} />
          </span>
        )}
        {p.badge && <span className="eco-badge">{p.badge.toLowerCase()}</span>}
      </a>
      <div className="eco-body">
        {p.category && (
          <p className="eco-meta">
            <span className="eco-tag">{p.category}</span>
          </p>
        )}
        <h3 className="eco-pname">{p.name}</h3>
        {p.price && <p className="eco-price">{p.price}</p>}
        <OutLink href={p.url}>Comprar en TvGan</OutLink>
      </div>
    </article>
  );
}

/** Rejilla que muestra de a 24 productos, para no cargar cientos de fotos de una vez. */
function ProductGrid({ items }: { items: StoreProductDto[] }) {
  const [shown, setShown] = useState(24);
  // biome-ignore lint/correctness/useExhaustiveDependencies: al cambiar el listado se vuelve a empezar
  useEffect(() => setShown(24), [items]);
  return (
    <>
      <div className="eco-grid eco-products">
        {items.slice(0, shown).map((p) => (
          <ProductCard key={p.url} p={p} />
        ))}
      </div>
      {items.length > shown && (
        <button
          type="button"
          className="btn btn-ghost eco-more"
          onClick={() => setShown((n) => n + 48)}
        >
          Ver más productos ({items.length - shown} restantes)
        </button>
      )}
    </>
  );
}

const catalogLoader = (cat: string) => () => api.storeCatalog(cat || undefined);

export function TiendaScreen() {
  const { orgId, dataVersion } = useApp();
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<StoreSort>("tienda");
  const catalog = useRemote(`tienda.catalogo.${cat || "todo"}`, catalogLoader(cat));
  const cats = useRemote("tienda.categorias", async () => (await api.storeCategories()).items);
  const [low, setLow] = useState<SupplyOverview[]>([]);

  // Insumos por debajo del mínimo: atajos para buscar su reposición en el catálogo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    if (!orgId) return;
    void localdb
      .supplyOverview({ orgId })
      .then((all) =>
        setLow(
          all.filter((s) => {
            const st = statusOf(s);
            return st === "bajo_minimo" || (st === "sin_existencia" && s.minStock > 0);
          }),
        ),
      )
      .catch(() => setLow([]));
  }, [orgId, dataVersion]);

  const query = q.trim();

  return (
    <section className="page">
      <PageHead
        kicker={KICKER}
        icon={<ShoppingCart size={30} aria-hidden="true" />}
        title="Tienda TvGan"
        lead="Todo el catálogo de TvGan con el respaldo de FEDEGÁN: insumos, equipos y ganado. Elija aquí; el pago y el envío se hacen en TvGan."
        actions={
          <>
            <OutLink className="btn btn-primary" href={`${TVGAN}/shop/cart`}>
              Mi carrito
            </OutLink>
            <OutLink className="btn btn-ghost" href={`${TVGAN}/shop/category/ganado-179`}>
              Vender ganado
            </OutLink>
          </>
        }
      />

      <div className="card eco-filters">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="¿Qué necesita? Cerca, semilla, jeringa…"
          label="Buscar en el catálogo de TvGan"
        />
        <div className="eco-filter-row">
          <Picker
            label="Categoría"
            value={cat}
            options={(cats.data ?? []).map((c) => ({
              key: c.key,
              label: `${c.label} (${c.count})`,
            }))}
            onChange={setCat}
            allLabel="Todo el catálogo"
          />
          <Picker<StoreSort>
            label="Ordenar"
            value={sort}
            options={(Object.keys(SORT_LABEL) as StoreSort[]).map((k) => ({
              key: k,
              label: SORT_LABEL[k],
            }))}
            onChange={(k) => setSort(k || "tienda")}
          />
        </div>
      </div>

      {low.length > 0 && !query && (
        <article className="card eco-low">
          <h2>Para reponer en su finca</h2>
          <p className="hint">Insumos por debajo del mínimo en Compras e insumos.</p>
          <ul className="eco-lowlist">
            {low.slice(0, 6).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCat("");
                    setQ(storeTerm(s.name));
                  }}
                >
                  <span>{s.name}</span>
                  <span className="eco-lowgo">
                    Buscar <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}

      <RemoteState r={catalog} what="El catálogo de la tienda">
        {(data) => {
          const list = sortProducts(
            query ? data.items.filter((p) => matchesStore(p.name, query)) : data.items,
            sort,
          );
          return (
            <>
              <div className="eco-toolbar">
                <p className="eco-count">
                  {list.length === 1 ? "1 producto" : `${list.length} productos`}
                  {query ? ` con «${query}»` : ""}
                  {data.category ? ` en ${data.category}` : ""}
                  {!data.category && !query ? " publicados en TvGan" : ""}
                </p>
                {(query || cat) && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setQ("");
                      setCat("");
                    }}
                  >
                    Ver todo
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="empty">
                  No hay productos con «{query}»
                  {data.category ? ` en ${data.category}` : " en el catálogo"}.{" "}
                  <OutLink href={`${TVGAN}/shop?search=${encodeURIComponent(query)}`}>
                    Buscar en TvGan
                  </OutLink>{" "}
                  o pregunte por WhatsApp a sus asesores.
                </p>
              ) : (
                <ProductGrid items={list} />
              )}
            </>
          );
        }}
      </RemoteState>

      <article className="card eco-tv">
        <Tv size={22} aria-hidden="true" />
        <div>
          <h2>TvGan en vivo</h2>
          <p>Remates y programas ganaderos de lunes a viernes a las 6:00 p. m.</p>
        </div>
        <OutLink href={`${TVGAN}/website/social/youtube`}>Ver en YouTube</OutLink>
      </article>
    </section>
  );
}

/** Diálogo de Compras e insumos: busca en el catálogo de TvGan la reposición de un insumo. */
export function StoreDialog(props: { term: string; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const term = storeTerm(props.term);
  const catalog = useRemote("tienda.catalogo.todo", catalogLoader(""));
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="eco-sd"
    >
      <header className="dialog-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          ✕
        </button>
        <h2 id="eco-sd">Comprar en TvGan</h2>
      </header>
      <div className="dialog-body">
        <p className="hint">
          Productos de TvGan para «{term}». La compra se hace en TvGan; al recibir el producto
          regístrelo aquí con «Recibir».
        </p>
        <RemoteState r={catalog} what="El catálogo de la tienda">
          {(data) => {
            const list = data.items.filter((p) => matchesStore(p.name, term));
            return list.length === 0 ? (
              <p className="empty">
                TvGan no tiene «{term}» en su catálogo en línea.{" "}
                <OutLink href={`${TVGAN}/shop?search=${encodeURIComponent(term)}`}>
                  Buscar en TvGan
                </OutLink>{" "}
                o pregunte por WhatsApp a sus asesores.
              </p>
            ) : (
              <ProductGrid items={list} />
            );
          }}
        </RemoteState>
      </div>
    </dialog>
  );
}

/* ───────────── Comunidad de productores ───────────── */

export const TOPIC_LABEL: Record<CommunityTopic, string> = {
  experiencias: "Experiencias",
  sanidad: "Sanidad",
  reproduccion: "Reproducción",
  pasturas: "Pasturas",
  leche: "Leche",
  carne: "Carne",
  bufalos: "Búfalos",
  mercado: "Mercado y precios",
  tecnologia: "Tecnología",
};
const TOPICS = Object.keys(TOPIC_LABEL) as CommunityTopic[];

export function ComunidadScreen() {
  const { online, notify } = useApp();
  const [topic, setTopic] = useState<CommunityTopic | "">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CommunityPostDto[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick fuerza la recarga
  useEffect(() => {
    let alive = true;
    setError(null);
    api.communityList({ ...(topic ? { topic } : {}), ...(query ? { q: query } : {}) }).then(
      (r) => {
        if (!alive) return;
        setItems(r.items);
        setNext(r.nextBefore);
      },
      (e) => alive && setError(messageOf(e)),
    );
    return () => {
      alive = false;
    };
  }, [topic, query, tick]);

  const loadMore = async () => {
    if (!next) return;
    try {
      const r = await api.communityList({
        ...(topic ? { topic } : {}),
        ...(query ? { q: query } : {}),
        before: next,
      });
      setItems((cur) => [...(cur ?? []), ...r.items]);
      setNext(r.nextBefore);
    } catch (e) {
      notify(messageOf(e), "warn");
    }
  };

  if (open)
    return (
      <Thread
        id={open}
        onBack={() => {
          setOpen(null);
          setTick((t) => t + 1);
        }}
      />
    );

  return (
    <section className="page">
      <PageHead
        kicker={KICKER}
        icon={<MessagesSquare size={30} aria-hidden="true" />}
        title="Comunidad"
        lead="Pregunte y comparta lo que le ha funcionado con otros ganaderos del país."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!online}
            onClick={() => setWriting(true)}
          >
            <MessageCircle size={18} aria-hidden="true" /> Publicar
          </button>
        }
      />
      <p className="hint eco-hint">
        Se muestra su nombre y el departamento de su ganadería, nunca los datos de su finca. Para
        medicamentos y dosis, la última palabra es de su veterinario.
      </p>

      <div className="card eco-filters">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            if (!v) setQuery("");
          }}
          onSubmit={() => setQuery(q.trim().length >= 2 ? q.trim() : "")}
          placeholder="Buscar en la comunidad"
          label="Buscar en la comunidad"
        />
        <Picker<CommunityTopic>
          label="Tema"
          value={topic}
          options={TOPICS.map((t) => ({ key: t, label: TOPIC_LABEL[t] }))}
          onChange={setTopic}
          allLabel="Todos los temas"
        />
      </div>

      {!online && (
        <p className="banner banner-warn eco-banner">Sin señal: la comunidad necesita internet.</p>
      )}
      {error && online && (
        <p className="banner banner-warn eco-banner">
          {error}{" "}
          <button type="button" className="link" onClick={() => setTick((t) => t + 1)}>
            Reintentar
          </button>
        </p>
      )}
      {items === null && !error && <SkeletonGrid />}
      {items?.length === 0 && (
        <div className="empty eco-empty">
          <p>
            {query || topic
              ? "No hay publicaciones con ese filtro."
              : "Todavía no hay publicaciones. Sea el primero en preguntar o contar su experiencia."}
          </p>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="eco-posts">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" className="card eco-post" onClick={() => setOpen(p.id)}>
                <span className="eco-meta">
                  <span className="eco-tag">{TOPIC_LABEL[p.topic]}</span>
                  {p.authorName}
                  {p.region ? ` · ${p.region}` : ""} · {fechaHora(p.createdAt)}
                </span>
                <strong className="eco-title">{p.title}</strong>
                <span className="eco-text">
                  {p.body.length > 180 ? `${p.body.slice(0, 180)}…` : p.body}
                </span>
                <span className="eco-replies">
                  <MessageCircle size={14} aria-hidden="true" />{" "}
                  {p.replies === 1 ? "1 respuesta" : `${p.replies} respuestas`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <button type="button" className="btn btn-ghost eco-more" onClick={() => void loadMore()}>
          Ver más publicaciones
        </button>
      )}

      {writing && (
        <NewPostDialog
          {...(topic ? { topic } : {})}
          onClose={() => setWriting(false)}
          onDone={(p) => {
            setWriting(false);
            notify("Publicado en la comunidad.", "ok");
            setOpen(p.id);
          }}
        />
      )}
    </section>
  );
}

function NewPostDialog(props: {
  topic?: CommunityTopic;
  onClose(): void;
  onDone(p: CommunityPostDto): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [topic, setTopic] = useState<CommunityTopic>(props.topic ?? "experiencias");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const ok = title.trim().length >= 5 && body.trim().length >= 10;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      props.onDone(await api.communityPost({ topic, title: title.trim(), body: body.trim() }));
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="eco-np"
    >
      <form onSubmit={submit}>
        <header className="dialog-head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => ref.current?.close()}
          >
            ✕
          </button>
          <h2 id="eco-np">Nueva publicación</h2>
        </header>
        <div className="dialog-body eco-form">
          <label className="field">
            <span className="field-label">Tema</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value as CommunityTopic)}>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {TOPIC_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Título</span>
            <input
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: ¿Qué pasto les ha rendido en verano?"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Mensaje</span>
            <textarea
              value={body}
              rows={6}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Cuente su caso o su pregunta con detalle."
              required
            />
          </label>
          {error && (
            <p className="banner banner-warn" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ok || busy}>
            {busy ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Thread(props: { id: string; onBack(): void }) {
  const { notify, online } = useApp();
  const [t, setT] = useState<CommunityThreadDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.communityThread(props.id).then(setT, (e) => setError(messageOf(e)));
  }, [props.id]);
  useEffect(() => load(), [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (reply.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await api.communityReply(props.id, reply.trim());
      setT((cur) => (cur ? { ...cur, replies: [...cur.replies, r] } : cur));
      setReply("");
    } catch (err) {
      notify(messageOf(err), "warn");
    }
    setBusy(false);
  };

  const remove = async (kind: "post" | "reply", id: string) => {
    if (!confirm("¿Retirar esta publicación? Dejará de verse en la comunidad.")) return;
    try {
      await api.communityRemove(kind, id);
      if (kind === "post") props.onBack();
      else setT((cur) => (cur ? { ...cur, replies: cur.replies.filter((r) => r.id !== id) } : cur));
    } catch (err) {
      notify(messageOf(err), "warn");
    }
  };
  const report = async (kind: "post" | "reply", id: string) => {
    if (!confirm("¿Reportar este contenido como inapropiado?")) return;
    try {
      const r = await api.communityReport(kind, id);
      notify(
        r.hidden ? "Gracias. El contenido quedó oculto para revisión." : "Gracias por reportarlo.",
        "info",
      );
      if (r.hidden && kind === "post") props.onBack();
      else if (r.hidden) load();
    } catch (err) {
      notify(messageOf(err), "warn");
    }
  };

  return (
    <section className="page">
      <button type="button" className="btn btn-ghost btn-sm eco-back" onClick={props.onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Comunidad
      </button>
      {error && <p className="banner banner-warn eco-banner">{error}</p>}
      {!t && !error && <SkeletonGrid />}
      {t && (
        <>
          <article className="card eco-thread">
            <p className="eco-meta">
              <span className="eco-tag">{TOPIC_LABEL[t.post.topic]}</span>
              {t.post.authorName}
              {t.post.region ? ` · ${t.post.region}` : ""} · {fechaHora(t.post.createdAt)}
            </p>
            <h1 className="eco-ttitle">{t.post.title}</h1>
            <p className="eco-tbody">{t.post.body}</p>
            <ItemActions
              mine={t.post.mine}
              onRemove={() => void remove("post", t.post.id)}
              onReport={() => void report("post", t.post.id)}
            />
          </article>

          <h2 className="eco-h2">
            {t.replies.length === 0
              ? "Sin respuestas todavía"
              : t.replies.length === 1
                ? "1 respuesta"
                : `${t.replies.length} respuestas`}
          </h2>
          <ul className="eco-replies-list">
            {t.replies.map((r) => (
              <li key={r.id} className="card eco-reply">
                <p className="eco-meta">
                  {r.authorName} · {fechaHora(r.createdAt)}
                </p>
                <p className="eco-tbody">{r.body}</p>
                <ItemActions
                  mine={r.mine}
                  onRemove={() => void remove("reply", r.id)}
                  onReport={() => void report("reply", r.id)}
                />
              </li>
            ))}
          </ul>

          <form className="card eco-replyform" onSubmit={send}>
            <label className="field">
              <span className="field-label">Su respuesta</span>
              <textarea
                value={reply}
                rows={3}
                maxLength={3000}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Comparta lo que le ha funcionado."
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!online || busy || reply.trim().length < 2}
            >
              {busy ? "Enviando…" : "Responder"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function ItemActions(props: { mine: boolean; onRemove(): void; onReport(): void }) {
  return (
    <div className="eco-actions">
      {props.mine ? (
        <button type="button" className="link" onClick={props.onRemove}>
          <Trash2 size={14} aria-hidden="true" /> Retirar
        </button>
      ) : (
        <button type="button" className="link" onClick={props.onReport}>
          <Flag size={14} aria-hidden="true" /> Reportar
        </button>
      )}
    </div>
  );
}
