/**
 * Inteligencia de la finca a partir de su ubicación: pronóstico del clima (Open-Meteo),
 * propiedades del suelo (SoilGrids de ISRIC) y reglas agronómicas y de bienestar animal que
 * convierten esos datos en alertas y recomendaciones. Todo se guarda en el dispositivo para
 * consultarlo sin señal. Las recomendaciones orientan: no reemplazan al veterinario ni al agrónomo.
 */

export interface DayForecast {
  date: string;
  tMax: number;
  tMin: number;
  rhMean: number;
  rain: number;
  rainProb: number;
  et0: number;
  wind: number;
  /** Índice de temperatura y humedad con la máxima del día. */
  thi: number;
}

export interface Weather {
  fetchedAt: string;
  current: { temp: number; rh: number; rain: number; wind: number } | null;
  days: DayForecast[];
}

export interface SoilLayer {
  depth: string;
  clay: number | null;
  sand: number | null;
  silt: number | null;
  ph: number | null;
  soc: number | null;
  cec: number | null;
}

export interface Soil {
  fetchedAt: string;
  layers: SoilLayer[];
}

const TZ = "America/Bogota";
const cacheKey = (kind: string, lat: number, lon: number) =>
  `gg.intel.${kind}.${lat.toFixed(3)},${lon.toFixed(3)}`;

function readCache<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function writeCache(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: se usa solo en memoria */
  }
}

/** ITH (NRC 1971) con temperatura en °C y humedad relativa en %. */
export const thi = (t: number, rh: number) => 1.8 * t + 32 - (0.55 - 0.0055 * rh) * (1.8 * t - 26);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Pronóstico de 7 días. Se refresca cada 3 horas; sin red devuelve el último guardado. */
export async function getWeather(lat: number, lon: number, force = false): Promise<Weather | null> {
  const key = cacheKey("clima", lat, lon);
  const cached = readCache<Weather>(key);
  const fresh = cached && Date.now() - new Date(cached.fetchedAt).getTime() < 3 * 3_600_000;
  if (cached && fresh && !force) return cached;
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    timezone: TZ,
    forecast_days: "7",
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "relative_humidity_2m_mean",
      "precipitation_sum",
      "precipitation_probability_max",
      "et0_fao_evapotranspiration",
      "wind_speed_10m_max",
    ].join(","),
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as {
      current?: Record<string, number>;
      daily?: Record<string, (number | string)[]>;
    };
    const d = j.daily ?? {};
    const dates = (d.time as string[] | undefined) ?? [];
    const days: DayForecast[] = dates.map((date, i) => {
      const tMax = num(d.temperature_2m_max?.[i]);
      const rhMean = num(d.relative_humidity_2m_mean?.[i]);
      return {
        date,
        tMax,
        tMin: num(d.temperature_2m_min?.[i]),
        rhMean,
        rain: num(d.precipitation_sum?.[i]),
        rainProb: num(d.precipitation_probability_max?.[i]),
        et0: num(d.et0_fao_evapotranspiration?.[i]),
        wind: num(d.wind_speed_10m_max?.[i]),
        thi: thi(tMax, rhMean),
      };
    });
    const c = j.current;
    const w: Weather = {
      fetchedAt: new Date().toISOString(),
      current: c
        ? {
            temp: num(c.temperature_2m),
            rh: num(c.relative_humidity_2m),
            rain: num(c.precipitation),
            wind: num(c.wind_speed_10m),
          }
        : null,
      days,
    };
    writeCache(key, w);
    return w;
  } catch {
    return cached;
  }
}

/** Suelo en dos profundidades. El suelo no cambia: se consulta una vez y se guarda. */
export async function getSoil(lat: number, lon: number): Promise<Soil | null> {
  const key = cacheKey("suelo", lat, lon);
  const cached = readCache<Soil>(key);
  if (cached) return cached;
  const params = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: "mean" });
  for (const p of ["clay", "sand", "silt", "phh2o", "soc", "cec"]) params.append("property", p);
  for (const dpt of ["0-5cm", "15-30cm"]) params.append("depth", dpt);
  try {
    const res = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as {
      properties?: {
        layers?: {
          name: string;
          unit_measure: { d_factor: number };
          depths: { label: string; values: { mean: number | null } }[];
        }[];
      };
    };
    const layers = j.properties?.layers ?? [];
    const val = (name: string, depth: string) => {
      const l = layers.find((x) => x.name === name);
      const v = l?.depths.find((d) => d.label === depth)?.values.mean;
      return v === null || v === undefined ? null : v / (l?.unit_measure.d_factor || 1);
    };
    const soil: Soil = {
      fetchedAt: new Date().toISOString(),
      layers: ["0-5cm", "15-30cm"].map((depth) => ({
        depth,
        // Arcilla, arena y limo llegan en g/kg; con el factor 10 quedan en %.
        clay: val("clay", depth),
        sand: val("sand", depth),
        silt: val("silt", depth),
        ph: val("phh2o", depth),
        // Carbono orgánico en g/kg (dg/kg ÷ 10).
        soc: val("soc", depth),
        // CIC en cmol(+)/kg (mmol/kg ÷ 10).
        cec: val("cec", depth),
      })),
    };
    if (soil.layers.every((l) => l.clay === null && l.ph === null)) return null;
    writeCache(key, soil);
    return soil;
  } catch {
    return null;
  }
}

/** Clase textural simplificada del triángulo USDA. */
export function texture(clay: number, sand: number, silt: number): string {
  if (clay >= 40)
    return silt >= 40 ? "Arcillo limoso" : sand >= 45 ? "Arcillo arenoso" : "Arcilloso";
  if (clay >= 27)
    return sand >= 45
      ? "Franco arcillo arenoso"
      : silt >= 40
        ? "Franco arcillo limoso"
        : "Franco arcilloso";
  if (sand >= 85) return "Arenoso";
  if (sand >= 70) return "Areno franco";
  if (silt >= 80) return "Limoso";
  if (silt >= 50) return "Franco limoso";
  if (sand >= 52) return "Franco arenoso";
  return "Franco";
}

export interface Insight {
  tone: "rojo" | "ambar" | "verde" | "azul";
  title: string;
  text: string;
}

/** Lectura agronómica del suelo para pasturas tropicales. */
export function soilInsights(s: Soil): { texture: string | null; insights: Insight[] } {
  const top = s.layers[0];
  const out: Insight[] = [];
  if (!top) return { texture: null, insights: out };
  const tex =
    top.clay !== null && top.sand !== null && top.silt !== null
      ? texture(top.clay, top.sand, top.silt)
      : null;
  if (top.ph !== null) {
    if (top.ph < 5.0)
      out.push({
        tone: "rojo",
        title: `Suelo muy ácido (pH ${top.ph.toFixed(1)})`,
        text: "Probable aluminio tóxico: haga análisis de suelo y considere encalado antes de fertilizar. Las brachiarias toleran mejor la acidez.",
      });
    else if (top.ph < 5.5)
      out.push({
        tone: "ambar",
        title: `Suelo ácido (pH ${top.ph.toFixed(1)})`,
        text: "Conviene encalar según el análisis de suelo para aprovechar el fósforo y el nitrógeno.",
      });
    else if (top.ph > 7.8)
      out.push({
        tone: "ambar",
        title: `Suelo alcalino (pH ${top.ph.toFixed(1)})`,
        text: "Puede limitar hierro y zinc: revise los minerales de la sal y el plan de fertilización.",
      });
    else
      out.push({
        tone: "verde",
        title: `pH adecuado (${top.ph.toFixed(1)})`,
        text: "El rango favorece la disponibilidad de nutrientes para la mayoría de forrajes.",
      });
  }
  if (top.clay !== null && top.clay >= 40)
    out.push({
      tone: "ambar",
      title: "Suelo arcilloso",
      text: "Retiene agua y se compacta con el pisoteo en lluvias: evite sobrepastoreo en invierno y revise el drenaje. Humidícola y Mombasa se adaptan bien.",
    });
  if (top.sand !== null && top.sand >= 65)
    out.push({
      tone: "ambar",
      title: "Suelo arenoso",
      text: "Drena rápido y se seca en verano: planee reservas de forraje y fraccione la fertilización.",
    });
  if (top.soc !== null && top.soc < 10)
    out.push({
      tone: "ambar",
      title: "Poca materia orgánica",
      text: "Mejórela con descanso adecuado de los potreros, abonos orgánicos y leguminosas asociadas.",
    });
  return { texture: tex, insights: out };
}

/** Alertas del pronóstico pensadas para el manejo del hato y las pasturas. */
export function weatherInsights(
  w: Weather,
  opts: { buffaloes: boolean; lactating: number },
): Insight[] {
  const out: Insight[] = [];
  const next = w.days.slice(0, 7);
  if (next.length === 0) return out;
  const hot = next.filter((d) => d.thi >= 79);
  const warm = next.filter((d) => d.thi >= 72 && d.thi < 79);
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric" });
  if (hot.length) {
    out.push({
      tone: "rojo",
      title: `Estrés calórico moderado o severo: ${hot.length} día${hot.length > 1 ? "s" : ""}`,
      text: `Empieza el ${fmt(hot[0]?.date ?? "")}. Ofrezca sombra y agua fresca, ordeñe y maneje en las horas frescas${opts.buffaloes ? "; las búfalas necesitan pozos o barro para refrescarse" : ""}.${opts.lactating ? ` Puede bajar la leche de sus ${opts.lactating} animales en ordeño.` : ""}`,
    });
  } else if (warm.length) {
    out.push({
      tone: "ambar",
      title: `Estrés calórico leve: ${warm.length} día${warm.length > 1 ? "s" : ""}`,
      text: "Asegure sombra y agua a voluntad; evite mover el ganado al mediodía.",
    });
  }
  const heavy = next.filter((d) => d.rain >= 40);
  if (heavy.length)
    out.push({
      tone: "ambar",
      title: `Lluvia fuerte el ${fmt(heavy[0]?.date ?? "")} (${Math.round(heavy[0]?.rain ?? 0)} mm)`,
      text: "Saque el ganado de potreros bajos o inundables y revise cercas, caminos y bebederos.",
    });
  const rain7 = next.reduce((s, d) => s + d.rain, 0);
  const et7 = next.reduce((s, d) => s + d.et0, 0);
  if (rain7 < 10 && et7 > 25)
    out.push({
      tone: "ambar",
      title: "Semana seca",
      text: `Se esperan ${Math.round(rain7)} mm de lluvia y el pasto perderá unos ${Math.round(et7)} mm de agua. Alargue el descanso de los potreros y prepare suplemento.`,
    });
  if (out.length === 0)
    out.push({
      tone: "verde",
      title: "Clima favorable esta semana",
      text: "Sin estrés calórico ni lluvias extremas en el pronóstico.",
    });
  return out;
}

export const thiLabel = (v: number) =>
  v < 72 ? "Confort" : v < 79 ? "Estrés leve" : v < 89 ? "Estrés moderado" : "Estrés severo";
