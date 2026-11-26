import { describe, expect, it } from "vitest";
import {
  type ExpAnimal,
  type ExpEvent,
  compareIndicator,
  expedienteLevel,
  farmIndicators,
  pisoTermico,
} from "../src/expediente";

const cow = (id: string, birthDate: string | null, category = "vaca"): ExpAnimal => ({
  id,
  sex: "hembra",
  category,
  birthDate,
});
const ev = (animalId: string, type: string, occurredOn: string, data: unknown = {}): ExpEvent => ({
  animalId,
  type,
  occurredOn,
  data,
});
const get = (list: ReturnType<typeof farmIndicators>, key: string) =>
  list.find((i) => i.key === key);

describe("línea base de parámetros técnicos", () => {
  const today = "2026-11-25";

  it("edad al primer parto e intervalo entre partos salen de los partos registrados", () => {
    const r = farmIndicators({
      today,
      areaHa: null,
      animals: [cow("a", "2022-01-10"), cow("b", "2021-06-01"), cow("c", "2015-01-01")],
      events: [
        ev("a", "parto", "2025-01-10"), // 36 meses
        ev("a", "parto", "2026-02-04"), // 390 días después
        ev("b", "parto", "2024-06-01"), // 36 meses
        ev("b", "parto", "2025-08-20"), // 445 días
        // Vaca adulta registrada tarde: su primer parto en la app no es el primero de su vida.
        ev("c", "parto", "2025-03-01"),
      ],
    });
    expect(get(r, "edadPrimerParto")).toEqual({ key: "edadPrimerParto", value: 36, n: 2 });
    expect(get(r, "intervaloPartos")).toEqual({ key: "intervaloPartos", value: 418, n: 2 });
  });

  it("descarta intervalos imposibles (errores o partos sin anotar)", () => {
    const r = farmIndicators({
      today,
      areaHa: null,
      animals: [cow("a", null)],
      events: [ev("a", "parto", "2023-01-01"), ev("a", "parto", "2023-03-01")],
    });
    expect(get(r, "intervaloPartos")?.value).toBeNull();
  });

  it("natalidad: partos del último año sobre vacas y novillas de 24 meses o más", () => {
    const r = farmIndicators({
      today,
      areaHa: null,
      animals: [
        cow("v1", null),
        cow("v2", null),
        cow("v3", null),
        cow("n1", "2024-01-01", "novilla"), // 34 meses: cuenta
        cow("n2", "2025-06-01", "novilla"), // 17 meses: no cuenta
        cow("n3", null, "novilla"), // sin fecha: no se puede saber
      ],
      events: [
        ev("v1", "parto", "2026-03-01"),
        ev("v2", "parto", "2026-10-01"),
        ev("v3", "parto", "2025-06-01"), // hace más de un año
      ],
    });
    expect(get(r, "natalidad")).toEqual({ key: "natalidad", value: 50, n: 4 });
  });

  it("litros por vaca al día y ganancia diaria con los registros recientes", () => {
    const r = farmIndicators({
      today,
      areaHa: 10,
      animals: [
        cow("v1", null),
        cow("v2", null),
        { id: "t", sex: "macho", category: "novillo", birthDate: null },
      ],
      events: [
        ev("v1", "leche", "2026-11-24", { liters: 8 }),
        ev("v2", "leche", "2026-11-24", { liters: 6 }),
        ev("v1", "leche", "2026-11-23", { liters: 7 }),
        ev("v1", "leche", "2026-10-01", { liters: 50 }), // fuera de la semana
        ev("t", "peso", "2026-06-01", { kg: 300 }),
        ev("t", "peso", "2026-09-29", { kg: 362 }), // 120 días, 62 kg
      ],
    });
    expect(get(r, "litrosVacaDia")).toEqual({ key: "litrosVacaDia", value: 7, n: 3 });
    expect(get(r, "gananciaDiaria")?.value).toBe(517);
    expect(get(r, "carga")?.value).toBe(0.27);
  });

  it("sin registros no inventa cifras", () => {
    const r = farmIndicators({ today, areaHa: null, animals: [], events: [] });
    expect(r.every((i) => i.value === null)).toBe(true);
  });
});

describe("comparación con las referencias del sector", () => {
  it("usa la mediana del piso térmico y sabe qué dirección es mejor", () => {
    expect(pisoTermico(2600)).toBe("alto");
    expect(pisoTermico(80)).toBe("bajo");
    expect(pisoTermico(null)).toBeNull();
    expect(compareIndicator("edadPrimerParto", 30, "bajo")).toEqual({
      reference: 42.3,
      scope: "region",
      standing: "mejor",
    });
    expect(compareIndicator("edadPrimerParto", 40, "alto").standing).toBe("peor");
    expect(compareIndicator("natalidad", 70, null)).toEqual({
      reference: 55,
      scope: "nacional",
      standing: "mejor",
    });
    expect(compareIndicator("litrosVacaDia", 6.3, null).standing).toBe("igual");
    expect(compareIndicator("intervaloPartos", null, "alto").standing).toBe("sin_dato");
  });
});

describe("nivel del expediente predial", () => {
  const base = {
    account: true,
    location: true,
    focus: true,
    herdSize: true,
    area: true,
    animals: 30,
    paddocks: 4,
    practices: true,
    indicators: 3,
    verified: false,
  };

  it("sube de nivel solo con todo lo del nivel anterior", () => {
    expect(expedienteLevel({ ...base, location: false }).level).toBe(0);
    const l1 = expedienteLevel({ ...base, practices: false, indicators: 1 });
    expect(l1.level).toBe(1);
    expect(l1.next.map((r) => r.key)).toEqual(["practices", "indicators"]);
    const l2 = expedienteLevel(base);
    expect(l2.level).toBe(2);
    expect(l2.next.map((r) => r.key)).toEqual(["verified"]);
    expect(expedienteLevel({ ...base, verified: true })).toMatchObject({ level: 3, next: [] });
  });
});
