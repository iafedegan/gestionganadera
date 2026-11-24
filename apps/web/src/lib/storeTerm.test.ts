import { describe, expect, it } from "vitest";
import { matchesStore, priceValue, storeTerm } from "./storeTerm";

describe("búsqueda en TvGan desde un insumo", () => {
  it("quita presentación y concentración", () => {
    expect(storeTerm("Ivermectina 1 %")).toBe("Ivermectina");
    expect(storeTerm("Concentrado de levante 40 kg")).toBe("Concentrado de levante");
    expect(storeTerm("Sal mineralizada 8%")).toBe("Sal mineralizada");
  });
  it("si todo es cifra, deja el nombre original", () => {
    expect(storeTerm("20-20-20")).toBe("20-20-20");
  });
});

describe("filtro del catálogo", () => {
  it("busca todas las palabras, sin tildes ni mayúsculas, y tolera plurales", () => {
    expect(matchesStore("CERCA BATERIA DE 120 KM", "cerca batería")).toBe(true);
    expect(matchesStore("CERCA BATERIA DE 120 KM", "cercas")).toBe(true);
    expect(matchesStore("BRACHIARIA HUMIDICOLA Desnuda", "semilla")).toBe(false);
    expect(matchesStore("KIT TATUADORA BOVINO", "tatuadora bovina")).toBe(false);
  });
  it("convierte el precio colombiano en número", () => {
    expect(priceValue("$ 18.909,30")).toBe(18909.3);
    expect(priceValue("$ 13.000.000,00")).toBe(13000000);
    expect(priceValue(null)).toBeNull();
  });
});
