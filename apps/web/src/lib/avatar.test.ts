import { describe, expect, it } from "vitest";
import { centerSquare, isDemoEmail } from "./avatar";

describe("foto de perfil", () => {
  it("recorta el cuadrado central", () => {
    expect(centerSquare(1200, 800)).toEqual({ x: 200, y: 0, side: 800 });
    expect(centerSquare(600, 900)).toEqual({ x: 0, y: 150, side: 600 });
  });
  it("reconoce las cuentas de muestra", () => {
    expect(isDemoEmail("demo-completo@demo.ganaderia.local")).toBe(true);
    expect(isDemoEmail("ana@finca.co")).toBe(false);
  });
});
