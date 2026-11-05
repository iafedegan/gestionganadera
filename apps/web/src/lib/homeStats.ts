/**
 * Cifras de la pantalla de Inicio calculadas con los datos reales del dispositivo:
 * leche de los últimos días, hembras preñadas y por palpar.
 */

export interface StatAnimal {
  id: string;
  sex: string;
}
export interface StatEvent {
  animalId: string;
  type: string;
  occurredOn: string;
  data: unknown;
}

export interface HomeStats {
  /** Litros por día, del más antiguo (hace 13 días) a hoy. */
  milkDaily: number[];
  milk7: number;
  milkPrev7: number;
  /** Variación porcentual frente a la semana anterior; null si no hay con qué comparar. */
  milkTrend: number | null;
  pregnant: number;
  toPalpate: number;
  females: number;
  hasRepro: boolean;
}

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export function homeStats(animals: StatAnimal[], events: StatEvent[], today: string): HomeStats {
  const milkDaily = Array.from({ length: 14 }, () => 0);
  const byAnimal = new Map<string, StatEvent[]>();
  for (const e of events) {
    if (e.type === "leche") {
      const ago = daysBetween(e.occurredOn, today);
      if (ago >= 0 && ago < 14) {
        const i = 13 - ago;
        milkDaily[i] = (milkDaily[i] ?? 0) + Number((e.data as { liters?: number }).liters ?? 0);
      }
    }
    const list = byAnimal.get(e.animalId) ?? [];
    list.push(e);
    byAnimal.set(e.animalId, list);
  }
  const milk7 = milkDaily.slice(7).reduce((s, v) => s + v, 0);
  const milkPrev7 = milkDaily.slice(0, 7).reduce((s, v) => s + v, 0);

  let pregnant = 0;
  let toPalpate = 0;
  let females = 0;
  let hasRepro = false;
  const latest = (evs: StatEvent[], types: string[]) =>
    evs
      .filter((e) => types.includes(e.type))
      .reduce<StatEvent | null>((a, e) => (!a || e.occurredOn > a.occurredOn ? e : a), null);

  for (const a of animals) {
    if (a.sex !== "hembra") continue;
    females++;
    const evs = byAnimal.get(a.id) ?? [];
    const serv = latest(evs, ["servicio"]);
    const dx = latest(evs, ["dx"]);
    const birth = latest(evs, ["parto", "aborto"]);
    if (serv || dx || birth) hasRepro = true;
    if (!serv) continue;
    const s = serv.occurredOn;
    if (birth && birth.occurredOn >= s) continue;
    if (dx && dx.occurredOn >= s) {
      if ((dx.data as { result?: string }).result === "Preñada") pregnant++;
    } else if (daysBetween(s, today) >= 35) {
      toPalpate++;
    }
  }

  return {
    milkDaily,
    milk7,
    milkPrev7,
    milkTrend: milkPrev7 > 0 ? Math.round(((milk7 - milkPrev7) / milkPrev7) * 100) : null,
    pregnant,
    toPalpate,
    females,
    hasRepro,
  };
}

/** Trazo SVG (140×40) a partir de una serie; vacío si no hay al menos dos valores. */
export function sparkPath(values: number[], w = 140, h = 40): string {
  if (values.length < 2 || values.every((v) => v === 0)) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
