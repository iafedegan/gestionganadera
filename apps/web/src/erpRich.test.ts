import { describe, expect, it } from "vitest";
import { DELIVERIES, type Delivery, type Invoice, PEOPLE, type Person } from "./erpData";
import "./erpRich";
import type { Mov } from "./herd";
import { seedFor, setDataScope } from "./lib/scope";

describe("datos de ejemplo de la cuenta grande", () => {
  it("solo se usan en la cuenta grande de muestra", () => {
    setDataScope("org-pequena", true, false);
    expect(seedFor("entregas", DELIVERIES)).toBe(DELIVERIES);
    setDataScope("org-real", false, true);
    expect(seedFor("entregas", DELIVERIES)).toBe(DELIVERIES);
  });

  it("son muchos y cuadran entre sí", () => {
    setDataScope("org-grande", true, true);
    const entregas = seedFor<Delivery[]>("entregas", []);
    const personas = seedFor<Person[]>("personas", []);
    const facturas = seedFor<Invoice[]>("facturas", []);
    const movs = seedFor<Mov[]>("movs-eco", []);
    // Tres compradores por día durante 90 días, a la escala de la finca (~4.400 L/día).
    expect(entregas).toHaveLength(270);
    const hoy = entregas.filter((d) => d.fecha === entregas[0]?.fecha);
    const litros = hoy.reduce((s, d) => s + d.litros, 0);
    expect(litros).toBeGreaterThan(3_800);
    expect(litros).toBeLessThan(5_000);
    // Las personas de antes siguen (los turnos y tareas las nombran) y llegan las nuevas.
    expect(personas.length).toBe(PEOPLE.length + 17);
    expect(personas.map((p) => p.nombre)).toEqual(
      expect.arrayContaining(PEOPLE.map((p) => p.nombre)),
    );
    // Lo facturado y lo cobrado salen de las mismas entregas.
    expect(facturas.some((f) => f.cliente === "Cooperativa Lechera de Casanare")).toBe(true);
    const cats = new Set(movs.map((m) => m.categoria));
    for (const c of ["Leche bovina", "Leche de búfala", "Ganado", "Mano de obra", "Mantenimiento"])
      expect(cats).toContain(c);
    expect(movs.length).toBeGreaterThan(150);
    // Se calcula una vez: la misma lista en cada pantalla.
    expect(seedFor("entregas", [])).toBe(entregas);
  });
});
