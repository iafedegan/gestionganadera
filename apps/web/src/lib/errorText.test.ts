import { describe, expect, it } from "vitest";
import { IN_USE, errorText } from "./errorText";

describe("errorText", () => {
  it("explica cuando otra pestaña tiene la base local", () => {
    const raw =
      "ALMACENAMIENTO: NoModificationAllowedError: Access Handles cannot be created if there is another open Access Handle";
    expect(errorText(new Error(raw))).toBe(IN_USE);
    expect(errorText(new Error("ALMACENAMIENTO: lleno"))).toContain("copia local");
    expect(errorText(new Error("otra cosa"))).toBe("otra cosa");
  });
});
