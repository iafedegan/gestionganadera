import { describe, expect, it } from "vitest";
import { activeWithdrawals, milkSummary, weightSummary } from "./animalHistory";

type Dated = Parameters<typeof milkSummary>[0][number];

const salud = (occurredOn: string, milk: number, meat: number): Dated => ({
  type: "salud",
  occurredOn,
  data: {
    kind: "Tratamiento",
    product: `P-${occurredOn}`,
    reason: "",
    responsible: "",
    cost: null,
    milkWithdrawalDays: milk,
    meatWithdrawalDays: meat,
  },
});
const leche = (occurredOn: string, liters: number): Dated => ({
  type: "leche",
  occurredOn,
  data: { liters, shift: "Mañana" },
});
const peso = (occurredOn: string, kg: number): Dated => ({
  type: "peso",
  occurredOn,
  data: { kg, method: "Báscula" },
});
const parto = (occurredOn: string): Dated => ({ type: "parto", occurredOn, data: {} });

describe("retiros vigentes", () => {
  it("incluye el último día y toma la fecha más lejana", () => {
    const r = activeWithdrawals(
      [salud("2026-10-20", 10, 0), salud("2026-10-25", 3, 28), salud("2026-01-01", 7, 7)],
      "2026-10-30",
    );
    expect(r.milkUntil).toBe("2026-10-30");
    expect(r.meatUntil).toBe("2026-11-22");
    expect(r.items).toHaveLength(2);
  });

  it("no cuenta productos sin retiro ni retiros vencidos", () => {
    const r = activeWithdrawals(
      [salud("2026-10-29", 0, 0), salud("2026-10-01", 3, 3)],
      "2026-10-30",
    );
    expect(r).toEqual({ items: [], milkUntil: null, meatUntil: null });
  });
});

describe("leche", () => {
  it("suma por día solo la lactancia actual", () => {
    const m = milkSummary([
      leche("2026-01-01", 99),
      parto("2026-10-01"),
      leche("2026-10-02", 10),
      leche("2026-10-02", 8.5),
      leche("2026-10-03", 15),
    ]);
    expect(m.since).toBe("2026-10-01");
    expect(m.days).toEqual([
      { date: "2026-10-02", liters: 18.5 },
      { date: "2026-10-03", liters: 15 },
    ]);
    expect(m.total).toBe(33.5);
    expect(m.average).toBe(16.8);
    expect(m.peak?.date).toBe("2026-10-02");
  });

  it("sin registros queda vacío", () => {
    expect(milkSummary([])).toMatchObject({ days: [], total: 0, average: 0, peak: null });
  });
});

describe("peso", () => {
  it("calcula la ganancia diaria entre pesajes", () => {
    const w = weightSummary([
      peso("2026-02-10", 150),
      peso("2026-01-01", 110),
      peso("2026-03-02", 170),
    ]);
    expect(w.rows.map((r) => r.dailyGainG)).toEqual([null, 1000, 1000]);
    expect(w.last?.kg).toBe(170);
    expect(w.averageGainG).toBe(1000);
  });

  it("no divide entre cero con pesajes del mismo día o uno solo", () => {
    expect(
      weightSummary([peso("2026-01-01", 100), peso("2026-01-01", 102)]).averageGainG,
    ).toBeNull();
    expect(weightSummary([peso("2026-01-01", 100)]).averageGainG).toBeNull();
  });
});
