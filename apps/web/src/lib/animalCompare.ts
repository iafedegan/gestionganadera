/**
 * Comparaciones «antes y ahora» para acompañar las respuestas del asistente. Se calculan en el
 * dispositivo con los registros reales, no con cifras que diga la IA.
 */
import type { TagEvent } from "./animalTags";

const DAY = 86_400_000;
const ago = (on: string, today: string) => Math.round((Date.parse(today) - Date.parse(on)) / DAY);
const r1 = (v: number) => Math.round(v * 10) / 10;
const num = (data: unknown, key: string) => Number((data as Record<string, unknown>)[key] ?? 0);

export interface Change {
  before: number;
  now: number;
  /** Variación en %, o null si no hay con qué comparar. */
  pct: number | null;
}
const change = (before: number, now: number): Change => ({
  before: r1(before),
  now: r1(now),
  pct: before > 0 ? Math.round(((now - before) / before) * 100) : null,
});

export interface AnimalCompare {
  /** Litros de los últimos 7 días contra los 7 anteriores. */
  milk: (Change & { daily: number[] }) | null;
  /** Último peso contra el anterior. */
  weight: (Change & { on: string; beforeOn: string | null }) | null;
  health: { product: string; on: string } | null;
  served: string | null;
}

export function compareAnimal(events: TagEvent[], today: string): AnimalCompare {
  const daily = Array.from({ length: 14 }, () => 0);
  for (const e of events) {
    if (e.type !== "leche") continue;
    const d = ago(e.occurredOn, today);
    if (d >= 0 && d < 14) daily[13 - d] = (daily[13 - d] ?? 0) + num(e.data, "liters");
  }
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const past = events
    .filter((e) => e.occurredOn <= today)
    .sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : 1));
  const of = (type: string) => past.filter((e) => e.type === type);
  const weights = of("peso");
  const w = weights.at(-1);
  const p = weights.at(-2);
  const h = of("salud").at(-1);
  return {
    milk: daily.some((v) => v > 0)
      ? { ...change(sum(daily.slice(0, 7)), sum(daily.slice(7))), daily: daily.map(r1) }
      : null,
    weight: w
      ? {
          ...change(p ? num(p.data, "kg") : 0, num(w.data, "kg")),
          on: w.occurredOn,
          beforeOn: p?.occurredOn ?? null,
        }
      : null,
    health: h
      ? { product: String((h.data as { product?: string }).product ?? ""), on: h.occurredOn }
      : null,
    served: of("servicio").at(-1)?.occurredOn ?? null,
  };
}

/** Aretes del hato que el texto nombra, en el orden en que aparecen. */
export function tagsIn(text: string, tags: string[]): string[] {
  const known = new Map(tags.map((t) => [t.toUpperCase(), t]));
  const out: string[] = [];
  for (const word of text.toUpperCase().split(/[^A-Z0-9ÁÉÍÓÚÑ-]+/)) {
    const t = known.get(word);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Leche por finca: esta semana contra la anterior. */
export function milkByFarm(
  events: (TagEvent & { farmId: string })[],
  today: string,
): ({ farmId: string } & Change)[] {
  const acc = new Map<string, [number, number]>();
  for (const e of events) {
    if (e.type !== "leche") continue;
    const d = ago(e.occurredOn, today);
    if (d < 0 || d >= 14) continue;
    const v = acc.get(e.farmId) ?? [0, 0];
    v[d < 7 ? 1 : 0] += num(e.data, "liters");
    acc.set(e.farmId, v);
  }
  return [...acc].map(([farmId, [before, now]]) => ({ farmId, ...change(before, now) }));
}
