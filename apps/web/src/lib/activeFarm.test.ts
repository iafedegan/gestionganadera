import { describe, expect, it } from "vitest";
import { scopedFarm } from "./activeFarm";

describe("scopedFarm", () => {
  const farms = [{ id: "a" }, { id: "b" }];
  it("conserva la finca elegida si existe", () => {
    expect(scopedFarm("b", farms)).toBe("b");
  });
  it("vuelve a todas las fincas si la elegida ya no existe o no hay elección", () => {
    expect(scopedFarm("zz", farms)).toBe("");
    expect(scopedFarm("", farms)).toBe("");
    expect(scopedFarm("a", [])).toBe("");
  });
});
