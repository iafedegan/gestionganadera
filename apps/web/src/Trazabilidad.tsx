import type { ForestCheckDto } from "@ganaderia/contracts";
import { type LatLngPt, boundaryAreaHa, eudrGeoJson } from "@ganaderia/domain";
import { AlertTriangle, CheckCircle2, Download, Map as MapIcon, Trees } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EscalateDialog } from "./Extension";
import { useActiveFarm, useFarms } from "./animals";
import { CardHead, PageHead } from "./components";
import { fecha, fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { type LocalFarmMap, localdb } from "./lib/localdb";
import type { ModuleKey } from "./modules";
import { useApp } from "./state";

/**
 * Trazabilidad libre de deforestación (Plan CTeI 2026–2030; Ley 2585 de 2026; Reglamento (UE)
 * 2023/1115, que obliga desde el 30-dic-2026 a operadores grandes y medianos y desde el
 * 30-jun-2027 a micro y pequeños): el lindero, su revisión con la capa satelital de pérdida de
 * bosque desde el corte del 31-dic-2020 y el archivo de geolocalización que pide el comprador.
 */

const msg = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión. La revisión necesita internet."
    : e instanceof ApiError
      ? e.message
      : "No se pudo completar. Intente de nuevo.";

const num = (v: number, dec = 1) =>
  v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: dec });

const cacheKey = (orgId: string) => `gg.bosque.${orgId}`;

/** Últimas revisiones de bosque de la ganadería; sin señal, las guardadas. */
export function useForestChecks() {
  const { orgId, online, dataVersion } = useApp();
  const [items, setItems] = useState<ForestCheckDto[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey(orgId)) ?? "[]") as ForestCheckDto[];
    } catch {
      return [];
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  const load = useCallback(() => {
    if (!orgId || !online) return;
    api.forestChecks(orgId).then(
      (r) => {
        setItems(r.items);
        try {
          localStorage.setItem(cacheKey(orgId), JSON.stringify(r.items));
        } catch {
          /* sin almacenamiento */
        }
      },
      () => undefined,
    );
  }, [orgId, online, dataVersion]);
  useEffect(() => load(), [load]);
  return { items, reload: load };
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function TrazabilidadScreen({ onModule }: { onModule(m: ModuleKey): void }) {
  const { orgId, session, online, dataVersion, notify } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [chosen, setChosen] = useState("");
  const farm = farms.find((f) => f.id === (chosen || active)) ?? farms[0] ?? null;
  const [map, setMap] = useState<LocalFarmMap | null>(null);
  const { items, reload } = useForestChecks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    setMap(null);
    if (!farm) return;
    void localdb.getFarmMap(farm.id).then(setMap);
  }, [farm?.id, dataVersion]);

  if (!farm)
    return (
      <section className="page">
        <PageHead title="Trazabilidad" lead="Registre su finca para empezar." />
      </section>
    );

  const boundary = (map?.boundary ?? null) as LatLngPt[] | null;
  const hasBoundary = Boolean(boundary && boundary.length >= 3);
  const check = items.find((c) => c.farmId === farm.id) ?? null;
  const stale = Boolean(
    check && hasBoundary && JSON.stringify(check.boundary) !== JSON.stringify(boundary),
  );
  const point: LatLngPt | null =
    farm.latitude != null && farm.longitude != null ? [farm.latitude, farm.longitude] : null;

  async function run() {
    if (!boundary || !farm) return;
    setBusy(true);
    setError(null);
    try {
      await api.forestCheck({ organizationId: orgId, farmId: farm.id, boundary });
      reload();
      notify("Revisión guardada como soporte.", "ok");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  function geojson() {
    if (!farm) return;
    const g = eudrGeoJson([
      {
        producerName: session?.memberships[0]?.organizationName ?? session?.displayName ?? "",
        productionPlace: farm.name,
        boundary,
        point,
      },
    ]);
    download(
      `geolocalizacion-${slug(farm.name)}.geojson`,
      JSON.stringify(g, null, 2),
      "application/geo+json",
    );
  }

  const years = check ? Object.entries(check.byYear) : [];

  return (
    <section className="page page-traza">
      <PageHead
        kicker="FEDEGÁN 5.0"
        icon={<Trees size={30} aria-hidden="true" />}
        title="Trazabilidad y bosque"
        lead="Demuestre que su ganado no viene de áreas deforestadas: el lindero de la finca, su revisión satelital desde 2021 y el archivo que pide el comprador."
      />

      {farms.length > 1 && (
        <label className="exp-farm">
          <span>Finca</span>
          <select value={farm.id} onChange={(e) => setChosen(e.target.value)}>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="banner banner-info traza-dates">
        El Reglamento (UE) 2023/1115 exige demostrar que no hubo deforestación después del 31 de
        diciembre de 2020. Aplica desde el 30 de diciembre de 2026 a operadores grandes y medianos,
        y desde el 30 de junio de 2027 a micro y pequeños. En Colombia, la Ley 2585 de 2026 pide la
        trazabilidad del ganado libre de deforestación.
      </p>

      <article className="card traza-card">
        <CardHead
          icon={<MapIcon size={24} aria-hidden="true" />}
          title="1. Lindero de la finca"
          sub={
            hasBoundary
              ? `Dibujado: ${num(boundaryAreaHa(boundary as LatLngPt[]))} ha.`
              : "Sin lindero no se puede revisar el bosque ni preparar la geolocalización."
          }
        />
        {!hasBoundary && (
          <button type="button" className="btn btn-primary" onClick={() => onModule("pasturas")}>
            Dibujar el lindero en el mapa
          </button>
        )}
      </article>

      <article className="card traza-card">
        <CardHead
          icon={<Trees size={24} aria-hidden="true" />}
          title="2. Revisión de bosque desde 2021"
          sub="Cruza su lindero con la pérdida de cobertura arbórea detectada por satélite."
        />
        {check && (
          <div className={check.lossAfterCutoffHa > 0 ? "traza-result warn" : "traza-result ok"}>
            {check.lossAfterCutoffHa > 0 ? (
              <AlertTriangle size={22} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={22} aria-hidden="true" />
            )}
            <div>
              <strong>
                {check.lossAfterCutoffHa > 0
                  ? `${num(check.lossAfterCutoffHa, 2)} ha de pérdida de cobertura arbórea después de 2020`
                  : "Sin pérdida de cobertura arbórea dentro del lindero desde 2021"}
              </strong>
              {years.length > 0 && (
                <ul className="traza-years">
                  {years.map(([y, ha]) => (
                    <li key={y}>
                      {y}: {num(ha, 2)} ha
                    </li>
                  ))}
                </ul>
              )}
              <small>
                Revisado el {fechaHora(check.checkedAt)} por {check.checkedBy} sobre{" "}
                {num(check.areaHa)} ha.
                {check.lossBeforeCutoffHa > 0
                  ? ` Antes del corte (2001–2020) hubo ${num(check.lossBeforeCutoffHa, 2)} ha: no cuentan para la regla de la UE.`
                  : ""}
              </small>
            </div>
          </div>
        )}
        {check && check.lossAfterCutoffHa > 0 && (
          <>
            <p className="hint">
              La pérdida de cobertura no siempre es deforestación: puede ser una cosecha forestal,
              un incendio o un error de la imagen. Un técnico debe revisarla antes de concluir.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!online}
              onClick={() =>
                setAsk(
                  `La revisión satelital de ${farm.name} detectó ${num(check.lossAfterCutoffHa, 2)} ha de pérdida de cobertura arbórea después de 2020 (${years
                    .map(([y, ha]) => `${y}: ${num(ha, 2)} ha`)
                    .join(", ")}). ¿Pueden revisarla para la trazabilidad libre de deforestación?`,
                )
              }
            >
              Pedir revisión al Secretario Técnico
            </button>
          </>
        )}
        {stale && (
          <p className="hint">El lindero cambió desde la última revisión: revíselo de nuevo.</p>
        )}
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasBoundary || !online || busy}
          onClick={() => void run()}
        >
          {busy ? "Revisando imágenes…" : check ? "Revisar de nuevo" : "Revisar ahora"}
        </button>
        <p className="hint traza-source">
          Fuente: Global Forest Watch, pérdida de cobertura arbórea (Hansen/UMD/Google/USGS/NASA)
          {check ? `, ${check.version}` : ""}, resolución de unos 30 m. Es una alerta satelital, no
          un concepto legal. Cada revisión queda guardada con el lindero usado.
        </p>
      </article>

      <article className="card traza-card">
        <CardHead
          icon={<Download size={24} aria-hidden="true" />}
          title="3. Archivo para el comprador"
          sub="Geolocalización de la finca en GeoJSON, el formato del sistema de debida diligencia de la UE."
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasBoundary && !point}
          onClick={geojson}
        >
          Descargar geolocalización (GeoJSON)
        </button>
        {!hasBoundary && point && (
          <p className="hint">
            Sin lindero se entrega solo el punto de la finca: la UE lo admite para predios de hasta
            4 ha.
          </p>
        )}
        <p className="hint">
          Valide el archivo con su comprador o exportador antes de presentarlo.
        </p>
      </article>

      <article className="card traza-card">
        <CardHead
          icon={<CheckCircle2 size={24} aria-hidden="true" />}
          title="Lo que también le pedirán"
          sub="La app todavía no los gestiona: téngalos a mano."
        />
        <ul className="eco-checks">
          <li>Registro del predio ante el ICA.</li>
          <li>
            Identificación de los animales y sus guías de movilización (de qué fincas vienen).
          </li>
          <li>
            Prueba de que la producción cumple la ley colombiana (uso del suelo, ambiental,
            laboral).
          </li>
        </ul>
        {check && (
          <p className="hint">Última revisión de bosque: {fecha(check.checkedAt.slice(0, 10))}.</p>
        )}
      </article>

      {ask && <EscalateDialog question={ask} topic="ambiental" onClose={() => setAsk(null)} />}
    </section>
  );
}
