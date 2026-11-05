import { FarmProfile } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import { diagnose, farmSize, suggestedLevel } from "../src/index";

const base = FarmProfile.parse({
  level: "rapido",
  goals: ["leche"],
  focus: "doble_proposito",
  heads: 60,
  cows: 30,
  milking: 12,
  milkLitersDay: 36,
  areaHa: 50,
  system: "extensivo",
  records: "cuaderno",
  breeding: "monta",
  pregCheck: "nunca",
  vet: "problemas",
  knowsCost: "no",
});

describe("diagnóstico rápido", () => {
  it("clasifica el tamaño y sugiere el nivel", () => {
    expect(farmSize(20)).toBe("pequena");
    expect(farmSize(120)).toBe("mediana");
    expect(farmSize(900)).toBe("grande");
    expect(suggestedLevel(20)).toBe("rapido");
    expect(suggestedLevel(120)).toBe("completo");
  });

  it("marca prioridades y acciones según respuestas y objetivos", () => {
    const d = diagnose(base);
    const by = Object.fromEntries(d.areas.map((a) => [a.key, a]));
    expect(by.carga?.figure).toBe("1,2 animales/ha");
    expect(by.carga?.level).toBe("bien");
    expect(by.leche?.level).toBe("prioridad"); // 3 L por vaca
    expect(by.leche?.text).toContain("40 %");
    expect(by.reproduccion?.level).toBe("prioridad");
    expect(by.finanzas?.level).toBe("prioridad");
    expect(d.areas[0]?.level).toBe("prioridad");
    expect(d.actions.length).toBe(3);
    expect(d.actions[0]?.module).toBe("produccion");
  });

  it("exige litros y vacas en ordeño si produce leche", () => {
    const r = FarmProfile.safeParse({ ...base, milking: undefined });
    expect(r.success).toBe(false);
    const carne = FarmProfile.safeParse({
      ...base,
      focus: "carne",
      milking: undefined,
      milkLitersDay: undefined,
    });
    expect(carne.success).toBe(true);
  });

  it("detecta sobrecarga", () => {
    const d = diagnose({ ...base, heads: 300, areaHa: 50 });
    expect(d.areas.find((a) => a.key === "carga")?.level).toBe("prioridad");
  });
});
