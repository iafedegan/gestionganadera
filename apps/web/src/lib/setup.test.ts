import { describe, expect, it } from "vitest";
import type { LocalFarm } from "./localdb";
import { setupSteps } from "./setupSteps";

const farm = (p: Partial<LocalFarm>) =>
  ({ id: "f", code: "F1", name: "La Poderosa", ...p }) as LocalFarm;

describe("configuración mínima", () => {
  it("sin finca falta todo", () => {
    expect(setupSteps([], 0, false).every((s) => !s.done)).toBe(true);
  });
  it("exige área total y ganadera, ubicación y animales", () => {
    const s = setupSteps([farm({ totalAreaHa: 100, livestockAreaHa: null })], 0);
    expect(s.map((x) => x.done)).toEqual([true, true, false, false, false]);
    const ok = setupSteps(
      [farm({ totalAreaHa: 100, livestockAreaHa: 80, locationText: "Montería" })],
      3,
    );
    expect(ok.every((x) => x.done)).toBe(true);
  });
  it("el perfil va primero y solo bloquea si se sabe que falta", () => {
    const ok = [farm({ totalAreaHa: 100, livestockAreaHa: 80, locationText: "Montería" })];
    expect(setupSteps(ok, 3, false)[0]).toMatchObject({ key: "perfil", done: false });
    expect(setupSteps(ok, 3, true).every((x) => x.done)).toBe(true);
    expect(setupSteps(ok, 3, null)[0]?.done).toBe(true);
  });
});
