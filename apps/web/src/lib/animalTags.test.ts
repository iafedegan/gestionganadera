import { describe, expect, it } from "vitest";
import { ageText, animalInfo } from "./animalTags";

const today = "2026-11-26";
const ev = (animalId: string, type: string, occurredOn: string, data: object = {}) => ({
  animalId,
  type,
  occurredOn,
  data,
});

describe("animalInfo", () => {
  it("marca preñez, ordeño y suma los litros del último día", () => {
    const info = animalInfo(
      [
        ev("a", "servicio", "2026-08-01"),
        ev("a", "dx", "2026-09-10", { result: "Preñada" }),
        ev("a", "leche", "2026-11-25", { liters: 8 }),
        ev("a", "leche", "2026-11-25", { liters: 6.5 }),
        ev("a", "leche", "2026-11-24", { liters: 20 }),
      ],
      today,
    ).get("a");
    expect(info?.flags).toEqual(["prenada", "ordeno"]);
    expect(info?.last).toEqual({ value: 14.5, unit: "L", on: "2026-11-25" });
  });

  it("avisa palpación pendiente y retiro, y muestra el último peso", () => {
    const info = animalInfo(
      [
        ev("b", "servicio", "2026-10-01"),
        ev("b", "salud", "2026-11-20", { milkWithdrawalDays: 10 }),
        ev("b", "peso", "2026-09-01", { kg: 300 }),
        ev("b", "peso", "2026-11-01", { kg: 342 }),
      ],
      today,
    ).get("b");
    expect(info?.flags).toEqual(["retiro", "palpar"]);
    expect(info?.last).toEqual({ value: 342, unit: "kg", on: "2026-11-01" });
  });

  it("no arrastra estados viejos: parto, secado y retiro vencido", () => {
    const info = animalInfo(
      [
        ev("c", "servicio", "2026-01-01"),
        ev("c", "dx", "2026-02-10", { result: "Preñada" }),
        ev("c", "parto", "2026-10-10"),
        ev("c", "leche", "2026-11-24", { liters: 9 }),
        ev("c", "secado", "2026-11-25"),
        ev("c", "salud", "2026-09-01", { meatWithdrawalDays: 15 }),
        ev("c", "peso", "2027-01-01", { kg: 999 }),
      ],
      today,
    ).get("c");
    expect(info?.flags).toEqual([]);
    expect(info?.last).toBeNull();
  });
});

describe("ageText", () => {
  it("dice la edad en palabras cortas", () => {
    expect(ageText("2026-11-10", today)).toBe("recién nacido");
    expect(ageText("2026-04-26", today)).toBe("7 meses");
    expect(ageText("2025-07-01", today)).toBe("1 año 4 m");
    expect(ageText("2021-03-01", today)).toBe("5 años");
    expect(ageText(null, today)).toBe("");
  });
});
