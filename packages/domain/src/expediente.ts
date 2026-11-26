/**
 * Expediente digital predial (Plan CTeI 2026–2030 de FEDEGÁN–FNG, §6.2).
 *
 * - Línea base de parámetros técnicos calculada con los registros reales de la finca.
 * - Referencias del sector (Tablas 5 a 7 del plan) para que cada dato devuelva algo útil.
 * - Nivel de profundidad del expediente (Tabla 11): 0 audiencia, 1 perfil, 2 predio caracterizado,
 *   3 línea base verificada en campo.
 */

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const months = (from: string, to: string) => days(from, to) / 30.4375;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/* ───────────── Línea base de parámetros técnicos ───────────── */

export interface ExpAnimal {
  id: string;
  sex: string;
  category: string;
  /** AAAA-MM-DD */
  birthDate: string | null;
}
export interface ExpEvent {
  animalId: string;
  type: string;
  occurredOn: string;
  data: unknown;
}

export type IndicatorKey =
  | "edadPrimerParto"
  | "intervaloPartos"
  | "natalidad"
  | "litrosVacaDia"
  | "gananciaDiaria"
  | "carga";

export interface Indicator {
  key: IndicatorKey;
  value: number | null;
  /** Animales o registros con los que se calculó. */
  n: number;
}

export interface IndicatorInput {
  animals: ExpAnimal[];
  events: ExpEvent[];
  /** Hectáreas en ganadería (o el área total si no se conoce). */
  areaHa: number | null;
  today: string;
}

/** Un primer parto registrado después de esta edad casi seguro no es el primero de la vaca. */
const MAX_FIRST_CALVING_MONTHS = 60;
/** Intervalos fuera de este rango son errores de registro o partos no anotados. */
const IEP_RANGE = [250, 900] as const;
/** Unidad de gran ganado aproximada por categoría (equivalencias usuales en Colombia). */
const UGG: Record<string, number> = {
  vaca: 1,
  toro: 1.3,
  novilla: 0.7,
  novillo: 0.7,
  ternero: 0.3,
  otro: 0.7,
};

export function farmIndicators(input: IndicatorInput): Indicator[] {
  const { animals, events, today } = input;
  const byAnimal = new Map<string, ExpEvent[]>();
  for (const e of events) {
    const list = byAnimal.get(e.animalId);
    if (list) list.push(e);
    else byAnimal.set(e.animalId, [e]);
  }
  const partos = (id: string) =>
    (byAnimal.get(id) ?? [])
      .filter((e) => e.type === "parto")
      .map((e) => e.occurredOn)
      .sort();

  // Edad al primer parto: hembras con fecha de nacimiento y primer parto registrado.
  const epp: number[] = [];
  // Intervalo entre partos: promedio por vaca de sus partos consecutivos.
  const iep: number[] = [];
  for (const a of animals) {
    if (a.sex !== "hembra") continue;
    const p = partos(a.id);
    if (p.length === 0) continue;
    if (a.birthDate) {
      const m = months(a.birthDate, p[0] as string);
      if (m >= 18 && m <= MAX_FIRST_CALVING_MONTHS) epp.push(m);
    }
    const gaps: number[] = [];
    for (let i = 1; i < p.length; i++) {
      const d = days(p[i - 1] as string, p[i] as string);
      if (d >= IEP_RANGE[0] && d <= IEP_RANGE[1]) gaps.push(d);
    }
    if (gaps.length) iep.push(gaps.reduce((s, d) => s + d, 0) / gaps.length);
  }

  // Natalidad: partos del último año sobre las hembras en edad de parir (vacas y novillas de
  // 24 meses o más).
  const yearAgo = new Date(Date.parse(today) - 365 * DAY).toISOString().slice(0, 10);
  const breeding = animals.filter(
    (a) =>
      a.sex === "hembra" &&
      (a.category === "vaca" ||
        (a.category === "novilla" && a.birthDate !== null && months(a.birthDate, today) >= 24)),
  );
  const ids = new Set(breeding.map((a) => a.id));
  const births = events.filter(
    (e) =>
      e.type === "parto" && ids.has(e.animalId) && e.occurredOn > yearAgo && e.occurredOn <= today,
  ).length;

  // Litros por vaca al día: últimos 7 días, sobre las vacas ordeñadas cada día.
  const weekAgo = new Date(Date.parse(today) - 7 * DAY).toISOString().slice(0, 10);
  let liters = 0;
  const cowsByDay = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "leche" || e.occurredOn <= weekAgo || e.occurredOn > today) continue;
    liters += Number((e.data as { liters?: number }).liters ?? 0);
    const set = cowsByDay.get(e.occurredOn) ?? new Set<string>();
    set.add(e.animalId);
    cowsByDay.set(e.occurredOn, set);
  }
  const cowDays = [...cowsByDay.values()].reduce((s, set) => s + set.size, 0);

  // Ganancia diaria de peso: primer y último pesaje del último año, separados 14 días o más.
  const gdp: number[] = [];
  for (const list of byAnimal.values()) {
    const w = list
      .filter((e) => e.type === "peso" && e.occurredOn > yearAgo && e.occurredOn <= today)
      .sort((x, y) => x.occurredOn.localeCompare(y.occurredOn));
    if (w.length < 2) continue;
    const first = w[0] as ExpEvent;
    const last = w[w.length - 1] as ExpEvent;
    const d = days(first.occurredOn, last.occurredOn);
    const kg0 = Number((first.data as { kg?: number }).kg);
    const kg1 = Number((last.data as { kg?: number }).kg);
    if (d >= 14 && kg0 > 0 && kg1 > 0) gdp.push(((kg1 - kg0) / d) * 1000);
  }

  const ugg = animals.reduce((s, a) => s + (UGG[a.category] ?? 0.7), 0);
  const round = (v: number | null, dec = 0) =>
    v === null ? null : Math.round(v * 10 ** dec) / 10 ** dec;

  return [
    { key: "edadPrimerParto", value: round(median(epp), 1), n: epp.length },
    { key: "intervaloPartos", value: round(median(iep)), n: iep.length },
    {
      key: "natalidad",
      value: breeding.length ? round((births / breeding.length) * 100) : null,
      n: breeding.length,
    },
    { key: "litrosVacaDia", value: cowDays ? round(liters / cowDays, 1) : null, n: cowDays },
    { key: "gananciaDiaria", value: round(median(gdp)), n: gdp.length },
    {
      key: "carga",
      value:
        input.areaHa && input.areaHa > 0 && animals.length ? round(ugg / input.areaHa, 2) : null,
      n: animals.length,
    },
  ];
}

/* ───────────── Referencias del sector (Plan CTeI, Tablas 5 a 7) ───────────── */

/** Piso térmico: trópico alto por encima de 1.000 m s. n. m. */
export type Piso = "alto" | "bajo";
export const pisoTermico = (elevationM: number | null): Piso | null =>
  elevationM === null ? null : elevationM > 1000 ? "alto" : "bajo";

export interface Reference {
  label: string;
  unit: string;
  /** Mayor es mejor (natalidad, litros, ganancia) o menor es mejor (edades, intervalos). */
  better: "mayor" | "menor";
  /** Mediana de las ganaderías con registro sistematizado, por piso térmico. */
  region?: Record<Piso, number>;
  national: number;
  /** Referente técnico o internacional. */
  target: number;
  source: string;
}

export const REFERENCES: Record<IndicatorKey, Reference> = {
  edadPrimerParto: {
    label: "Edad al primer parto",
    unit: "meses",
    better: "menor",
    region: { alto: 34.5, bajo: 42.3 },
    national: 36,
    target: 30,
    source: "TaurusWebs 2025, en el Plan CTeI 2026–2030 (Tabla 7)",
  },
  intervaloPartos: {
    label: "Intervalo entre partos",
    unit: "días",
    better: "menor",
    region: { alto: 389, bajo: 455 },
    national: 414,
    target: 365,
    source: "TaurusWebs 2025, en el Plan CTeI 2026–2030 (Tabla 7)",
  },
  natalidad: {
    label: "Natalidad",
    unit: "%",
    better: "mayor",
    national: 55,
    target: 69,
    source: "Plan CTeI 2026–2030 (Tabla 5); referente: Argentina",
  },
  litrosVacaDia: {
    label: "Leche por vaca al día",
    unit: "litros",
    better: "mayor",
    national: 6.4,
    target: 12.2,
    source: "DANE 2023, en el Plan CTeI 2026–2030 (Tabla 6); referente: Valle del Cauca",
  },
  gananciaDiaria: {
    label: "Ganancia diaria de peso",
    unit: "g/día",
    better: "mayor",
    national: 520,
    target: 650,
    source: "Plan CTeI 2026–2030 (Tabla 5), en pastoreo",
  },
  carga: {
    label: "Carga animal",
    unit: "UGG/ha",
    better: "mayor",
    national: 0,
    target: 0,
    source: "Unidades de gran ganado por hectárea en ganadería",
  },
};

export type Standing = "mejor" | "igual" | "peor" | "sin_dato";

/** Compara el valor de la finca con la referencia de su piso térmico (o la nacional). */
export function compareIndicator(
  key: IndicatorKey,
  value: number | null,
  piso: Piso | null,
): { reference: number | null; scope: "region" | "nacional" | null; standing: Standing } {
  const ref = REFERENCES[key];
  if (key === "carga")
    return { reference: null, scope: null, standing: value === null ? "sin_dato" : "igual" };
  const reference = piso && ref.region ? ref.region[piso] : ref.national;
  const scope = piso && ref.region ? "region" : "nacional";
  if (value === null) return { reference, scope, standing: "sin_dato" };
  // Margen del 3 % para no llamar «peor» a una diferencia sin importancia.
  const tol = Math.abs(reference) * 0.03;
  const diff = ref.better === "mayor" ? value - reference : reference - value;
  return { reference, scope, standing: diff > tol ? "mejor" : diff < -tol ? "peor" : "igual" };
}

/* ───────────── Nivel de profundidad del expediente (Tabla 11) ───────────── */

export type ExpLevel = 0 | 1 | 2 | 3;

export interface ExpedienteFacts {
  /** Persona identificada (tiene cuenta). */
  account: boolean;
  /** Municipio o ubicación de la finca. */
  location: boolean;
  /** Orientación productiva (leche, carne, doble propósito). */
  focus: boolean;
  /** Tamaño aproximado del hato (declarado o animales registrados). */
  herdSize: boolean;
  /** Área en ganadería. */
  area: boolean;
  /** Animales registrados uno a uno. */
  animals: number;
  /** Potreros dibujados en el mapa o declarados. */
  paddocks: number;
  /** Cuestionario de prácticas respondido (autodiagnóstico). */
  practices: boolean;
  /** Indicadores de línea base que ya se pueden calcular con sus registros. */
  indicators: number;
  /** Línea base verificada en campo por un técnico. */
  verified: boolean;
}

export interface Requirement {
  key:
    | "account"
    | "location"
    | "focus"
    | "herdSize"
    | "area"
    | "animals"
    | "paddocks"
    | "practices"
    | "indicators"
    | "verified";
  level: 1 | 2 | 3;
  label: string;
  done: boolean;
}

export function expedienteLevel(f: ExpedienteFacts): {
  level: ExpLevel;
  requirements: Requirement[];
  /** Lo que falta para subir al siguiente nivel; vacío en el nivel 3. */
  next: Requirement[];
} {
  const requirements: Requirement[] = [
    { key: "account", level: 1, label: "Persona identificada", done: f.account },
    { key: "location", level: 1, label: "Ubicación de la finca", done: f.location },
    { key: "focus", level: 1, label: "Orientación productiva", done: f.focus },
    { key: "herdSize", level: 1, label: "Tamaño aproximado del hato", done: f.herdSize },
    { key: "area", level: 2, label: "Área en ganadería", done: f.area },
    { key: "animals", level: 2, label: "Animales registrados", done: f.animals > 0 },
    { key: "paddocks", level: 2, label: "Potreros o praderas", done: f.paddocks > 0 },
    {
      key: "practices",
      level: 2,
      label: "Prácticas de manejo (autodiagnóstico)",
      done: f.practices,
    },
    {
      key: "indicators",
      level: 2,
      label: "Al menos dos parámetros productivos registrados",
      done: f.indicators >= 2,
    },
    { key: "verified", level: 3, label: "Línea base verificada en campo", done: f.verified },
  ];
  const all = (lv: number) => requirements.filter((r) => r.level === lv).every((r) => r.done);
  const level: ExpLevel = !all(1) ? 0 : !all(2) ? 1 : !all(3) ? 2 : 3;
  const next = level === 3 ? [] : requirements.filter((r) => r.level === level + 1 && !r.done);
  return { level, requirements, next };
}

export const LEVEL_LABEL: Record<ExpLevel, string> = {
  0: "Sin expediente",
  1: "Perfil",
  2: "Predio caracterizado",
  3: "Línea base verificada",
};
