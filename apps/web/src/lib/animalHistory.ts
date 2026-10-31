import type { AnimalEventPayload } from "@ganaderia/contracts";

/** Cálculos de la hoja de vida a partir de los eventos de un animal. Funciones puras. */

type Dated = AnimalEventPayload extends infer E
  ? E extends AnimalEventPayload
    ? Pick<E, "type" | "occurredOn" | "data">
    : never
  : never;

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export interface ActiveWithdrawal {
  product: string;
  occurredOn: string;
  milkUntil: string | null;
  meatUntil: string | null;
}

/** Retiros de leche y carne que siguen vigentes hoy, y la última fecha de cada uno. */
export function activeWithdrawals(events: Dated[], today: string) {
  const items: ActiveWithdrawal[] = [];
  for (const e of events) {
    if (e.type !== "salud") continue;
    const milk =
      e.data.milkWithdrawalDays > 0 ? addDays(e.occurredOn, e.data.milkWithdrawalDays) : null;
    const meat =
      e.data.meatWithdrawalDays > 0 ? addDays(e.occurredOn, e.data.meatWithdrawalDays) : null;
    const milkUntil = milk && milk >= today ? milk : null;
    const meatUntil = meat && meat >= today ? meat : null;
    if (milkUntil || meatUntil) {
      items.push({ product: e.data.product, occurredOn: e.occurredOn, milkUntil, meatUntil });
    }
  }
  const latest = (list: (string | null)[]) =>
    list
      .filter((d): d is string => d !== null)
      .sort()
      .pop() ?? null;
  return {
    items,
    milkUntil: latest(items.map((i) => i.milkUntil)),
    meatUntil: latest(items.map((i) => i.meatUntil)),
  };
}

export interface MilkDayTotal {
  date: string;
  liters: number;
}

/** Leche por día de la lactancia actual: desde el último parto, o todo si no hay parto. */
export function milkSummary(events: Dated[]) {
  const parto = events
    .filter((e) => e.type === "parto")
    .map((e) => e.occurredOn)
    .sort()
    .pop();
  const byDay = new Map<string, number>();
  for (const e of events) {
    if (e.type === "leche" && (!parto || e.occurredOn >= parto)) {
      byDay.set(e.occurredOn, (byDay.get(e.occurredOn) ?? 0) + e.data.liters);
    }
  }
  const days: MilkDayTotal[] = [...byDay.entries()]
    .map(([date, liters]) => ({ date, liters: Math.round(liters * 10) / 10 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const total = days.reduce((s, d) => s + d.liters, 0);
  const peak = days.reduce<MilkDayTotal | null>(
    (best, d) => (!best || d.liters > best.liters ? d : best),
    null,
  );
  return {
    days,
    total: Math.round(total * 10) / 10,
    average: days.length ? Math.round((total / days.length) * 10) / 10 : 0,
    peak,
    since: parto ?? null,
  };
}

export interface WeightRow {
  date: string;
  kg: number;
  method: string;
  /** Ganancia diaria frente al pesaje anterior, en gramos. */
  dailyGainG: number | null;
}

export function weightSummary(events: Dated[]) {
  const sorted = events
    .flatMap((e) =>
      e.type === "peso" ? [{ date: e.occurredOn, kg: e.data.kg, method: e.data.method }] : [],
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows: WeightRow[] = sorted.map((w, i) => {
    const prev = sorted[i - 1];
    const days = prev ? daysBetween(prev.date, w.date) : 0;
    return {
      ...w,
      dailyGainG: prev && days > 0 ? Math.round(((w.kg - prev.kg) / days) * 1000) : null,
    };
  });
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  return {
    rows,
    last: last ?? null,
    averageGainG:
      first && last && span > 0 ? Math.round(((last.kg - first.kg) / span) * 1000) : null,
  };
}
