/**
 * Proyección de la finca: lo que probablemente pasará en los próximos meses según lo registrado.
 * Son estimaciones con reglas sencillas que se pueden explicar, no certezas:
 *
 * - Partos: hembras con preñez confirmada (fecha del servicio + gestación de la especie). Las
 *   servidas sin diagnóstico cuentan como «posibles», pesadas con la tasa de preñez de la finca.
 * - Leche: cada vaca sigue con su promedio de la última semana, baja un poco cada día después del
 *   pico y deja de dar en su fecha de secado; las que paren entran a ordeño con lo que dan las
 *   vacas recién paridas de la finca. El rango se abre a medida que se mira más lejos.
 * - Próximos 30 días: partos, secados, palpaciones y destetes, con su fecha.
 * - Plata: el saldo del mes más lo que la finca suele dejar por día (últimos 90 días).
 */

export type Species = "bovino" | "bufalino";

export interface SpeciesRules {
  gestacion: number;
  /** Días antes del parto en que se seca. */
  secarAntes: number;
  /** Duración de la lactancia cuando la finca no definió sus días de secado. */
  lactanciaDias: number;
  /** Días después del servicio en que ya se puede palpar. */
  dxDesde: number;
}

export interface ProjAnimal {
  tag: string;
  species: Species;
  sex: "hembra" | "macho";
  cat: string;
  /** Edad en días. */
  bornDays: number;
  /** Litros por día, promedio de la última semana. */
  milk: number;
}

export interface ProjEvent {
  tag: string;
  tipo: string;
  fecha: string;
  resultado?: string;
}

export interface ProjMove {
  fecha: string;
  tipo: "Ingreso" | "Egreso";
  valor: number;
}

export interface ProjectionInput {
  today: string;
  animals: ProjAnimal[];
  events: ProjEvent[];
  /** Litros totales por día de las últimas semanas, del más antiguo a hoy. */
  milkHistory: { fecha: string; litros: number }[];
  rules: Record<Species, SpeciesRules>;
  /** Días de lactancia en que la finca seca a esa vaca; null si no lo definió. */
  dryOffDays(tag: string): number | null;
  /** Meses de destete de la finca de esa cría; null si no lo definió. */
  weaningMonths(tag: string): number | null;
  /** Movimientos de plata; se omite si la persona no ve la economía. */
  money?: ProjMove[];
  /** Días hacia adelante (por defecto 90). */
  horizonDays?: number;
}

export interface MilkPoint {
  fecha: string;
  litros: number;
  /** Solo en lo estimado: el rango probable. */
  min?: number;
  max?: number;
  estimado: boolean;
}

export interface MonthBirths {
  /** AAAA-MM */
  month: string;
  confirmed: number;
  /** Partos posibles esperados (servidas sin diagnóstico × tasa de preñez), con decimales. */
  possible: number;
  tags: string[];
}

export type UpcomingKind = "parto" | "secado" | "palpar" | "destete";

export interface Upcoming {
  fecha: string;
  kind: UpcomingKind;
  tag: string;
  /** La fecha ya pasó y no hay registro (parto o palpación atrasados). */
  late: boolean;
}

export interface Projection {
  milk: {
    series: MilkPoint[];
    /** Litros por día hoy (suma de los promedios de la última semana). */
    perDayNow: number;
    next30: number;
    next30Min: number;
    next30Max: number;
    /** Totales por mes de los próximos meses, para la tabla. */
    months: { month: string; litros: number; min: number; max: number }[];
  };
  births: {
    months: MonthBirths[];
    next90: number;
    possible90: number;
    /** Tasa de preñez usada para las posibles (0 a 1). */
    conceptionRate: number;
    /** La tasa salió de los diagnósticos de la finca (si no, es la de referencia). */
    rateFromFarm: boolean;
  };
  /** Crías esperadas en los próximos 6 meses (confirmadas más posibles). */
  calves6m: number;
  /** Vacas que se secan en los próximos 90 días. */
  dryOffs90: number;
  /** Lo de los próximos 30 días, por fecha. */
  upcoming: Upcoming[];
  money: { soFar: number; monthClose: number; perDay: number; next3Months: number } | null;
}

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) =>
  new Date(parse(d) + n * DAY).toISOString().slice(0, 10);
const between = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY);

/** Baja diaria de la leche después del pico (unos 7 % al mes). */
export const DAILY_DECLINE = 0.0025;
/** Día de lactancia en que se alcanza el pico. */
const PEAK_DAY = 60;
/** Tasa de preñez de referencia cuando la finca tiene pocos diagnósticos. */
export const DEFAULT_CONCEPTION = 0.5;
/** Meses de partos que se muestran: una gestación completa, para que entren las recién servidas. */
export const BIRTH_MONTHS = 10;
/** Un parto o una palpación con más atraso que esto se toma como dato que falta, no como próximo. */
const STALE_DAYS = 15;

interface FemaleState {
  parto: string | null;
  servicio: string | null;
  pregnant: boolean;
  /** Servida y sin diagnóstico ni aborto. */
  pending: boolean;
  fpp: string | null;
  dry: boolean;
}

function femaleState(events: ProjEvent[], rules: SpeciesRules): FemaleState {
  const ev = [...events].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const lastOf = (tipo: string, after: string | null) =>
    [...ev].reverse().find((e) => e.tipo === tipo && (!after || e.fecha >= after));
  const parto = lastOf("parto", null)?.fecha ?? null;
  const serv = lastOf("servicio", parto);
  const dx = serv ? lastOf("dx", serv.fecha) : undefined;
  const aborto = serv ? lastOf("aborto", serv.fecha) : undefined;
  const secado = lastOf("secado", null);
  const pregnant = Boolean(serv && dx?.resultado === "Preñada" && !aborto);
  return {
    parto,
    servicio: serv?.fecha ?? null,
    pregnant,
    pending: Boolean(serv && !dx && !aborto),
    fpp: pregnant && serv ? addDays(serv.fecha, rules.gestacion) : null,
    dry: Boolean(secado && (!parto || secado.fecha >= parto)),
  };
}

/** Tasa de preñez de la finca en el último año; la de referencia si hay pocos diagnósticos. */
export function conceptionRate(
  events: ProjEvent[],
  today: string,
): { rate: number; fromFarm: boolean } {
  const since = addDays(today, -365);
  const dx = events.filter((e) => e.tipo === "dx" && e.fecha >= since && e.fecha <= today);
  if (dx.length < 8) return { rate: DEFAULT_CONCEPTION, fromFarm: false };
  const yes = dx.filter((e) => e.resultado === "Preñada").length;
  return { rate: Math.min(0.9, Math.max(0.2, yes / dx.length)), fromFarm: true };
}

/** Litros de una vaca en el día `k` desde hoy, partiendo de `y0` y su día de lactancia. */
function decayed(y0: number, del0: number | null, k: number): number {
  const start = del0 ?? PEAK_DAY;
  const after = Math.max(0, start + k - Math.max(start, PEAK_DAY));
  return y0 * (1 - DAILY_DECLINE) ** after;
}

/** Litros de una vaca recién parida `k` días después del parto, si en el pico da `peak`. */
function fresh(peak: number, k: number): number {
  if (k < 45) return peak * (0.75 + (0.25 * k) / 45);
  return peak * (1 - DAILY_DECLINE) ** Math.max(0, k - PEAK_DAY);
}

const monthOf = (d: string) => d.slice(0, 7);

export function project(input: ProjectionInput): Projection {
  const { today, rules } = input;
  const horizon = input.horizonDays ?? 90;
  const end = addDays(today, horizon);
  const byTag = new Map<string, ProjEvent[]>();
  for (const e of input.events) {
    const list = byTag.get(e.tag) ?? [];
    list.push(e);
    byTag.set(e.tag, list);
  }
  const { rate, fromFarm } = conceptionRate(input.events, today);

  const upcoming: Upcoming[] = [];
  const in30 = addDays(today, 30);
  const births = new Map<string, MonthBirths>();
  const birthMonth = (m: string) => {
    const b = births.get(m) ?? { month: m, confirmed: 0, possible: 0, tags: [] };
    births.set(m, b);
    return b;
  };
  // Los meses de partos, aunque alguno quede en cero.
  for (let i = 0; i < BIRTH_MONTHS; i++) {
    const d = new Date(parse(today));
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + i);
    birthMonth(d.toISOString().slice(0, 7));
  }
  const in6m = addDays(today, 182);
  let calves6m = 0;
  let possible90 = 0;

  // Vacas en ordeño hoy y vacas que van a parir: la base de la leche.
  const milking: { y0: number; del0: number | null; dryOn: string | null }[] = [];
  const calving: string[] = [];
  let dryOffs90 = 0;

  for (const a of input.animals) {
    if (a.sex !== "hembra") continue;
    const r = rules[a.species];
    const st = femaleState(byTag.get(a.tag) ?? [], r);

    if (st.pregnant && st.fpp && st.fpp >= addDays(today, -STALE_DAYS)) {
      const due = st.fpp < today ? today : st.fpp;
      if (st.fpp <= end) calving.push(due);
      const m = births.get(monthOf(due));
      if (m) {
        m.confirmed++;
        m.tags.push(a.tag);
      }
      if (due <= in6m) calves6m++;
      if (due <= in30)
        upcoming.push({ fecha: st.fpp, kind: "parto", tag: a.tag, late: st.fpp < today });
    }
    if (st.pending && st.servicio && between(st.servicio, today) <= 90) {
      const due = addDays(st.servicio, r.gestacion);
      const m = births.get(monthOf(due));
      if (m) m.possible += rate;
      if (due <= in6m) calves6m += rate;
      if (due <= end) possible90 += rate;
      const palpar = addDays(st.servicio, r.dxDesde);
      if (palpar <= in30 && palpar >= addDays(today, -STALE_DAYS))
        upcoming.push({ fecha: palpar, kind: "palpar", tag: a.tag, late: palpar < today });
    }

    if (a.milk > 0 && !st.dry) {
      const del0 = st.parto ? between(st.parto, today) : null;
      let dryOn: string | null = null;
      if (st.fpp) dryOn = addDays(st.fpp, -r.secarAntes);
      else if (st.parto) dryOn = addDays(st.parto, input.dryOffDays(a.tag) ?? r.lactanciaDias);
      // Si ya le tocaba y sigue en ordeño, se asume que la secan en una semana.
      if (dryOn && dryOn <= today) dryOn = addDays(today, 7);
      milking.push({ y0: a.milk, del0, dryOn });
      if (dryOn && dryOn <= end) dryOffs90++;
      if (dryOn && dryOn <= in30)
        upcoming.push({ fecha: dryOn, kind: "secado", tag: a.tag, late: false });
    }

    const wean = input.weaningMonths(a.tag);
    if (wean !== null && (a.cat === "Ternera" || a.cat === "Ternero")) {
      const on = addDays(today, Math.round(wean * 30.4) - a.bornDays);
      if (on >= today && on <= in30)
        upcoming.push({ fecha: on, kind: "destete", tag: a.tag, late: false });
    }
  }

  // El promedio de cada vaca divide por 7 días aunque alguno no tenga ordeños anotados (hoy, que
  // aún no se anota, o un día que faltó): se calibra con el promedio de los días que sí tienen.
  const raw = milking.reduce((s, c) => s + c.y0, 0);
  const recorded = input.milkHistory.slice(-7).filter((h) => h.litros > 0);
  if (raw > 0 && recorded.length >= 3) {
    const k = recorded.reduce((s, h) => s + h.litros, 0) / recorded.length / raw;
    const f = Math.min(3, Math.max(0.5, k));
    for (const c of milking) c.y0 *= f;
  }

  // Lo que da una vaca recién parida: el promedio de las que van en los primeros 100 días; si no
  // hay suficientes, el promedio de las que ordeñan con un poco más (están cerca del pico).
  const early = milking.filter((c) => c.del0 !== null && c.del0 <= 100);
  const avg = (list: { y0: number }[]) => list.reduce((s, c) => s + c.y0, 0) / list.length;
  const peak = early.length >= 2 ? avg(early) : milking.length > 0 ? avg(milking) * 1.15 : 0;

  const perDayNow = milking.reduce((s, c) => s + c.y0, 0);
  // Los últimos días sin ordeños anotados (normalmente hoy) no se dibujan como si fueran cero.
  // Tampoco los primeros, de antes de empezar a anotar.
  const history = [...input.milkHistory];
  while (history.length > 1 && history.at(-1)?.litros === 0 && history.some((h) => h.litros > 0))
    history.pop();
  while (history.length > 1 && history[0]?.litros === 0) history.shift();
  const series: MilkPoint[] = history.map((h) => ({
    fecha: h.fecha,
    litros: h.litros,
    estimado: false,
  }));
  const monthly = new Map<string, { month: string; litros: number; min: number; max: number }>();
  let next30 = 0;
  let next30Min = 0;
  let next30Max = 0;
  if (perDayNow > 0) {
    for (let k = 1; k <= horizon; k++) {
      const fecha = addDays(today, k);
      let litros = 0;
      for (const c of milking) if (!c.dryOn || fecha < c.dryOn) litros += decayed(c.y0, c.del0, k);
      for (const due of calving) if (fecha >= due) litros += fresh(peak, between(due, fecha));
      const spread = 0.06 + (0.12 * k) / horizon;
      const point = {
        fecha,
        litros,
        min: litros * (1 - spread),
        max: litros * (1 + spread),
        estimado: true,
      };
      series.push(point);
      if (k <= 30) {
        next30 += point.litros;
        next30Min += point.min;
        next30Max += point.max;
      }
      const m = monthly.get(monthOf(fecha)) ?? { month: monthOf(fecha), litros: 0, min: 0, max: 0 };
      m.litros += point.litros;
      m.min += point.min;
      m.max += point.max;
      monthly.set(m.month, m);
    }
  }

  const months = [...births.values()].sort((a, b) => a.month.localeCompare(b.month));
  const order: Record<UpcomingKind, number> = { parto: 0, palpar: 1, secado: 2, destete: 3 };

  return {
    milk: {
      series,
      perDayNow,
      next30,
      next30Min,
      next30Max,
      months: [...monthly.values()],
    },
    births: {
      months,
      next90: calving.length,
      possible90,
      conceptionRate: rate,
      rateFromFarm: fromFarm,
    },
    calves6m: Math.round(calves6m),
    dryOffs90,
    upcoming: upcoming.sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || order[a.kind] - order[b.kind],
    ),
    money: input.money ? projectMoney(input.money, today) : null,
  };
}

/** Saldo del mes hasta hoy y su cierre si la finca sigue al ritmo de los últimos 90 días. */
export function projectMoney(
  moves: ProjMove[],
  today: string,
): { soFar: number; monthClose: number; perDay: number; next3Months: number } | null {
  const net = (m: ProjMove) => (m.tipo === "Ingreso" ? m.valor : -m.valor);
  const since = addDays(today, -90);
  const recent = moves.filter((m) => m.fecha > since && m.fecha <= today);
  if (recent.length === 0) return null;
  const perDay = recent.reduce((s, m) => s + net(m), 0) / 90;
  const month = monthOf(today);
  const soFar = moves
    .filter((m) => monthOf(m.fecha) === month && m.fecha <= today)
    .reduce((s, m) => s + net(m), 0);
  const d = new Date(parse(today));
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const left = daysInMonth - d.getUTCDate();
  return { soFar, monthClose: soFar + perDay * left, perDay, next3Months: perDay * 91 };
}
