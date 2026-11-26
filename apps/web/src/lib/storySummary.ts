import { num } from "../labels";
import type { HomeStats } from "./homeStats";

/** La frase del Inicio que cuenta, en palabras sencillas, cómo va la finca hoy. */

export const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

/** «a, b y c». */
function joinY(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** La frase que resume el día, armada con lo que haya. */
export function storySummary(p: {
  inv: { total: number } | null;
  stats: HomeStats | null;
  money: { count: number; balance: number } | null;
}): string {
  const parts: string[] = [];
  if (p.inv && p.inv.total > 0) parts.push(`tiene ${plural(p.inv.total, "animal", "animales")}`);
  const s = p.stats;
  if (s && s.milk7 > 0) {
    const t = s.milkTrend;
    parts.push(
      t == null || Math.abs(t) <= 2
        ? "la leche va estable"
        : t > 0
          ? "la leche va subiendo"
          : t < -10
            ? "la leche bajó"
            : "la leche bajó un poco",
    );
  }
  if (s && s.toPalpate > 0)
    parts.push(`${plural(s.toPalpate, "vaca espera", "vacas esperan")} palpación`);
  if (p.money && p.money.count > 0)
    parts.push(p.money.balance >= 0 ? "este mes va ganando" : "este mes va perdiendo");
  if (parts.length === 0) return "";
  const text = joinY(parts);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
