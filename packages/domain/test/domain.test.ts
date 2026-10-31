import type { AnimalRegisterPayload } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import {
  type ParentRef,
  can,
  estimatedLoad,
  fromHectares,
  isDryOffDue,
  isWeaningDue,
  normalizeTag,
  toHectares,
  uuidv7,
  validateAnimalEvent,
  validateRegistration,
  weaningDate,
  wouldCreateCycle,
} from "../src/index";

const base: AnimalRegisterPayload = {
  id: "11111111-1111-4111-8111-111111111111",
  farmId: "22222222-2222-4222-8222-222222222222",
  tag: " bov-001 ",
  species: "bovino",
  sex: "hembra",
  category: "vaca",
  entry: { reason: "inventario_inicial", occurredAt: "2026-10-01" },
};

const madre: ParentRef = {
  id: "33333333-3333-4333-8333-333333333333",
  species: "bovino",
  sex: "hembra",
};

describe("normalizeTag", () => {
  it("recorta, colapsa espacios y pasa a mayúsculas", () => {
    expect(normalizeTag("  bov   001 ")).toBe("BOV 001");
  });
});

describe("uuidv7", () => {
  it("tiene formato v7 y se ordena por tiempo", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_001_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});

describe("validateRegistration", () => {
  it("acepta un alta válida", () => {
    expect(validateRegistration(base, { today: "2026-10-29" })).toEqual([]);
  });

  it("exige que la categoría corresponda al sexo", () => {
    const ctx = { today: "2026-10-29" };
    expect(validateRegistration({ ...base, sex: "macho", category: "vaca" }, ctx)[0]?.code).toBe(
      "VALIDACION",
    );
    expect(validateRegistration({ ...base, sex: "macho", category: "toro" }, ctx)).toEqual([]);
    expect(validateRegistration({ ...base, sex: "macho", category: "ternero" }, ctx)).toEqual([]);
  });

  it("rechaza fechas futuras", () => {
    const issues = validateRegistration(
      { ...base, birthDate: { date: "2027-01-01", precision: "exacta" } },
      { today: "2026-10-29" },
    );
    expect(issues.map((i) => i.code)).toContain("FECHA_FUTURA");
  });

  it("no permite entrada anterior al nacimiento conocido", () => {
    const issues = validateRegistration(
      {
        ...base,
        birthDate: { date: "2026-09-01", precision: "exacta" },
        entry: { reason: "compra", occurredAt: "2026-08-01" },
      },
      { today: "2026-10-29" },
    );
    expect(issues).toHaveLength(1);
  });

  it("exige madre hembra de la misma especie", () => {
    const ctx = { today: "2026-10-29" };
    expect(
      validateRegistration({ ...base, motherId: madre.id }, { ...ctx, mother: madre }),
    ).toEqual([]);
    const bufala: ParentRef = { ...madre, species: "bufalino" };
    expect(
      validateRegistration({ ...base, motherId: madre.id }, { ...ctx, mother: bufala })[0]?.code,
    ).toBe("MADRE_INVALIDA");
    const macho: ParentRef = { ...madre, sex: "macho" };
    expect(
      validateRegistration({ ...base, motherId: madre.id }, { ...ctx, mother: macho })[0]?.code,
    ).toBe("MADRE_INVALIDA");
  });

  it("rechaza madre inexistente (referencia desconocida)", () => {
    expect(
      validateRegistration({ ...base, motherId: madre.id }, { today: "2026-10-29" })[0]?.code,
    ).toBe("MADRE_INVALIDA");
  });

  it("admite ascendencia desconocida sin inventar datos", () => {
    expect(validateRegistration(base, { today: "2026-10-29" })).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  const nodes = new Map<string, ParentRef>([
    ["a", { id: "a", species: "bovino", sex: "hembra", motherId: "b" }],
    ["b", { id: "b", species: "bovino", sex: "hembra", motherId: "c" }],
    ["c", { id: "c", species: "bovino", sex: "hembra" }],
  ]);
  const lookup = (id: string) => nodes.get(id);

  it("detecta que un ancestro no puede ser descendiente", () => {
    expect(wouldCreateCycle("c", "a", lookup)).toBe(true);
  });
  it("permite un ascendiente nuevo", () => {
    expect(wouldCreateCycle("z", "a", lookup)).toBe(false);
  });
  it("detecta autoreferencia", () => {
    expect(wouldCreateCycle("a", "a", lookup)).toBe(true);
  });
});

describe("permisos", () => {
  it("operario y técnico no registran animales ni fincas", () => {
    expect(can("operario", "animal.write")).toBe(false);
    expect(can("tecnico", "farm.write")).toBe(false);
  });
  it("técnico no accede a economía por defecto", () => {
    expect(can("tecnico", "economy.read")).toBe(false);
  });
  it("propietario registra animales", () => {
    expect(can("propietario", "animal.write")).toBe(true);
  });
});

describe("perfil de finca", () => {
  it("convierte unidades de área", () => {
    expect(toHectares(100, "fanegada")).toBe(64);
    expect(fromHectares(64, "fanegada")).toBe(100);
    expect(toHectares(10, "ha")).toBe(10);
    expect(toHectares(1, "acre")).toBeCloseTo(0.4047, 4);
  });

  it("estima la carga sobre el área ganadera", () => {
    const herd = [
      { category: "vaca", n: 10 },
      { category: "ternero", n: 10 },
    ];
    expect(estimatedLoad(herd, 13).ugg).toBeCloseTo(13);
    expect(estimatedLoad(herd, 13).perHa).toBeCloseTo(1);
    expect(estimatedLoad(herd, null).perHa).toBeNull();
  });

  it("calcula el destete y su ventana de aviso", () => {
    expect(weaningDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(weaningDate("2026-03-15", 8)).toBe("2026-11-15");
    expect(isWeaningDue("2026-03-15", 8, "2026-11-08")).toBe(true);
    expect(isWeaningDue("2026-03-15", 8, "2026-11-07")).toBe(false);
    expect(isWeaningDue("2026-03-15", 8, "2026-12-15")).toBe(true);
    expect(isWeaningDue("2026-03-15", 8, "2026-12-16")).toBe(false);
  });
});

describe("eventos del animal", () => {
  const ctx = { today: "2026-10-30", sex: "hembra", status: "activo", birthDate: "2020-01-01" };

  it("valida fecha, estado y sexo", () => {
    expect(validateAnimalEvent({ type: "parto", occurredOn: "2026-10-30" }, ctx)).toEqual([]);
    const code = (type: string, occurredOn: string, c = ctx) =>
      validateAnimalEvent({ type, occurredOn }, c)[0]?.code;
    expect(code("parto", "2026-10-31")).toBe("FECHA_FUTURA");
    expect(code("parto", "2019-12-31")).toBe("VALIDACION");
    expect(code("leche", "2026-10-30", { ...ctx, sex: "macho" })).toBe("EVENTO_NO_APLICA");
    expect(code("peso", "2026-10-30", { ...ctx, sex: "macho" })).toBeUndefined();
    expect(code("peso", "2026-10-30", { ...ctx, status: "vendido" })).toBe("ANIMAL_INACTIVO");
  });

  it("deja que el operario y el técnico registren eventos, no animales", () => {
    expect(can("operario", "event.write")).toBe(true);
    expect(can("tecnico", "event.write")).toBe(true);
    expect(can("operario", "animal.write")).toBe(false);
  });

  it("avisa el secado por días de lactancia hasta registrarlo", () => {
    const parto = { type: "parto", occurredOn: "2026-01-01" };
    expect(isDryOffDue([], 305, "2026-12-31")).toBe(false);
    expect(isDryOffDue([parto], 305, "2026-11-01")).toBe(false);
    expect(isDryOffDue([parto], 305, "2026-11-02")).toBe(true);
    expect(
      isDryOffDue([parto, { type: "secado", occurredOn: "2026-10-01" }], 305, "2026-12-01"),
    ).toBe(false);
    expect(
      isDryOffDue([{ type: "secado", occurredOn: "2025-12-01" }, parto], 305, "2026-12-01"),
    ).toBe(true);
  });
});
