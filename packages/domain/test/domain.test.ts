import type { AnimalRegisterPayload } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import {
  type ParentRef,
  can,
  normalizeTag,
  uuidv7,
  validateRegistration,
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
