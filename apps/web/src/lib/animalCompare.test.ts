import { describe, expect, it } from "vitest";
import { compareAnimal, milkByFarm, tagsIn } from "./animalCompare";

const today = "2026-11-26";
const ev = (type: string, occurredOn: string, data: object = {}, farmId = "f") => ({
  animalId: "a",
  farmId,
  type,
  occurredOn,
  data,
});

describe("comparaciones del asistente", () => {
  it("compara leche y peso con lo anterior", () => {
    const c = compareAnimal(
      [
        ev("leche", "2026-11-15", { liters: 20 }),
        ev("leche", "2026-11-25", { liters: 15 }),
        ev("peso", "2026-10-01", { kg: 400 }),
        ev("peso", "2026-11-01", { kg: 420 }),
      ],
      today,
    );
    expect(c.milk).toMatchObject({ before: 20, now: 15, pct: -25 });
    expect(c.weight).toMatchObject({ before: 400, now: 420, pct: 5, beforeOn: "2026-10-01" });
    expect(c.health).toBeNull();
  });

  it("sin registros no inventa comparaciones", () => {
    expect(compareAnimal([ev("peso", "2026-11-01", { kg: 300 })], today).weight?.pct).toBeNull();
    expect(compareAnimal([], today).milk).toBeNull();
  });

  it("reconoce los aretes nombrados, sin repetir ni confundir", () => {
    expect(
      tagsIn("Revise **CE-004** y po-003; CE-004 sigue. CE-0045 no.", ["PO-003", "CE-004"]),
    ).toEqual(["CE-004", "PO-003"]);
  });

  it("suma la leche por finca", () => {
    expect(
      milkByFarm(
        [ev("leche", "2026-11-15", { liters: 100 }), ev("leche", "2026-11-24", { liters: 90 })],
        today,
      ),
    ).toEqual([{ farmId: "f", before: 100, now: 90, pct: -10 }]);
  });
});
