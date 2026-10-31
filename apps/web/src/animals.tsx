import { AnimalCommand, type AnimalRegisterPayload, type Species } from "@ganaderia/contracts";
import {
  type ParentRef,
  can,
  categoryMatchesSex,
  normalizeTag,
  uuidv7,
  validateRegistration,
} from "@ganaderia/domain";
import {
  Baby,
  Building2,
  CalendarCheck,
  CalendarDays,
  Cloud,
  CloudOff,
  FileText,
  Fingerprint,
  GitBranch,
  History,
  Layers,
  Nfc,
  PawPrint,
  PlusCircle,
  QrCode,
  Scale,
  Scan,
  Search,
  SlidersHorizontal,
  Upload,
  Weight,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { FarmDialog } from "./FarmForm";
import { art } from "./art";
import { PageHead } from "./components";
import {
  CATEGORY_LABEL,
  REASON_LABEL,
  SEX_LABEL,
  SPECIES_LABEL,
  STATUS_LABEL,
  SYNC_LABEL,
  fecha,
  num,
  todayLocal,
} from "./labels";
import { type AnimalDetail, type LocalAnimal, type LocalFarm, localdb } from "./lib/localdb";
import { detectCapabilities, scanNfc } from "./lib/reader";
import { useMedia, useSwipeDismiss } from "./native";
import { useApp } from "./state";

export function useFarms() {
  const { orgId, dataVersion } = useApp();
  const [farms, setFarms] = useState<LocalFarm[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.listFarms(orgId).then(setFarms);
  }, [orgId, dataVersion]);
  return farms;
}

/** Marca de especie: círculo con la inicial; color distinto por especie, nunca solo color. */
function SpeciesBadge({ species, size = 36 }: { species: string; size?: number }) {
  return (
    <span
      className={`sp-badge sp-${species}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {species === "bufalino" ? "Bu" : "Bo"}
    </span>
  );
}

function SyncChip({ state }: { state: LocalAnimal["syncState"] }) {
  const Icon = state === "sincronizado" ? Cloud : state === "pendiente" ? CloudOff : Scan;
  return (
    <span className={`chip chip-${state}`}>
      <Icon size={12} aria-hidden="true" /> {SYNC_LABEL[state]}
    </span>
  );
}

export function AnimalsScreen() {
  const { orgId, role, online, dataVersion, lastSync, counts } = useApp();
  const farms = useFarms();
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("");
  const [category, setCategory] = useState("");
  const [farmId, setFarmId] = useState("");
  const [rows, setRows] = useState<LocalAnimal[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [creatingFarm, setCreatingFarm] = useState(false);
  const [inv, setInv] = useState({ total: 0, bovino: 0, bufalino: 0 });
  const wide = useMedia("(min-width: 1440px)");
  const mobile = useMedia("(max-width: 900px)");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSwipe = useSwipeDismiss<HTMLElement>(() => setFiltersOpen(false));

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb
      .listAnimals({
        orgId,
        ...(q ? { q } : {}),
        ...(species ? { species } : {}),
        ...(category ? { category } : {}),
        ...(farmId ? { farmId } : {}),
      })
      .then(setRows);
    void localdb.counts(orgId).then(setInv);
  }, [orgId, q, species, category, farmId, dataVersion]);

  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? "—";
  const canRegister = role !== null && can(role, "animal.write");
  const canCreateFarm = role !== null && can(role, "farm.write");
  const filtered = Boolean(q || species || category || farmId);
  const activeFilters = [species, category, farmId].filter(Boolean).length;
  const source = `Fuente: registros de este dispositivo${lastSync ? "" : " · aún sin sincronizar"}`;

  return (
    <section className="page">
      <PageHead
        kicker="Animales"
        icon={<PawPrint size={30} aria-hidden="true" />}
        title="Animales e inventario del hato"
        lead="Registro e inventario del hato, con historial individual y control de movimientos."
        actions={
          <span className="qr-chip">
            <QrCode size={26} aria-hidden="true" />
            <span>
              <strong>Lectura QR o RFID</strong>
              <small>cuando esté disponible</small>
            </span>
          </span>
        }
      />

      <section className="statstrip" aria-label="Resumen del inventario">
        <div>
          <strong>{num(inv.total)}</strong>
          <span>Activos</span>
        </div>
        <div>
          <strong>{num(inv.bovino)}</strong>
          <span>Bovinos</span>
        </div>
        <div>
          <strong>{num(inv.bufalino)}</strong>
          <span>Bufalinos</span>
        </div>
      </section>

      <div className="summary-chips" aria-label="Resumen del inventario">
        <span className="sc">
          <Weight size={16} aria-hidden="true" /> Inventario activo{" "}
          <strong>{num(inv.total)}</strong>
        </span>
        <span className="sc">
          <SpeciesBadge species="bovino" size={22} /> Bovinos <strong>{num(inv.bovino)}</strong>
        </span>
        <span className="sc">
          <SpeciesBadge species="bufalino" size={22} /> Bufalinos{" "}
          <strong>{num(inv.bufalino)}</strong>
        </span>
        {counts.pendiente > 0 && (
          <span className="sc sc-warn">
            <CloudOff size={16} aria-hidden="true" /> {counts.pendiente} sin enviar
          </span>
        )}
        <small className="sc-src">{source}</small>
      </div>

      {farms.length === 0 && (
        <div className="banner banner-info">
          <Building2 size={18} aria-hidden="true" />
          <span>
            Este dispositivo aún no tiene fincas. Conéctese y sincronice para descargar las fincas
            autorizadas{canCreateFarm ? ", o cree una nueva." : "."}
          </span>
          {canCreateFarm && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!online}
              onClick={() => setCreatingFarm(true)}
            >
              Nueva finca
            </button>
          )}
        </div>
      )}

      <div className="card filters">
        <label className="search grow">
          <span className="sr-only">Buscar por identificación</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por arete o identificación"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {mobile ? (
          <button
            type="button"
            className="btn btn-ghost filter-btn"
            aria-label={`Filtros${activeFilters ? `, ${activeFilters} activos` : ""}`}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            {activeFilters > 0 && <span className="dot dot-inline">{activeFilters}</span>}
          </button>
        ) : (
          <>
            <label>
              Especie
              <select value={species} onChange={(e) => setSpecies(e.target.value)}>
                <option value="">Todas</option>
                <option value="bovino">Bovino</option>
                <option value="bufalino">Bufalino</option>
              </select>
            </label>
            <label>
              Categoría
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finca
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">Todas</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {!mobile && canCreateFarm && farms.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!online}
            title={online ? undefined : "Crear fincas requiere conexión"}
            onClick={() => setCreatingFarm(true)}
          >
            <Building2 size={16} aria-hidden="true" /> Nueva finca
          </button>
        )}
      </div>

      <div className="action-row">
        {canRegister && (
          <button
            type="button"
            className="btn btn-green"
            disabled={farms.length === 0}
            onClick={() => setRegistering(true)}
          >
            <PlusCircle size={20} aria-hidden="true" /> Registrar animal
          </button>
        )}
        <button type="button" className="btn btn-ghost" disabled title="Disponible en la semana 12">
          <Upload size={20} aria-hidden="true" /> Importar datos
        </button>
        <button type="button" className="btn btn-ghost" disabled title="Disponible en la semana 6">
          <Scale size={20} aria-hidden="true" /> Iniciar pesaje
        </button>
      </div>

      <div className={wide ? "split" : undefined}>
        <div className="card table-card">
          {rows === null ? (
            <div className="skeleton-list" aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <Search size={28} aria-hidden="true" />
              <p>
                {filtered
                  ? "Ningún animal coincide con los filtros."
                  : "Todavía no hay animales registrados."}
              </p>
              {!filtered && canRegister && farms.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setRegistering(true)}
                >
                  <PlusCircle size={18} aria-hidden="true" /> Registrar el primero
                </button>
              )}
            </div>
          ) : (
            <table>
              <caption className="sr-only">Animales</caption>
              <thead>
                <tr>
                  <th scope="col">Identificación</th>
                  <th scope="col">Especie</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Ubicación</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === selected ? "selected" : ""}>
                    <th scope="row">
                      <button type="button" className="row-btn" onClick={() => setSelected(r.id)}>
                        <SpeciesBadge species={r.species} />
                        <span className="row-main">
                          <span className="mono">{r.tag}</span>
                          <span className="row-sub">
                            {SPECIES_LABEL[r.species]} · {CATEGORY_LABEL[r.category]} ·{" "}
                            {farmName(r.farmId)}
                          </span>
                        </span>
                      </button>
                    </th>
                    <td data-label="Especie" className="col-x">
                      {SPECIES_LABEL[r.species]}
                    </td>
                    <td data-label="Categoría" className="col-x">
                      {CATEGORY_LABEL[r.category]}
                    </td>
                    <td data-label="Ubicación" className="col-x">
                      {farmName(r.farmId)}
                    </td>
                    <td data-label="Estado" className="col-state">
                      <span className="status">
                        <span className={`dot dot-${r.status}`} />
                        {STATUS_LABEL[r.status]}
                      </span>
                      <SyncChip state={r.syncState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {wide ? (
          <div className="side-col">
            <AnimalCard id={selected} farmName={farmName} />
            <SessionCard />
          </div>
        ) : (
          selected && (
            <>
              <button
                type="button"
                className="backdrop"
                aria-label="Cerrar ficha"
                tabIndex={-1}
                onClick={() => setSelected(null)}
              />
              <AnimalCard id={selected} farmName={farmName} onClose={() => setSelected(null)} />
            </>
          )
        )}
      </div>

      {mobile && canRegister && farms.length > 0 && (
        <button type="button" className="fab" onClick={() => setRegistering(true)}>
          <PlusCircle size={22} aria-hidden="true" />
          <span>Registrar</span>
        </button>
      )}

      {mobile && filtersOpen && (
        <>
          <button
            type="button"
            className="backdrop"
            aria-label="Cerrar filtros"
            tabIndex={-1}
            onClick={() => setFiltersOpen(false)}
          />
          <aside
            className="sheet-panel filter-sheet"
            aria-label="Filtros"
            ref={filterSwipe.ref}
            {...filterSwipe.bind}
          >
            <span className="grabber" aria-hidden="true" />
            <div className="drawer-head">
              <h2>Filtros</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => setFiltersOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Especie
              <select value={species} onChange={(e) => setSpecies(e.target.value)}>
                <option value="">Todas</option>
                <option value="bovino">Bovino</option>
                <option value="bufalino">Bufalino</option>
              </select>
            </label>
            <label>
              Categoría
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finca
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">Todas</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSpecies("");
                  setCategory("");
                  setFarmId("");
                }}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFiltersOpen(false)}
              >
                Ver resultados
              </button>
            </div>
          </aside>
        </>
      )}

      {registering && <RegisterDialog onClose={() => setRegistering(false)} />}
      {creatingFarm && <FarmDialog onClose={() => setCreatingFarm(false)} />}
    </section>
  );
}

/** Sesión de manejo: función futura (pesajes y jornadas); se muestra su espacio sin cifras inventadas. */
function SessionCard() {
  return (
    <section className="card session" aria-label="Sesión de manejo">
      <header className="session-head">
        <CalendarCheck size={22} aria-hidden="true" />
        <h2>Sesión de manejo</h2>
        <span className="chip chip-soon">Semana 6</span>
      </header>
      <div className="session-stats">
        <div>
          <small>Animales previstos</small>
          <strong>—</strong>
        </div>
        <div>
          <small>Animales atendidos</small>
          <strong>—</strong>
        </div>
        <div>
          <small>Pendientes</small>
          <strong>—</strong>
        </div>
        <button type="button" className="btn btn-primary" disabled>
          Confirmar jornada
        </button>
      </div>
    </section>
  );
}

type Tab = "genealogia" | "movimientos" | "pesos" | "documentos";
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "genealogia", label: "Genealogía", icon: <GitBranch size={15} aria-hidden="true" /> },
  { key: "movimientos", label: "Movimientos", icon: <History size={15} aria-hidden="true" /> },
  { key: "pesos", label: "Pesos", icon: <Scale size={15} aria-hidden="true" /> },
  { key: "documentos", label: "Documentos", icon: <FileText size={15} aria-hidden="true" /> },
];

function Parent({ label, tag }: { label: string; tag: string | null }) {
  return (
    <div className={tag ? "tree-node" : "tree-node unknown"}>
      <small>{label}</small>
      <strong className="mono">{tag ?? "Desconocido"}</strong>
    </div>
  );
}

function AnimalCard({
  id,
  farmName,
  onClose,
}: {
  id: string | null;
  farmName(id: string): string;
  onClose?: () => void;
}) {
  const { dataVersion } = useApp();
  const [a, setA] = useState<AnimalDetail | null>(null);
  const [mother, setMother] = useState<string | null>(null);
  const [father, setFather] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("genealogia");
  const swipe = useSwipeDismiss<HTMLElement>(() => onClose?.());

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    if (!id) {
      setA(null);
      return;
    }
    void (async () => {
      const d = await localdb.getAnimal(id);
      setA(d);
      setMother(
        d?.motherId ? ((await localdb.getAnimal(d.motherId))?.tag ?? "No descargada") : null,
      );
      setFather(
        d?.fatherId ? ((await localdb.getAnimal(d.fatherId))?.tag ?? "No descargado") : null,
      );
    })();
  }, [id, dataVersion]);

  if (!a) {
    return (
      <aside className="card sheet">
        <div className="empty-state">
          <Search size={28} aria-hidden="true" />
          <h2>Ficha del animal</h2>
          <p>Seleccione un animal de la lista para ver su ficha e historia individual.</p>
        </div>
      </aside>
    );
  }
  return (
    <aside
      className={onClose ? "drawer sheet-drawer" : "card sheet"}
      aria-label="Ficha del animal"
      ref={swipe.ref}
      {...(onClose ? swipe.bind : {})}
    >
      {onClose && (
        <button
          type="button"
          className="icon-btn drawer-close"
          aria-label="Cerrar ficha"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      )}
      <header className="sheet-title">
        <h2>Ficha del animal</h2>
        <span className="status status-pill">
          <span className={`dot dot-${a.status}`} />
          {STATUS_LABEL[a.status]}
        </span>
      </header>
      <div className="sheet-hero">
        <div className={`photo photo-${a.species}`}>
          <img src={art(a.species === "bufalino" ? "ficha-buffalo" : "ficha-cow")} alt="" />
        </div>
        <div className="hero-facts">
          <p className="card-label">Identificación</p>
          <p className="sheet-tag mono">{a.tag}</p>
          <SyncChip state={a.syncState} />
          <dl className="facts">
            <div>
              <dt>Especie</dt>
              <dd>{SPECIES_LABEL[a.species]}</dd>
            </div>
            <div>
              <dt>Ubicación actual</dt>
              <dd>{farmName(a.farmId)}</dd>
            </div>
            <div>
              <dt>Categoría</dt>
              <dd>{CATEGORY_LABEL[a.category]}</dd>
            </div>
            <div>
              <dt>Sexo</dt>
              <dd>{SEX_LABEL[a.sex]}</dd>
            </div>
          </dl>
        </div>
      </div>
      <h3 className="hist-title">Historia individual</h3>
      <div className="tabs" role="tablist" aria-label="Historia individual">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="tabpanel"
            className={tab === t.key ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
        {tab === "genealogia" && (
          <div className="tree">
            <div className="tree-parents">
              <Parent label="Padre" tag={father} />
              <Parent label="Madre" tag={mother} />
            </div>
            <div className="tree-stem" aria-hidden="true" />
            <div className="tree-node self">
              <small>Este animal</small>
              <strong className="mono">{a.tag}</strong>
            </div>
            {!mother && !father && (
              <p className="hint">Ascendencia desconocida: no se completa con datos ficticios.</p>
            )}
          </div>
        )}
        {tab === "movimientos" &&
          (a.entry ? (
            <ul className="timeline">
              <li>
                <span className="tl-dot" aria-hidden="true">
                  <Baby size={14} />
                </span>
                <div>
                  <strong>Ingreso a la finca · {REASON_LABEL[a.entry.reason]}</strong>
                  <span>{fecha(a.entry.occurredAt)}</span>
                  {a.entry.origin && <small>Procedencia: {a.entry.origin}</small>}
                </div>
              </li>
            </ul>
          ) : (
            <p className="empty">Sin movimientos registrados.</p>
          ))}
        {tab === "pesos" && (
          <div className="empty-state">
            <Scale size={26} aria-hidden="true" />
            <p>Los pesajes medidos y estimados aparecerán aquí.</p>
            <span className="chip chip-soon">Semana 6</span>
          </div>
        )}
        {tab === "documentos" && (
          <div className="empty-state">
            <FileText size={26} aria-hidden="true" />
            <p>Fotos de hierros y soportes del animal (imágenes y PDF hasta 10 MB).</p>
            <span className="chip chip-soon">Semana 12</span>
          </div>
        )}
      </div>
      {a.notes && <p className="hint">Observaciones: {a.notes}</p>}
    </aside>
  );
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[];

export function RegisterDialog(props: {
  onClose(): void;
  /** Datos de un registro rechazado o en conflicto que se está corrigiendo. */
  initial?: AnimalRegisterPayload;
  replaceCommandId?: string;
}) {
  const { orgId, refresh, syncNow, online, notify } = useApp();
  const farms = useFarms();
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const [caps] = useState(detectCapabilities);
  const [reading, setReading] = useState(false);

  async function readChip() {
    const ac = new AbortController();
    setReading(true);
    try {
      setTag((await scanNfc(ac.signal)).code);
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify("No se pudo leer la etiqueta.", "warn");
    } finally {
      ac.abort();
      setReading(false);
    }
  }
  const another = useRef(false);
  const init = props.initial;

  const [farmId, setFarmId] = useState(init?.farmId ?? "");
  const [tag, setTag] = useState(init?.tag ?? "");
  const [species, setSpecies] = useState<Species>(init?.species ?? "bovino");
  const [sex, setSex] = useState<"hembra" | "macho">(init?.sex ?? "hembra");
  const [category, setCategory] = useState<string>(init?.category ?? "vaca");
  const [birth, setBirth] = useState(init?.birthDate?.date ?? "");
  const [precision, setPrecision] = useState<"exacta" | "estimada">(
    init?.birthDate?.precision ?? "exacta",
  );
  const [motherId, setMotherId] = useState(init?.motherId ?? "");
  const [fatherId, setFatherId] = useState(init?.fatherId ?? "");
  const [reason, setReason] = useState<string>(init?.entry.reason ?? "inventario_inicial");
  const [entryDate, setEntryDate] = useState(init?.entry.occurredAt ?? todayLocal());
  const [origin, setOrigin] = useState(init?.entry.origin ?? "");
  const [notes, setNotes] = useState(init?.notes ?? "");
  const [parents, setParents] = useState<LocalAnimal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    if (!init) tagRef.current?.focus();
  }, [init]);

  useEffect(() => {
    if (!farmId && farms.length === 1 && farms[0]) setFarmId(farms[0].id);
  }, [farms, farmId]);

  useEffect(() => {
    void localdb.listAnimals({ orgId, species, limit: 500 }).then(setParents);
  }, [orgId, species]);

  const mothers = parents.filter((p) => p.sex === "hembra" && p.id !== init?.id);
  const fathers = parents.filter((p) => p.sex === "macho" && p.id !== init?.id);
  const cats = CATEGORIES.filter((c) => categoryMatchesSex(c, sex));

  function changeSex(s: "hembra" | "macho") {
    setSex(s);
    if (!categoryMatchesSex(category, s)) setCategory(s === "hembra" ? "vaca" : "toro");
  }

  function close() {
    ref.current?.close();
    props.onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const again = another.current;
    another.current = false;
    setError(null);
    const payload: AnimalRegisterPayload = {
      id: init?.id ?? uuidv7(),
      farmId,
      tag: normalizeTag(tag),
      species,
      sex,
      category: category as AnimalRegisterPayload["category"],
      entry: {
        reason: reason as AnimalRegisterPayload["entry"]["reason"],
        occurredAt: entryDate,
        ...(origin.trim() ? { origin: origin.trim() } : {}),
      },
      ...(birth ? { birthDate: { date: birth, precision } } : {}),
      ...(motherId ? { motherId } : {}),
      ...(fatherId ? { fatherId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const command = {
      id: uuidv7(),
      type: "animal.register" as const,
      clientTs: new Date().toISOString(),
      payload,
    };
    const parsed = AnimalCommand.safeParse(command);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise los datos del formulario.");
      return;
    }
    const ref_ = (id: string): ParentRef | undefined => {
      const p = parents.find((x) => x.id === id);
      return p
        ? { id: p.id, species: p.species as Species, sex: p.sex as "hembra" | "macho" }
        : undefined;
    };
    const issues = validateRegistration(payload, {
      today: todayLocal(),
      mother: motherId ? ref_(motherId) : undefined,
      father: fatherId ? ref_(fatherId) : undefined,
    });
    if (issues[0]) {
      setError(issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (props.replaceCommandId) await localdb.outboxDiscard(props.replaceCommandId);
      const res = await localdb.enqueueRegister({ orgId, command: parsed.data });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await refresh();
      notify(
        online
          ? `Animal ${payload.tag} guardado. Enviando al servidor…`
          : `Animal ${payload.tag} guardado en este dispositivo. Se enviará al reconectar.`,
      );
      if ("vibrate" in navigator) navigator.vibrate(30);
      if (online) void syncNow();
      if (again) {
        // Carga rápida de inventario: se conservan finca, especie, categoría y fechas.
        setTag("");
        setMotherId("");
        setFatherId("");
        tagRef.current?.focus();
      } else {
        close();
      }
    } finally {
      setBusy(false);
    }
  }

  const farmOne = farms.length === 1 ? farms[0] : undefined;

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="reg-title"
    >
      <form onSubmit={(e) => void submit(e)} ref={formRef}>
        <header className="dialog-head">
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={22} />
          </button>
          <h2 id="reg-title">{init ? "Corregir y reenviar" : "Registrar animal"}</h2>
          {!online && <span className="pill pill-warn">Sin conexión</span>}
        </header>

        <div className="dialog-body">
          <section className="fsec">
            <h3 className="fsec-t">
              <Fingerprint size={18} aria-hidden="true" /> Identificación
            </h3>
            {farmOne ? (
              <p className="farm-chip">
                <Building2 size={16} aria-hidden="true" /> {farmOne.name}
              </p>
            ) : (
              <label>
                Finca
                <select required value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                  <option value="" disabled>
                    Seleccione
                  </option>
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Arete o identificación visible
              <input
                ref={tagRef}
                required
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                maxLength={40}
                placeholder="Ej. BOV-014"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="mono input-lg"
                onKeyDown={(e) => {
                  // El bastón RFID termina con Enter: no debe enviar el formulario a medias.
                  if (e.key === "Enter" && tag) e.preventDefault();
                }}
              />
              {caps.nfc && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={reading}
                  onClick={() => void readChip()}
                >
                  <Nfc size={16} aria-hidden="true" />{" "}
                  {reading ? "Acerque la etiqueta…" : "Leer chip"}
                </button>
              )}
            </label>

            <Segmented
              legend="Especie"
              value={species}
              onChange={(v) => {
                setSpecies(v);
                setMotherId("");
                setFatherId("");
              }}
              options={[
                { value: "bovino", label: "Bovino" },
                { value: "bufalino", label: "Bufalino" },
              ]}
            />
          </section>
          <section className="fsec">
            <h3 className="fsec-t">
              <Layers size={18} aria-hidden="true" /> Clasificación
            </h3>
            <Segmented
              legend="Sexo"
              value={sex}
              onChange={changeSex}
              options={[
                { value: "hembra", label: "Hembra" },
                { value: "macho", label: "Macho" },
              ]}
            />
            <Segmented
              legend="Categoría"
              value={category}
              onChange={setCategory}
              wrap
              options={cats.map((c) => ({ value: c, label: CATEGORY_LABEL[c] ?? c }))}
            />
          </section>
          <section className="fsec">
            <h3 className="fsec-t">
              <CalendarDays size={18} aria-hidden="true" /> Entrada al hato
            </h3>
            <Segmented
              legend="Motivo de entrada"
              value={reason}
              onChange={setReason}
              wrap
              options={Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <label>
              Fecha de entrada
              <input
                type="date"
                required
                max={todayLocal()}
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </label>
          </section>

          <details
            className="more"
            open={Boolean(init?.birthDate || init?.motherId || init?.notes)}
          >
            <summary>Más datos (opcional)</summary>
            <div className="more-body">
              <label>
                Fecha de nacimiento
                <input
                  type="date"
                  max={todayLocal()}
                  value={birth}
                  onChange={(e) => setBirth(e.target.value)}
                />
              </label>
              {birth && (
                <Segmented
                  legend="Precisión de la fecha"
                  value={precision}
                  onChange={(v) => setPrecision(v as "exacta" | "estimada")}
                  options={[
                    { value: "exacta", label: "Exacta" },
                    { value: "estimada", label: "Estimada" },
                  ]}
                />
              )}
              <label>
                Madre (si se conoce)
                <select value={motherId} onChange={(e) => setMotherId(e.target.value)}>
                  <option value="">Desconocida</option>
                  {mothers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Padre (si se conoce)
                <select value={fatherId} onChange={(e) => setFatherId(e.target.value)}>
                  <option value="">Desconocido</option>
                  {fathers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Procedencia
                <input maxLength={120} value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </label>
              <label>
                Observaciones
                <textarea
                  maxLength={500}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </details>

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>

        <div className="dialog-actions">
          {!init && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                another.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              Guardar y otro
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function Segmented<T extends string>(props: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  wrap?: boolean;
}) {
  return (
    <fieldset className="seg">
      <legend>{props.legend}</legend>
      <div className={props.wrap ? "seg-row wrap" : "seg-row"}>
        {props.options.map((o) => (
          <label key={o.value} className={props.value === o.value ? "seg-opt on" : "seg-opt"}>
            <input
              type="radio"
              name={props.legend}
              value={o.value}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
