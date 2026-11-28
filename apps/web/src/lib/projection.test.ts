import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONCEPTION,
  type ProjAnimal,
  type ProjEvent,
  type ProjectionInput,
  addDays,
  conceptionRate,
  project,
  projectMoney,
} from "./projection";

const TODAY = "2026-11-27";
const RULES = {
  bovino: { gestacion: 283, secarAntes: 60, lactanciaDias: 305, dxDesde: 30 },
  bufalino: { gestacion: 315, secarAntes: 60, lactanciaDias: 270, dxDesde: 35 },
};
const vaca = (tag: string, milk = 0, over: Partial<ProjAnimal> = {}): ProjAnimal => ({
  tag,
  species: "bovino",
  sex: "hembra",
  cat: "Vaca",
  bornDays: 1800,
  milk,
  ...over,
});
const ev = (tag: string, tipo: string, daysAgo: number, resultado?: string): ProjEvent => ({
  tag,
  tipo,
  fecha: addDays(TODAY, -daysAgo),
  ...(resultado ? { resultado } : {}),
});
const input = (over: Partial<ProjectionInput>): ProjectionInput => ({
  today: TODAY,
  animals: [],
  events: [],
  milkHistory: [],
  rules: RULES,
  dryOffDays: () => null,
  weaningMonths: () => null,
  ...over,
});

describe("proyección de la finca", () => {
  it("una preñada confirmada pare a los 283 días del servicio y se seca 60 días antes", () => {
    const p = project(
      input({
        animals: [vaca("A1", 10)],
        events: [ev("A1", "parto", 280), ev("A1", "servicio", 210), ev("A1", "dx", 170, "Preñada")],
      }),
    );
    const parto = addDays(TODAY, 73);
    expect(p.births.next90).toBe(1);
    expect(p.births.months.find((m) => m.month === parto.slice(0, 7))).toMatchObject({
      confirmed: 1,
      tags: ["A1"],
    });
    expect(p.dryOffs90).toBe(1);
    expect(p.upcoming).toEqual([
      { fecha: addDays(TODAY, 13), kind: "secado", tag: "A1", late: false },
    ]);
    // Seca entre el día 13 y el parto: no da leche; después del parto vuelve a dar.
    const day = (k: number) => p.milk.series.find((x) => x.fecha === addDays(TODAY, k));
    expect(day(20)?.litros).toBe(0);
    expect(day(80)?.litros).toBeGreaterThan(0);
  });

  it("una servida sin diagnóstico se palpa y cuenta como parto posible según la tasa", () => {
    const p = project(input({ animals: [vaca("B2")], events: [ev("B2", "servicio", 20)] }));
    expect(p.upcoming).toEqual([
      { fecha: addDays(TODAY, 10), kind: "palpar", tag: "B2", late: false },
    ]);
    expect(p.births.next90).toBe(0);
    const total = p.births.months.reduce((s, m) => s + m.possible, 0);
    expect(total).toBeCloseTo(DEFAULT_CONCEPTION);
  });

  it("la leche sigue el promedio de cada vaca y baja poco a poco después del pico", () => {
    const p = project(input({ animals: [vaca("C3", 10)], events: [ev("C3", "parto", 100)] }));
    expect(p.milk.perDayNow).toBe(10);
    const first = p.milk.series.find((x) => x.estimado);
    expect(first?.litros).toBeCloseTo(9.975, 3);
    expect(p.milk.next30).toBeLessThan(300);
    expect(p.milk.next30).toBeGreaterThan(280);
    expect(p.milk.next30Min).toBeLessThan(p.milk.next30);
    expect(p.milk.next30Max).toBeGreaterThan(p.milk.next30);
  });

  it("una vaca pasada de sus días de lactancia se asume seca en una semana", () => {
    const p = project(
      input({
        animals: [vaca("D4", 6)],
        events: [ev("D4", "parto", 330)],
        dryOffDays: () => 305,
      }),
    );
    expect(p.upcoming).toEqual([
      { fecha: addDays(TODAY, 7), kind: "secado", tag: "D4", late: false },
    ]);
    expect(p.milk.series.find((x) => x.fecha === addDays(TODAY, 8))?.litros).toBe(0);
  });

  it("una finca de carne no proyecta leche, y las crías se destetan a su edad", () => {
    const p = project(
      input({
        animals: [vaca("T1", 0, { cat: "Ternera", bornDays: 230 })],
        weaningMonths: () => 8,
      }),
    );
    expect(p.milk.perDayNow).toBe(0);
    expect(p.milk.series).toEqual([]);
    expect(p.upcoming).toEqual([
      {
        fecha: addDays(TODAY, Math.round(8 * 30.4) - 230),
        kind: "destete",
        tag: "T1",
        late: false,
      },
    ]);
  });

  it("la tasa de preñez sale de la finca solo con suficientes diagnósticos", () => {
    expect(conceptionRate([ev("x", "dx", 10, "Preñada")], TODAY)).toEqual({
      rate: DEFAULT_CONCEPTION,
      fromFarm: false,
    });
    const many = Array.from({ length: 10 }, (_, i) =>
      ev(`v${i}`, "dx", 10 + i, i < 7 ? "Preñada" : "Vacía"),
    );
    expect(conceptionRate(many, TODAY)).toEqual({ rate: 0.7, fromFarm: true });
  });

  it("la plata cierra el mes al ritmo de los últimos 90 días", () => {
    const moves = [
      { fecha: "2026-11-02", tipo: "Ingreso" as const, valor: 900_000 },
      { fecha: "2026-10-15", tipo: "Egreso" as const, valor: 450_000 },
    ];
    const m = projectMoney(moves, TODAY);
    expect(m?.soFar).toBe(900_000);
    expect(m?.perDay).toBe(5_000);
    expect(m?.monthClose).toBe(900_000 + 5_000 * 3);
    expect(projectMoney([], TODAY)).toBeNull();
  });

  it("los días sin ordeños anotados no bajan el promedio ni se dibujan en cero", () => {
    const milkHistory = [6, 5, 4, 3, 2, 1, 0].map((ago, i) => ({
      fecha: addDays(TODAY, -ago),
      litros: i < 5 ? 100 : 0,
    }));
    // El promedio de la vaca, dividido por 7 días con 2 sin anotar.
    const p = project(input({ animals: [vaca("E5", (5 * 100) / 7)], milkHistory }));
    expect(p.milk.perDayNow).toBeCloseTo(100);
    const real = p.milk.series.filter((x) => !x.estimado);
    expect(real).toHaveLength(5);
    expect(real.at(-1)?.litros).toBe(100);
  });
});
