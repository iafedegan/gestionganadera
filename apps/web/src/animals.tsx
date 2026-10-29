import { type AnimalRegisterPayload, CommandEnvelope, type Species } from "@ganaderia/contracts";
import {
  type ParentRef,
  can,
  categoryMatchesSex,
  normalizeTag,
  uuidv7,
  validateRegistration,
} from "@ganaderia/domain";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
import { ApiError, api } from "./lib/api";
import { type AnimalDetail, type LocalAnimal, localdb } from "./lib/localdb";
import { useApp } from "./state";

type Farm = { id: string; code: string; name: string; species: string };

function useFarms() {
  const { orgId, dataVersion } = useApp();
  const [farms, setFarms] = useState<Farm[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.listFarms(orgId).then(setFarms);
  }, [orgId, dataVersion]);
  return farms;
}

export function AnimalsScreen() {
  const { orgId, role, online, dataVersion, lastSync } = useApp();
  const farms = useFarms();
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("");
  const [category, setCategory] = useState("");
  const [farmId, setFarmId] = useState("");
  const [rows, setRows] = useState<LocalAnimal[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [creatingFarm, setCreatingFarm] = useState(false);
  const [inv, setInv] = useState({ total: 0, bovino: 0, bufalino: 0 });

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

  return (
    <section>
      <p className="kicker">Animales</p>
      <h1>Animales e inventario del hato</h1>
      <p className="lead">
        Registro e inventario del hato, con historial individual y control de movimientos.
      </p>

      <div className="cards cards-compact">
        <article className="card">
          <p className="card-label">Inventario activo</p>
          <p className="figure">{num(inv.total)}</p>
          <p className="card-meta">
            animales · {num(inv.bovino)} bovinos, {num(inv.bufalino)} bufalinos
          </p>
          <p className="card-source">
            Fuente: registros de este dispositivo{lastSync ? "" : " · aún sin sincronizar"}
          </p>
        </article>
      </div>

      <div className="toolbar">
        <label className="grow">
          <span className="sr-only">Buscar por identificación</span>
          <input
            type="search"
            placeholder="Buscar por arete o identificación"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
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
      </div>

      <div className="actions">
        {canRegister && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={farms.length === 0}
            onClick={() => setRegistering(true)}
          >
            Registrar animal
          </button>
        )}
        {canCreateFarm && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!online}
            title={online ? undefined : "Crear fincas requiere conexión"}
            onClick={() => setCreatingFarm(true)}
          >
            Nueva finca
          </button>
        )}
        {!online && canCreateFarm && (
          <small className="hint">Crear fincas requiere conexión.</small>
        )}
      </div>

      {farms.length === 0 && (
        <p className="empty">
          Este dispositivo aún no tiene fincas. Conéctese y sincronice para descargar las fincas
          autorizadas
          {canCreateFarm ? " o cree una nueva." : "."}
        </p>
      )}

      <div className="split">
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Animales</caption>
            <thead>
              <tr>
                <th scope="col">Identificación</th>
                <th scope="col">Especie</th>
                <th scope="col">Categoría</th>
                <th scope="col">Finca</th>
                <th scope="col">Estado</th>
                <th scope="col">Sincronización</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.id === selected ? "selected" : ""}>
                  <th scope="row" className="mono">
                    <button type="button" className="row-btn" onClick={() => setSelected(r.id)}>
                      {r.tag}
                    </button>
                  </th>
                  <td>{SPECIES_LABEL[r.species]}</td>
                  <td>{CATEGORY_LABEL[r.category]}</td>
                  <td>{farmName(r.farmId)}</td>
                  <td>{STATUS_LABEL[r.status]}</td>
                  <td>
                    <span className={`chip chip-${r.syncState}`}>{SYNC_LABEL[r.syncState]}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    {q || species || category || farmId
                      ? "Ningún animal coincide con los filtros."
                      : "Todavía no hay animales registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <AnimalCard id={selected} farmName={farmName} />
      </div>

      {registering && <RegisterDialog onClose={() => setRegistering(false)} />}
      {creatingFarm && <FarmDialog onClose={() => setCreatingFarm(false)} />}
    </section>
  );
}

function AnimalCard({ id, farmName }: { id: string | null; farmName(id: string): string }) {
  const { dataVersion } = useApp();
  const [a, setA] = useState<AnimalDetail | null>(null);
  const [mother, setMother] = useState<string>("Desconocida");
  const [father, setFather] = useState<string>("Desconocido");

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
        d?.motherId
          ? ((await localdb.getAnimal(d.motherId))?.tag ?? "No descargada")
          : "Desconocida",
      );
      setFather(
        d?.fatherId
          ? ((await localdb.getAnimal(d.fatherId))?.tag ?? "No descargado")
          : "Desconocido",
      );
    })();
  }, [id, dataVersion]);

  if (!a) {
    return (
      <aside className="card sheet">
        <h2>Ficha del animal</h2>
        <p className="empty">Seleccione un animal para ver su ficha.</p>
      </aside>
    );
  }
  return (
    <aside className="card sheet" aria-label="Ficha del animal">
      <h2>Ficha del animal</h2>
      <p className="figure mono">{a.tag}</p>
      <span className={`chip chip-${a.syncState}`}>{SYNC_LABEL[a.syncState]}</span>
      <dl className="kv">
        <dt>Especie</dt>
        <dd>{SPECIES_LABEL[a.species]}</dd>
        <dt>Sexo</dt>
        <dd>{SEX_LABEL[a.sex]}</dd>
        <dt>Categoría</dt>
        <dd>{CATEGORY_LABEL[a.category]}</dd>
        <dt>Finca</dt>
        <dd>{farmName(a.farmId)}</dd>
        <dt>Estado</dt>
        <dd>{STATUS_LABEL[a.status]}</dd>
        <dt>Nacimiento</dt>
        <dd>
          {a.birthDate ? `${fecha(a.birthDate.date)} (${a.birthDate.precision})` : "No registrado"}
        </dd>
        <dt>Madre</dt>
        <dd className="mono">{mother}</dd>
        <dt>Padre</dt>
        <dd className="mono">{father}</dd>
      </dl>
      <h3>Historia individual</h3>
      {a.entry ? (
        <ul className="timeline">
          <li>
            <strong>{REASON_LABEL[a.entry.reason]}</strong>
            <span>{fecha(a.entry.occurredAt)}</span>
            {a.entry.origin && <small>Procedencia: {a.entry.origin}</small>}
          </li>
        </ul>
      ) : (
        <p className="empty">Sin eventos.</p>
      )}
      {a.notes && <p className="hint">{a.notes}</p>}
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
  const { orgId, refresh, syncNow, online } = useApp();
  const farms = useFarms();
  const ref = useRef<HTMLDialogElement>(null);
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
  }, []);

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
    const parsed = CommandEnvelope.safeParse(command);
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
      close();
      if (online) void syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={props.onClose} aria-labelledby="reg-title">
      <form onSubmit={submit}>
        <h2 id="reg-title">{init ? "Corregir y reenviar animal" : "Registrar animal"}</h2>
        <div className="grid">
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
          <label>
            Arete o identificación visible
            <input
              required
              maxLength={40}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="mono"
            />
          </label>
          <label>
            Especie
            <select
              value={species}
              onChange={(e) => {
                setSpecies(e.target.value as Species);
                setMotherId("");
                setFatherId("");
              }}
            >
              <option value="bovino">Bovino</option>
              <option value="bufalino">Bufalino</option>
            </select>
          </label>
          <label>
            Sexo
            <select value={sex} onChange={(e) => changeSex(e.target.value as "hembra" | "macho")}>
              <option value="hembra">Hembra</option>
              <option value="macho">Macho</option>
            </select>
          </label>
          <label>
            Categoría
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo de entrada
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(REASON_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
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
          <label>
            Procedencia (opcional)
            <input maxLength={120} value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </label>
          <label>
            Fecha de nacimiento (opcional)
            <input
              type="date"
              max={todayLocal()}
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </label>
          <label>
            Precisión de la fecha
            <select
              value={precision}
              disabled={!birth}
              onChange={(e) => setPrecision(e.target.value as "exacta" | "estimada")}
            >
              <option value="exacta">Exacta</option>
              <option value="estimada">Estimada</option>
            </select>
          </label>
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
        </div>
        <label>
          Observaciones (opcional)
          <textarea
            maxLength={500}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p className="hint">
          {online
            ? "Se guardará en este dispositivo y se enviará al servidor."
            : "Sin conexión: se guardará en este dispositivo y se enviará al reconectar."}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>
    </dialog>
  );
}

function FarmDialog({ onClose }: { onClose(): void }) {
  const { orgId, syncNow } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [bovino, setBovino] = useState(true);
  const [bufalino, setBufalino] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function close() {
    ref.current?.close();
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const speciesPresent: Species[] = [
      ...(bovino ? (["bovino"] as const) : []),
      ...(bufalino ? (["bufalino"] as const) : []),
    ];
    if (speciesPresent.length === 0) {
      setError("Seleccione al menos una especie.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createFarm({
        organizationId: orgId,
        code,
        name,
        speciesPresent,
        ...(location.trim() ? { locationText: location.trim() } : {}),
      });
      await syncNow();
      close();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo crear la finca. Verifique la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="farm-title">
      <form onSubmit={submit}>
        <h2 id="farm-title">Nueva finca</h2>
        <div className="grid">
          <label>
            Código
            <input
              required
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mono"
            />
          </label>
          <label>
            Nombre
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <label>
          Ubicación (texto)
          <input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <fieldset>
          <legend>Especies presentes</legend>
          <label className="check">
            <input type="checkbox" checked={bovino} onChange={(e) => setBovino(e.target.checked)} />{" "}
            Bovinos
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={bufalino}
              onChange={(e) => setBufalino(e.target.checked)}
            />{" "}
            Bufalinos
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Crear finca
          </button>
        </div>
      </form>
    </dialog>
  );
}
