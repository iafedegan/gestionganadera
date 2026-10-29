import { describe, expect, it } from "vitest";
import { allocateFefo, round3, stockStatus, validateStockReceive } from "../src/index";

const lots = [
  { lotCode: "B", expiresOn: "2027-03-01", balance: 10 },
  { lotCode: "A", expiresOn: "2027-01-15", balance: 4 },
  { lotCode: "S", expiresOn: null, balance: 50 },
  { lotCode: "X", expiresOn: "2026-09-01", balance: 7 },
];

describe("allocateFefo", () => {
  it("consume primero el lote que vence antes y salta los vencidos", () => {
    const r = allocateFefo(lots, 12, "2026-10-29");
    expect(r.ok).toBe(true);
    expect(r.allocations).toEqual([
      { lotCode: "A", expiresOn: "2027-01-15", quantity: 4 },
      { lotCode: "B", expiresOn: "2027-03-01", quantity: 8 },
    ]);
    expect(r.expired).toBe(7);
  });

  it("deja al final los lotes sin vencimiento", () => {
    const r = allocateFefo(lots, 20, "2026-10-29");
    expect(r.allocations.map((a) => a.lotCode)).toEqual(["A", "B", "S"]);
    expect(r.allocations[2]?.quantity).toBe(6);
  });

  it("no asigna nada si la existencia vigente no alcanza", () => {
    const r = allocateFefo(lots, 1000, "2026-10-29");
    expect(r).toMatchObject({ ok: false, allocations: [], available: 64 });
  });

  it("no usa un lote vencido aunque sea lo único que hay", () => {
    const r = allocateFefo(
      [{ lotCode: "X", expiresOn: "2026-09-01", balance: 7 }],
      1,
      "2026-10-29",
    );
    expect(r.ok).toBe(false);
    expect(r.expired).toBe(7);
  });

  it("maneja decimales sin error de punto flotante", () => {
    const r = allocateFefo(
      [{ lotCode: null, expiresOn: null, balance: 0.3 }],
      0.1 + 0.2,
      "2026-10-29",
    );
    expect(r.ok).toBe(true);
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});

describe("stockStatus", () => {
  const base = { today: "2026-10-29", minStock: 10 };
  it("sin existencia, vencido, por vencer, bajo mínimo y normal", () => {
    expect(stockStatus({ ...base, onHand: 0, nearestExpiry: null })).toBe("sin_existencia");
    expect(stockStatus({ ...base, onHand: 50, nearestExpiry: "2026-10-01" })).toBe("vencido");
    expect(stockStatus({ ...base, onHand: 50, nearestExpiry: "2026-11-15" })).toBe("vence_pronto");
    expect(stockStatus({ ...base, onHand: 5, nearestExpiry: "2027-06-01" })).toBe("bajo_minimo");
    expect(stockStatus({ ...base, onHand: 50, nearestExpiry: "2027-06-01" })).toBe("normal");
  });
  it("el vencimiento pesa más que el mínimo", () => {
    expect(stockStatus({ ...base, onHand: 5, nearestExpiry: "2026-11-01" })).toBe("vence_pronto");
  });
  it("sin mínimo definido no avisa por mínimo", () => {
    expect(stockStatus({ today: "2026-10-29", minStock: 0, onHand: 1, nearestExpiry: null })).toBe(
      "normal",
    );
  });
});

describe("validateStockReceive", () => {
  const ctx = { today: "2026-10-29" };
  it("acepta una recepción válida", () => {
    expect(
      validateStockReceive({ quantity: 5, occurredOn: "2026-10-28", expiresOn: "2027-01-01" }, ctx),
    ).toEqual([]);
  });
  it("rechaza fecha futura y producto ya vencido", () => {
    expect(validateStockReceive({ quantity: 5, occurredOn: "2027-01-01" }, ctx)[0]?.code).toBe(
      "FECHA_FUTURA",
    );
    expect(
      validateStockReceive(
        { quantity: 5, occurredOn: "2026-10-01", expiresOn: "2026-09-01" },
        ctx,
      )[0]?.code,
    ).toBe("VALIDACION");
  });
});
