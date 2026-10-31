import type {
  AreaUnit,
  FarmCreate,
  ProductionFocus,
  ProductionSystem,
  Species,
} from "@ganaderia/contracts";
import { can, estimatedLoad, fromHectares, toHectares } from "@ganaderia/domain";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Building2, Crosshair, Pencil, Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useFarms } from "./animals";
import { CardHead } from "./components";
import { PARAMS } from "./herd";
import { num } from "./kit";
import { SPECIES_LABEL } from "./labels";
import { ApiError, api } from "./lib/api";
import { type LocalFarm, localdb } from "./lib/localdb";
import { useApp } from "./state";

const FOCUS: { value: ProductionFocus; label: string }[] = [
  { value: "leche", label: "Leche" },
  { value: "carne", label: "Carne" },
  { value: "doble_proposito", label: "Doble propósito" },
];
const SYSTEM: { value: ProductionSystem; label: string }[] = [
  { value: "cria", label: "Cría" },
  { value: "levante", label: "Levante" },
  { value: "ceba", label: "Ceba" },
  { value: "ciclo_completo", label: "Ciclo completo" },
  { value: "puro", label: "Ganado puro" },
  { value: "bravura", label: "Bravura" },
];
const UNITS: { value: AreaUnit; label: string; plural: string }[] = [
  { value: "ha", label: "Hectárea", plural: "ha" },
  { value: "fanegada", label: "Fanegada (6.400 m²)", plural: "fanegadas" },
  { value: "cuadra", label: "Cuadra (6.400 m²)", plural: "cuadras" },
  { value: "acre", label: "Acre", plural: "acres" },
];
const ALL_SPECIES: Species[] = ["bovino", "bufalino"];
const DEFAULT_WEANING_MONTHS = 8;

const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | null) =>
  list.find((o) => o.value === v)?.label;

const suggestCode = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);

type Pt = [number, number];

/** Punto de la finca: se toca el mapa o se usa la posición del dispositivo. */
function LocationPicker({ value, onChange }: { value: Pt | null; onChange(p: Pt | null): void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez con el valor inicial
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(value ?? [4.6, -74.1], value ? 15 : 6);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" },
    ).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => change.current([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 100);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    marker.current?.remove();
    marker.current = value
      ? L.circleMarker(value, {
          radius: 9,
          color: "#fff",
          fillColor: "#e11d48",
          fillOpacity: 1,
        }).addTo(m)
      : null;
  }, [value]);

  function locateDevice() {
    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no da ubicación. Toque el mapa para marcar la finca.");
      return;
    }
    setStatus("Buscando su posición…");
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const p: Pt = [g.coords.latitude, g.coords.longitude];
        change.current(p);
        map.current?.setView(p, 16);
        setStatus(null);
      },
      () => setStatus("No se pudo obtener su posición. Toque el mapa para marcar la finca."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <fieldset>
      <legend>Ubicación satelital</legend>
      <div
        ref={el}
        className="farm-pick-map"
        role="application"
        aria-label="Mapa para ubicar la finca"
      />
      <div className="farm-pick-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={locateDevice}>
          <Crosshair size={16} aria-hidden="true" /> Usar mi ubicación
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => change.current(null)}
          >
            Quitar punto
          </button>
        )}
        <output className="farm-pick-status">
          {status ??
            (value
              ? `${value[0].toFixed(5)}, ${value[1].toFixed(5)}`
              : "Toque el mapa donde está la finca.")}
        </output>
      </div>
    </fieldset>
  );
}

/** Registro y edición de la finca, en dos pasos: datos generales y especies con su manejo. */
export function FarmDialog({ farm, onClose }: { farm?: LocalFarm; onClose(): void }) {
  const { orgId, syncNow, notify } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const unit0 = farm?.areaUnit ?? "ha";
  const [name, setName] = useState(farm?.name ?? "");
  const [code, setCode] = useState(farm?.code ?? "");
  const [codeEdited, setCodeEdited] = useState(false);
  const [focus, setFocus] = useState<ProductionFocus | "">(farm?.productionFocus ?? "");
  const [system, setSystem] = useState<ProductionSystem | "">(farm?.productionSystem ?? "");
  const [unit, setUnit] = useState<AreaUnit>(unit0);
  const [total, setTotal] = useState(
    farm?.totalAreaHa ? String(fromHectares(farm.totalAreaHa, unit0)) : "",
  );
  const [livestock, setLivestock] = useState(
    farm?.livestockAreaHa ? String(fromHectares(farm.livestockAreaHa, unit0)) : "",
  );
  const [location, setLocation] = useState(farm?.locationText ?? "");
  const [point, setPoint] = useState<Pt | null>(
    farm?.latitude != null && farm.longitude != null ? [farm.latitude, farm.longitude] : null,
  );
  const [species, setSpecies] = useState<Species[]>(
    farm ? (farm.species.split(",") as Species[]) : ["bovino"],
  );
  const [settings, setSettings] = useState(
    () =>
      Object.fromEntries(
        ALL_SPECIES.map((s) => [
          s,
          {
            weaningMonths: String(
              farm?.speciesSettings[s]?.weaningMonths ?? DEFAULT_WEANING_MONTHS,
            ),
            dryOffDays: String(farm?.speciesSettings[s]?.dryOffDays ?? PARAMS[s].lactanciaDias),
          },
        ]),
      ) as Record<Species, { weaningMonths: string; dryOffDays: string }>,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function close() {
    ref.current?.close();
    onClose();
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (total && livestock && Number(livestock) > Number(total)) {
      setError("El área ganadera no puede ser mayor que el área total.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (species.length === 0) {
      setError("Seleccione al menos una especie.");
      return;
    }
    const fields = {
      name,
      speciesPresent: species,
      areaUnit: unit,
      speciesSettings: Object.fromEntries(
        species.map((s) => [
          s,
          {
            weaningMonths: Number(settings[s].weaningMonths),
            dryOffDays: Number(settings[s].dryOffDays),
          },
        ]),
      ),
      ...(location.trim() ? { locationText: location.trim() } : {}),
      ...(focus ? { productionFocus: focus } : {}),
      ...(system ? { productionSystem: system } : {}),
      ...(total ? { totalAreaHa: toHectares(Number(total), unit) } : {}),
      ...(livestock ? { livestockAreaHa: toHectares(Number(livestock), unit) } : {}),
      ...(point ? { latitude: point[0], longitude: point[1] } : {}),
    } satisfies Omit<FarmCreate, "organizationId" | "code">;
    setBusy(true);
    setError(null);
    try {
      if (farm) await api.updateFarm(farm.id, { organizationId: orgId, ...fields });
      else await api.createFarm({ organizationId: orgId, code, ...fields });
      await syncNow();
      notify(farm ? "Finca actualizada." : `Finca ${name} registrada.`, "ok");
      close();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar la finca. Verifique la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }

  const unitPlural = UNITS.find((u) => u.value === unit)?.plural;

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="farm-title">
      {step === 1 ? (
        <form onSubmit={next}>
          <h2 id="farm-title">{farm ? `Editar ${farm.name}` : "Registrar finca"}</h2>
          <p className="farm-step">Paso 1 de 2 · Datos de la finca</p>
          <div className="grid">
            <label>
              Nombre de la finca
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!farm && !codeEdited) setCode(suggestCode(e.target.value));
                }}
              />
            </label>
            <label>
              Código
              <input
                required
                disabled={Boolean(farm)}
                maxLength={20}
                value={code}
                className="mono"
                onChange={(e) => {
                  setCodeEdited(true);
                  setCode(e.target.value);
                }}
              />
            </label>
            <label>
              Especialidad
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as ProductionFocus | "")}
              >
                <option value="">Sin definir</option>
                {FOCUS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de explotación
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value as ProductionSystem | "")}
              >
                <option value="">Sin definir</option>
                {SYSTEM.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Área</legend>
            <div className="grid farm-area">
              <label>
                Unidad de medida
                <select value={unit} onChange={(e) => setUnit(e.target.value as AreaUnit)}>
                  {UNITS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Área total ({unitPlural})
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </label>
              <label>
                Área en ganadería ({unitPlural})
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={livestock}
                  onChange={(e) => setLivestock(e.target.value)}
                />
              </label>
            </div>
            <small>Con el área en pastos para ganadería se calcula la carga de la finca.</small>
          </fieldset>
          <label>
            Municipio o vereda
            <input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <LocationPicker value={point} onChange={setPoint} />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Siguiente
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit}>
          <h2 id="farm-title">{farm ? `Editar ${farm.name}` : "Registrar finca"}</h2>
          <p className="farm-step">Paso 2 de 2 · Especies y manejo</p>
          {ALL_SPECIES.map((s) => {
            const on = species.includes(s);
            return (
              <fieldset key={s}>
                <legend>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setSpecies((list) =>
                          e.target.checked ? [...list, s] : list.filter((x) => x !== s),
                        )
                      }
                    />{" "}
                    {SPECIES_LABEL[s]}
                  </label>
                </legend>
                {on && (
                  <div className="grid">
                    <label>
                      Edad de destete (meses)
                      <input
                        required
                        type="number"
                        min="1"
                        max="24"
                        step="1"
                        value={settings[s].weaningMonths}
                        onChange={(e) =>
                          setSettings((v) => ({
                            ...v,
                            [s]: { ...v[s], weaningMonths: e.target.value },
                          }))
                        }
                      />
                      <small>Avisa cuando las crías cumplen esta edad.</small>
                    </label>
                    <label>
                      Secado (días de lactancia)
                      <input
                        required
                        type="number"
                        min="60"
                        max="600"
                        step="1"
                        value={settings[s].dryOffDays}
                        onChange={(e) =>
                          setSettings((v) => ({
                            ...v,
                            [s]: { ...v[s], dryOffDays: e.target.value },
                          }))
                        }
                      />
                      <small>Días de lactancia con los que acostumbra secar.</small>
                    </label>
                  </div>
                )}
              </fieldset>
            );
          })}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {farm ? "Guardar cambios" : "Registrar finca"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Tarjeta «Mis fincas» de Configuración: lista, carga estimada y acceso a registrar o editar. */
export function FarmsCard() {
  const { orgId, role, online, dataVersion } = useApp();
  const farms = useFarms();
  const canWrite = role !== null && can(role, "farm.write");
  const [editing, setEditing] = useState<LocalFarm | "new" | null>(null);
  const [herd, setHerd] = useState<{ farmId: string; category: string; n: number }[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.herdByFarm(orgId).then(setHerd);
  }, [orgId, dataVersion]);

  return (
    <article className="card">
      <CardHead
        icon={<Building2 size={24} aria-hidden="true" />}
        title="Mis fincas"
        sub="Datos de cada finca, área y carga estimada."
        action={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!online}
              title={online ? undefined : "Requiere conexión"}
              onClick={() => setEditing("new")}
            >
              <Plus size={16} aria-hidden="true" /> Registrar finca
            </button>
          ) : undefined
        }
      />
      {farms.length === 0 ? (
        <p className="farm-empty">Aún no hay fincas registradas en este dispositivo.</p>
      ) : (
        <ul className="dev-list">
          {farms.map((f) => {
            const animals = herd.filter((h) => h.farmId === f.id);
            const count = animals.reduce((s, h) => s + h.n, 0);
            const load = estimatedLoad(animals, f.livestockAreaHa);
            const kind = [labelOf(FOCUS, f.productionFocus), labelOf(SYSTEM, f.productionSystem)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={f.id} className="dev-row">
                <span className="dev-text">
                  <strong>{f.name}</strong>
                  <small>
                    {f.code}
                    {kind ? ` · ${kind}` : ""}
                  </small>
                  <small>
                    {f.livestockAreaHa
                      ? `${num(fromHectares(f.livestockAreaHa, f.areaUnit))} ${
                          UNITS.find((u) => u.value === f.areaUnit)?.plural
                        } en ganadería · ${num(count)} animales · ${
                          load.perHa === null ? "—" : num(load.perHa, 2)
                        } UGG/ha estimadas`
                      : "Falta el área en ganadería para calcular la carga."}
                  </small>
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!online}
                    title={online ? undefined : "Requiere conexión"}
                    onClick={() => setEditing(f)}
                  >
                    <Pencil size={16} aria-hidden="true" /> Editar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <FarmDialog
          {...(editing === "new" ? {} : { farm: editing })}
          onClose={() => setEditing(null)}
        />
      )}
    </article>
  );
}
