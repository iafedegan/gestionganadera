import { describe, expect, it } from "vitest";
import { DEMO_SPECS, buildHerd, demoProfile } from "../src/demoData";

const TODAY = "2026-11-06";

describe("datos de muestra", () => {
  it("cada perfil trae un perfil de finca válido", () => {
    for (const s of DEMO_SPECS) expect(() => demoProfile(s)).not.toThrow();
    expect(DEMO_SPECS.map((s) => s.key)).toEqual([
      "sin_datos",
      "pequeno",
      "mediano",
      "grande",
      "completo",
    ]);
    expect(new Set(DEMO_SPECS.map((s) => s.email)).size).toBe(DEMO_SPECS.length);
  });

  it("el tamaño del hato sigue lo que dice cada perfil", () => {
    const n = (key: string) => {
      const spec = DEMO_SPECS.find((s) => s.key === key);
      return spec ? buildHerd(spec, TODAY).animals.length : -1;
    };
    expect(n("sin_datos")).toBe(0);
    expect(n("pequeno")).toBeGreaterThanOrEqual(20);
    expect(n("pequeno")).toBeLessThan(40);
    expect(n("mediano")).toBeGreaterThan(100);
    expect(n("grande")).toBeGreaterThan(450);
    expect(n("completo")).toBeGreaterThan(200);
  });

  it("los animales y eventos son coherentes", () => {
    for (const spec of DEMO_SPECS) {
      const { animals, events } = buildHerd(spec, TODAY);
      const byId = new Map(animals.map((a) => [a.id, a]));
      expect(new Set(animals.map((a) => a.tag)).size).toBe(animals.length);
      for (const a of animals) {
        expect(a.birthDate <= TODAY).toBe(true);
        if (a.motherId) expect(byId.get(a.motherId)?.sex).toBe("hembra");
        if (a.fatherId) expect(byId.get(a.fatherId)?.sex).toBe("macho");
        if (a.category === "vaca" || a.category === "novilla") expect(a.sex).toBe("hembra");
        if (a.category === "toro" || a.category === "novillo") expect(a.sex).toBe("macho");
      }
      for (const e of events) {
        const a = byId.get(e.animalId);
        expect(a).toBeDefined();
        expect(e.occurredOn <= TODAY).toBe(true);
        expect((a?.birthDate ?? "") <= e.occurredOn).toBe(true);
        if (["leche", "parto", "servicio", "dx", "cmt"].includes(e.type))
          expect(a?.sex).toBe("hembra");
      }
    }
  });

  it("el perfil con todo incluye ordeños, partos, retiros y exportación", () => {
    const spec = DEMO_SPECS.find((s) => s.key === "completo");
    expect(spec?.team.length).toBeGreaterThanOrEqual(3);
    expect(spec?.pendingInvitation).toBe(true);
    expect(demoProfile(spec as never)?.exportPlan?.country).toBe("Irak");
    const types = new Set(buildHerd(spec as never, TODAY).events.map((e) => e.type));
    for (const t of ["leche", "parto", "servicio", "peso", "salud"])
      expect(types.has(t)).toBe(true);
  });

  it("es repetible: mismos datos con la misma semilla", () => {
    const spec = DEMO_SPECS[3] as never;
    const a = buildHerd(spec, TODAY, 3);
    const b = buildHerd(spec, TODAY, 3);
    expect(a.animals.map((x) => x.birthDate)).toEqual(b.animals.map((x) => x.birthDate));
    expect(a.events.length).toBe(b.events.length);
  });

  it("el perfil de cada cuenta dice lo mismo que su hato", () => {
    for (const spec of DEMO_SPECS.filter((x) => x.profile)) {
      const herd = buildHerd(spec, TODAY);
      const p = demoProfile(spec, herd);
      expect(p?.heads).toBe(herd.animals.length);
      expect(p?.cows).toBe(herd.animals.filter((a) => a.category === "vaca").length);
      expect((p?.milking ?? 0) <= (p?.cows ?? 0)).toBe(true);
    }
  });
});
