import { describe, expect, it } from "vitest";
import {
  EXPORT_COUNTRIES,
  EXPORT_DOCS,
  countriesFor,
  docId,
  docsFor,
  exportAnswered,
  exportPlan,
} from "../src/exportDocs";

describe("exportación", () => {
  it("cada documento es único por producto y trae su fuente", () => {
    const ids = EXPORT_DOCS.map(docId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of EXPORT_DOCS) expect(d.source.length).toBeGreaterThan(3);
  });

  it("ofrece solo países con algo que decir para lo que se quiere exportar", () => {
    const carne = countriesFor(["carne"]).map((c) => c.name);
    expect(carne).toContain("China");
    expect(carne).not.toContain("Irak");
    expect(countriesFor(["ganado_pie"]).map((c) => c.name)).toContain("Irak");
    expect(countriesFor(["ganado_pie", "carne"]).length).toBeGreaterThan(carne.length - 1);
    expect(EXPORT_COUNTRIES.every((c) => Object.keys(c.access).length > 0)).toBe(true);
  });

  it("separa lo que tiene, lo que tramita y lo que falta", () => {
    const docs = docsFor("ganado_pie");
    const plan = exportPlan({
      products: ["ganado_pie"],
      country: "Irak",
      docs: { [docId(docs[0] as never)]: "si", [docId(docs[1] as never)]: "tramite" },
    });
    const line = plan.lines[0];
    expect(line?.have).toHaveLength(1);
    expect(line?.inProgress).toHaveLength(1);
    expect(line?.missing).toHaveLength(docs.length - 2);
    expect(line?.next.length).toBeGreaterThan(3);
  });

  it("avisa de la restricción de ganado en pie y de países sin acceso", () => {
    const live = exportPlan({ products: ["ganado_pie"], country: "Irak", docs: {} });
    expect(live.notes.join(" ")).toContain("abril de 2026");
    const us = exportPlan({ products: ["carne"], country: "Estados Unidos", docs: {} });
    expect(us.notes[0]).toContain("no tiene acceso");
    expect(us.lines[0]?.access).toBe("sin_acceso");
    const mixed = exportPlan({ products: ["ganado_pie", "carne"], country: "Irak", docs: {} });
    expect(mixed.lines[0]?.countryNote).toContain("Primer destino");
    expect(mixed.lines[1]?.countryNote).toBeNull();
    expect(mixed.lines[1]?.access).toBeNull();
    const other = exportPlan({ products: ["carne"], country: "Mongolia", docs: {} });
    expect(other.lines[0]?.access).toBeNull();
  });

  it("sabe cuándo se respondieron todos los documentos", () => {
    const all = Object.fromEntries(docsFor("genetica").map((d) => [docId(d), "si" as const]));
    expect(exportAnswered({ products: ["genetica"], docs: all })).toBe(true);
    expect(exportAnswered({ products: ["genetica"], docs: {} })).toBe(false);
    expect(exportAnswered({ products: [], docs: {} })).toBe(false);
  });
});
