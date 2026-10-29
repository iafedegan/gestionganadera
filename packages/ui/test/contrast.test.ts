import { describe, expect, it } from "vitest";
import { brand, contrast } from "../src/tokens";

// Valores medidos con WCAG 2.1 en el manual de marca (p. 8).
describe("contraste de marca", () => {
  const casos: [string, string, string, number][] = [
    ["marfil sobre obsidiana", brand.marfil, brand.obsidiana, 17.3],
    ["oro sobre obsidiana", brand.oro, brand.obsidiana, 9.8],
    ["niebla sobre obsidiana", brand.niebla, brand.obsidiana, 9.0],
    ["esmeralda sobre obsidiana", brand.esmeralda, brand.obsidiana, 5.6],
    ["obsidiana sobre botón dorado", brand.obsidiana, brand.oro, 9.6],
    ["blanco sobre carmesí", "#FFFFFF", brand.carmesiCita, 6.0],
    ["blanco sobre verde pasto", "#FFFFFF", brand.verdePasto, 3.8],
  ];

  for (const [nombre, a, b, esperado] of casos) {
    it(`${nombre} ≈ ${esperado}:1`, () => {
      expect(contrast(a, b)).toBeGreaterThan(esperado - 0.3);
      expect(contrast(a, b)).toBeLessThan(esperado + 0.3);
    });
  }

  it("el tema claro por defecto cumple AAA en texto corrido", () => {
    expect(contrast(brand.verdeBotella, brand.marmol)).toBeGreaterThanOrEqual(7);
  });

  it("el verde pasto no es apto para texto pequeño sobre blanco", () => {
    expect(contrast(brand.verdePasto, "#FFFFFF")).toBeLessThan(4.5);
  });
});
