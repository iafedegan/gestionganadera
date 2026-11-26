/**
 * Qué le pasa hoy a cada animal, calculado con los registros del dispositivo: ordeñada esta
 * semana, preñada, por palpar o en retiro, y su último dato (litros o kilos). Es la información que
 * se muestra en la lista de Animales.
 */

export interface TagEvent {
  animalId: string;
  type: string;
  occurredOn: string;
  data: unknown;
}

export type Flag = "retiro" | "palpar" | "prenada" | "ordeno";

export const FLAG_LABEL: Record<Flag, string> = {
  retiro: "En retiro",
  palpar: "Por palpar",
  prenada: "Preñada",
  ordeno: "Ordeñada",
};

export interface AnimalInfo {
  /** En orden de importancia: lo que exige cuidado va primero. */
  flags: Flag[];
  last: { value: number; unit: "L" | "kg"; on: string } | null;
}

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export function animalInfo(events: TagEvent[], today: string): Map<string, AnimalInfo> {
  const byAnimal = new Map<string, TagEvent[]>();
  for (const e of events) {
    if (e.occurredOn > today) continue;
    const list = byAnimal.get(e.animalId) ?? [];
    list.push(e);
    byAnimal.set(e.animalId, list);
  }
  const out = new Map<string, AnimalInfo>();
  for (const [id, evs] of byAnimal) {
    const latest = (...types: string[]) =>
      evs.reduce<TagEvent | null>(
        (a, e) => (types.includes(e.type) && (!a || e.occurredOn > a.occurredOn) ? e : a),
        null,
      );
    const flags: Flag[] = [];

    const withdrawal = evs.some((e) => {
      if (e.type !== "salud") return false;
      const d = e.data as { milkWithdrawalDays?: number; meatWithdrawalDays?: number };
      const days = Math.max(d.milkWithdrawalDays ?? 0, d.meatWithdrawalDays ?? 0);
      return days > 0 && daysBetween(e.occurredOn, today) <= days;
    });
    if (withdrawal) flags.push("retiro");

    const serv = latest("servicio");
    const dx = latest("dx");
    const end = latest("parto", "aborto");
    if (serv && !(end && end.occurredOn >= serv.occurredOn)) {
      if (dx && dx.occurredOn >= serv.occurredOn) {
        if ((dx.data as { result?: string }).result === "Preñada") flags.push("prenada");
      } else if (daysBetween(serv.occurredOn, today) >= 35) flags.push("palpar");
    }

    const milk = latest("leche");
    const dried = latest("secado");
    const milking =
      milk !== null &&
      daysBetween(milk.occurredOn, today) < 7 &&
      !(dried && dried.occurredOn >= milk.occurredOn);
    if (milking) flags.push("ordeno");

    let last: AnimalInfo["last"] = null;
    if (milking && milk) {
      // Litros del último día ordeñado (suma de la mañana y la tarde).
      const liters = evs
        .filter((e) => e.type === "leche" && e.occurredOn === milk.occurredOn)
        .reduce((s, e) => s + Number((e.data as { liters?: number }).liters ?? 0), 0);
      last = { value: liters, unit: "L", on: milk.occurredOn };
    } else {
      const w = latest("peso");
      if (w)
        last = { value: Number((w.data as { kg?: number }).kg ?? 0), unit: "kg", on: w.occurredOn };
    }
    out.set(id, { flags, last });
  }
  return out;
}

/** Edad en palabras cortas: «3 años», «1 año 4 m», «7 meses». */
export function ageText(birth: string | null | undefined, today: string): string {
  if (!birth) return "";
  const [by = 0, bm = 0, bd = 0] = birth.split("-").map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (!by || months < 0) return "";
  if (months < 1) return "recién nacido";
  if (months < 12) return months === 1 ? "1 mes" : `${months} meses`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y >= 3 || m === 0) return y === 1 ? "1 año" : `${y} años`;
  return `${y} ${y === 1 ? "año" : "años"} ${m} m`;
}
