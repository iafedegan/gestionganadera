import {
  CloudRain,
  Droplets,
  Layers,
  MapPin,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FarmDialog } from "./FarmForm";
import { useActiveFarm, useFarms } from "./animals";
import { CardHead } from "./components";
import { useHerdData } from "./herdData";
import {
  type Insight,
  type Soil,
  type Weather,
  getSoil,
  getWeather,
  soilInsights,
  thiLabel,
  weatherInsights,
} from "./lib/farmIntel";
import { useApp } from "./state";

const TONE = { rojo: "al-rojo", ambar: "al-ambar", verde: "al-verde", azul: "al-azul" } as const;
const thiTone = (v: number) => (v < 72 ? "ok" : v < 79 ? "warn" : "bad");
/** El índice de temperatura y humedad dicho en palabras sencillas. */
const calor = (thi: number) =>
  thi < 72
    ? "El ganado está cómodo con este clima."
    : thi < 79
      ? "Hace un calor algo pesado para el ganado."
      : thi < 89
        ? "Calor fuerte: dele sombra y agua al ganado."
        : "Calor extremo: proteja al ganado con sombra y agua.";
/** Lo que viene en la semana, en una frase (solo si cambia algo frente a hoy). */
function weekNote(days: { date: string; thi: number; rain: number }[], todayThi: number) {
  const rest = days.slice(1, 7);
  const hot = rest.filter((d) => d.thi >= 79).length;
  const heavy = rest.find((d) => d.rain >= 20);
  if (heavy)
    return `Se espera lluvia fuerte el ${new Date(`${heavy.date}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long" })}.`;
  if (hot > 0 && todayThi < 79)
    return hot === 1 ? "Viene un día de mucho calor." : `Vienen ${hot} días de mucho calor.`;
  if (rest.length > 0 && rest.every((d) => d.rain < 1)) return "No se espera lluvia en la semana.";
  return "";
}
const day = (d: string, i: number) =>
  i === 0 ? "Hoy" : new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short" });

function Insights({ items }: { items: Insight[] }) {
  return (
    <ul className="kit-alerts">
      {items.map((a) => (
        <li key={a.title} className={TONE[a.tone]}>
          <span className="al-dot" />
          <span className="al-text">
            <strong>{a.title}</strong>
            <small>{a.text}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Su finca hoy»: el clima de los próximos 7 días y el suelo donde está el hato, con alertas
 * que anticipan estrés calórico, lluvias fuertes o sequía. Funciona sin señal con lo último guardado.
 */
export function FarmIntel({ compact = false }: { compact?: boolean } = {}) {
  const { online } = useApp();
  const [open, setOpen] = useState(!compact);
  const farms = useFarms();
  const herd = useHerdData();
  const active = useActiveFarm();
  const farm =
    farms.find((f) => f.id === active) ??
    farms.find((f) => f.latitude != null && f.longitude != null) ??
    farms[0];
  const lat = farm?.latitude ?? null;
  const lon = farm?.longitude ?? null;
  const [weather, setWeather] = useState<Weather | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"clima" | "suelo">("clima");

  // biome-ignore lint/correctness/useExhaustiveDependencies: se consulta al cambiar la ubicación o la red
  useEffect(() => {
    if (lat === null || lon === null) return;
    setLoading(true);
    void Promise.all([getWeather(lat, lon), getSoil(lat, lon)]).then(([w, s]) => {
      setWeather(w);
      setSoil(s);
      setLoading(false);
    });
  }, [lat, lon, online]);

  if (!farm) return null;

  if (lat === null || lon === null) {
    return (
      <article className="card intel">
        <CardHead
          icon={<MapPin size={26} aria-hidden="true" />}
          title="Clima y suelo de su finca"
          sub="Ubique la finca en el mapa y le mostraremos el pronóstico, el riesgo de estrés calórico para el ganado y el tipo de suelo."
        />
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          <MapPin size={18} aria-hidden="true" /> Ubicar mi finca
        </button>
        {editing && <FarmDialog farm={farm} onClose={() => setEditing(false)} />}
      </article>
    );
  }

  const buffaloes = farm.species.includes("bufalino");
  const wIns = weather
    ? weatherInsights(weather, { buffaloes, lactating: herd.lactating.length })
    : [];
  const sIns = soil ? soilInsights(soil) : null;
  const now = weather?.current;
  const today = weather?.days[0];

  if (!open) {
    const tip = weekNote(weather?.days ?? [], today?.thi ?? 0);
    return (
      <article className="card intel intel-mini">
        <span className={`im-ic thi-${today ? thiTone(today.thi) : "ok"}`} aria-hidden="true">
          {today && today.rain >= 5 ? <CloudRain size={28} /> : <Sun size={28} />}
        </span>
        <div className="im-text">
          {now && today ? (
            <>
              <strong>
                Hoy en {farm.name}: {Math.round(now.temp)}°,{" "}
                {today.rain >= 1
                  ? `${Math.round(today.rain)} mm de lluvia`
                  : today.rainProb >= 40
                    ? "puede llover"
                    : "sin lluvia"}
              </strong>
              <p>
                {calor(today.thi)}
                {tip ? ` ${tip}` : ""}
              </p>
            </>
          ) : (
            <strong>
              {loading ? "Consultando el clima…" : "Sin pronóstico guardado todavía."}
            </strong>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Ver la semana
        </button>
      </article>
    );
  }

  return (
    <article className="card intel">
      <CardHead
        icon={<Sun size={26} aria-hidden="true" />}
        title={`Su finca hoy · ${farm.name}`}
        sub={
          weather
            ? `Pronóstico actualizado ${new Date(weather.fetchedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}${online ? "" : " · sin señal, último guardado"}`
            : loading
              ? "Consultando el clima y el suelo…"
              : "Sin datos: conéctese una vez para descargarlos."
        }
        action={
          <button
            type="button"
            className="icon-btn"
            aria-label="Actualizar pronóstico"
            disabled={!online || loading}
            onClick={() => {
              setLoading(true);
              void getWeather(lat, lon, true).then((w) => {
                setWeather(w);
                setLoading(false);
              });
            }}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        }
      />

      <div className="kit-seg intel-tabs">
        <button
          type="button"
          aria-pressed={tab === "clima"}
          className={tab === "clima" ? "on" : ""}
          onClick={() => setTab("clima")}
        >
          Clima y ganado
        </button>
        <button
          type="button"
          aria-pressed={tab === "suelo"}
          className={tab === "suelo" ? "on" : ""}
          onClick={() => setTab("suelo")}
        >
          Suelo
        </button>
      </div>

      {tab === "clima" && weather && (
        <>
          {now && today && (
            <div className="intel-now">
              <div className="in-temp">
                <strong>{Math.round(now.temp)}°</strong>
                <small>
                  Máx {Math.round(today.tMax)}° · Mín {Math.round(today.tMin)}°
                </small>
              </div>
              <ul className="in-facts">
                <li>
                  <Droplets size={16} aria-hidden="true" /> {Math.round(now.rh)} % humedad
                </li>
                <li>
                  <CloudRain size={16} aria-hidden="true" /> {Math.round(today.rain)} mm hoy (
                  {today.rainProb} %)
                </li>
                <li>
                  <Wind size={16} aria-hidden="true" /> {Math.round(now.wind)} km/h
                </li>
                <li className={`thi-${thiTone(today.thi)}`}>
                  <Thermometer size={16} aria-hidden="true" /> ITH {Math.round(today.thi)} ·{" "}
                  {thiLabel(today.thi)}
                </li>
              </ul>
            </div>
          )}
          <ol className="intel-days" aria-label="Pronóstico de 7 días">
            {weather.days.map((d, i) => (
              <li key={d.date} className={`thi-${thiTone(d.thi)}`}>
                <small>{day(d.date, i)}</small>
                <b>{Math.round(d.tMax)}°</b>
                <span className="in-min">{Math.round(d.tMin)}°</span>
                <span className="in-rain">{d.rain >= 1 ? `${Math.round(d.rain)} mm` : "—"}</span>
                <span className="in-thi" title={thiLabel(d.thi)}>
                  ITH {Math.round(d.thi)}
                </span>
              </li>
            ))}
          </ol>
          <Insights items={wIns} />
        </>
      )}

      {tab === "suelo" &&
        (soil && sIns ? (
          <>
            <div className="intel-soil">
              <div>
                <small>Textura</small>
                <strong>{sIns.texture ?? "—"}</strong>
              </div>
              {(() => {
                const top = soil.layers[0];
                return (
                  <>
                    <div>
                      <small>pH</small>
                      <strong>{top?.ph?.toFixed(1) ?? "—"}</strong>
                    </div>
                    <div>
                      <small>Arcilla · Arena · Limo</small>
                      <strong>
                        {top?.clay?.toFixed(0) ?? "—"} · {top?.sand?.toFixed(0) ?? "—"} ·{" "}
                        {top?.silt?.toFixed(0) ?? "—"} %
                      </strong>
                    </div>
                    <div>
                      <small>Carbono orgánico</small>
                      <strong>{top?.soc?.toFixed(1) ?? "—"} g/kg</strong>
                    </div>
                  </>
                );
              })()}
            </div>
            <Insights items={sIns.insights} />
            <p className="hint">
              <Layers size={14} aria-hidden="true" /> Estimación satelital de SoilGrids (ISRIC) a
              250 m, primeros 5 cm. Para fertilizar o encalar, confirme con un análisis de suelo de
              laboratorio.
            </p>
          </>
        ) : (
          <p className="hint">
            {loading
              ? "Consultando el suelo…"
              : "No hay datos de suelo para este punto. Conéctese para consultarlos."}
          </p>
        ))}
      <p className="hint intel-src">
        Clima: Open-Meteo. Las alertas orientan el manejo; las decisiones sanitarias son del
        veterinario.
      </p>
    </article>
  );
}
