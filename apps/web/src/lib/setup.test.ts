import { describe, expect, it } from "vitest";
import type { LocalFarm } from "./localdb";
import { setupSteps } from "./setupSteps";

const farm = (p: Partial<LocalFarm>) =>
  ({ id: "f", code: "F1", name: "La Poderosa", ...p }) as LocalFarm;

describe("configuración mínima", () => {
  it("sin finca falta todo", () => {
    expect(setupSteps([], 0).every((s) => !s.done)).toBe(true);
  });
  it("exige área total y ganadera, ubicación y animales", () => {
    const s = setupSteps([farm({ totalAreaHa: 100, livestockAreaHa: null })], 0);
    expect(s.map((x) => x.done)).toEqual([true, false, false, false]);
    const ok = setupSteps(
      [farm({ totalAreaHa: 100, livestockAreaHa: 80, locationText: "Montería" })],
      3,
    );
    expect(ok.every((x) => x.done)).toBe(true);
  });
});
