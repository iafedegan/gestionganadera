import { describe, expect, it } from "vitest";
import type { HomeStats } from "./homeStats";
import { storySummary } from "./storySummary";

const stats = (o: Partial<HomeStats>): HomeStats => ({
  milkDaily: [],
  milk7: 0,
  milkPrev7: 0,
  milkTrend: null,
  pregnant: 0,
  toPalpate: 0,
  females: 0,
  hasRepro: false,
  ...o,
});

describe("storySummary", () => {
  it("cuenta el día en una frase con lo que haya", () => {
    expect(
      storySummary({
        inv: { total: 250 },
        stats: stats({ milk7: 12_000, milkTrend: 1, toPalpate: 9, hasRepro: true }),
        money: { count: 12, balance: 7_200_000 },
      }),
    ).toBe(
      "Tiene 250 animales, la leche va estable, 9 vacas esperan palpación y este mes va ganando.",
    );
  });

  it("dice cuánto cambió la leche sin cifras técnicas", () => {
    const s = (milkTrend: number) =>
      storySummary({ inv: null, stats: stats({ milk7: 100, milkTrend }), money: null });
    expect(s(8)).toBe("La leche va subiendo.");
    expect(s(-5)).toBe("La leche bajó un poco.");
    expect(s(-29)).toBe("La leche bajó.");
  });

  it("usa el singular y calla lo que no tiene datos", () => {
    expect(
      storySummary({
        inv: { total: 1 },
        stats: stats({ toPalpate: 1 }),
        money: { count: 2, balance: -50_000 },
      }),
    ).toBe("Tiene 1 animal, 1 vaca espera palpación y este mes va perdiendo.");
    expect(storySummary({ inv: { total: 0 }, stats: null, money: { count: 0, balance: 0 } })).toBe(
      "",
    );
  });
});
