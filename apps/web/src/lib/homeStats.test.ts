import { describe, expect, it } from "vitest";
import { homeStats, sparkPath } from "./homeStats";

const today = "2026-11-05";
const ev = (animalId: string, type: string, occurredOn: string, data: object = {}) => ({
  animalId,
  type,
  occurredOn,
  data,
});

describe("cifras de Inicio", () => {
  it("suma la leche de la semana y la compara con la anterior", () => {
    const s = homeStats(
      [{ id: "a", sex: "hembra" }],
      [
        ev("a", "leche", "2026-11-05", { liters: 10 }),
        ev("a", "leche", "2026-11-01", { liters: 12 }),
        ev("a", "leche", "2026-10-28", { liters: 11 }),
        ev("a", "leche", "2026-10-10", { liters: 99 }),
      ],
      today,
    );
    expect(s.milk7).toBe(22);
    expect(s.milkPrev7).toBe(11);
    expect(s.milkTrend).toBe(100);
    expect(s.milkDaily.at(-1)).toBe(10);
  });

  it("cuenta preñadas y vacas por palpar", () => {
    const s = homeStats(
      [
        { id: "p", sex: "hembra" },
        { id: "q", sex: "hembra" },
        { id: "r", sex: "hembra" },
        { id: "t", sex: "macho" },
      ],
      [
        ev("p", "servicio", "2026-08-01"),
        ev("p", "dx", "2026-09-10", { result: "Preñada" }),
        ev("q", "servicio", "2026-09-20"),
        ev("r", "servicio", "2026-10-25"),
      ],
      today,
    );
    expect(s.pregnant).toBe(1);
    expect(s.toPalpate).toBe(1);
    expect(s.females).toBe(3);
    expect(s.hasRepro).toBe(true);
  });

  it("no dibuja curva sin datos", () => {
    expect(sparkPath([0, 0, 0])).toBe("");
    expect(sparkPath([1, 3])).toMatch(/^M0\.0 /);
  });
});
