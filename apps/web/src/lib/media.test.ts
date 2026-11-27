import { describe, expect, it } from "vitest";
import { fitWithin } from "./media";

describe("fotos del chat", () => {
  it("reduce al lado mayor sin agrandar", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(600, 900, 1280)).toEqual({ w: 600, h: 900 });
  });
});
