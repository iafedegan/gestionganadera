import { describe, expect, it } from "vitest";
import { type ModuleKey, modulesFor } from "./modules";

const keys = (role: Parameters<typeof modulesFor>[0]) => modulesFor(role).map((m) => m.key);
const ECOSISTEMA: ModuleKey[] = ["noticias", "tienda", "comunidad"];

describe("menú por perfil", () => {
  it("el veterinario ve su trabajo clínico, no potreros, expediente, bosque ni el gremio", () => {
    expect(keys("veterinario")).toEqual([
      "inicio",
      "proyeccion",
      "animales",
      "produccion",
      "reproduccion",
      "sanidad",
      "asistencia",
      "configuracion",
    ]);
  });

  it("nadie del equipo de campo ve costos ni la gestión de la empresa", () => {
    for (const r of ["mayordomo", "veterinario", "operario", "tecnico"] as const) {
      const k = keys(r);
      for (const m of ["economia", "contabilidad", "ventas", "personal", "activos"] as const)
        expect(k).not.toContain(m);
      for (const m of ECOSISTEMA) expect(k).not.toContain(m);
    }
  });

  it("el mayordomo maneja potreros y bodega; el operario anota el día y se capacita", () => {
    expect(keys("mayordomo")).toEqual(expect.arrayContaining(["pasturas", "compras"]));
    expect(keys("operario")).toEqual(expect.arrayContaining(["produccion", "capacitacion"]));
    expect(keys("operario")).not.toContain("compras");
    expect(keys("operario")).not.toContain("proyeccion");
    expect(keys("mayordomo")).toContain("proyeccion");
  });

  it("el administrador ve la economía y la gestión; el dueño, todo", () => {
    expect(keys("admin_entidad")).toEqual(
      expect.arrayContaining(["economia", "ventas", "compras", "personal", "noticias"]),
    );
    expect(keys("propietario")).toHaveLength(21);
  });
});
