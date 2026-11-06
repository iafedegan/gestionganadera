import { describe, expect, it } from "vitest";
import {
  type ExportAnimal,
  type PredioInfo,
  ageMonths,
  animalListRows,
  embarkDeadlines,
  predioAnnexRows,
  restrictionFlags,
  solicitudText,
} from "../src/exportForms";

const animal = (tag: string, extra: Partial<ExportAnimal> = {}): ExportAnimal => ({
  tag,
  species: "bovino",
  sex: "macho",
  category: "novillo",
  birthDate: "2024-01-15",
  farmId: "f1",
  ...extra,
});

describe("trámites del ICA", () => {
  it("calcula las fechas límite desde el embarque", () => {
    expect(embarkDeadlines("2027-03-01")).toEqual({
      solicitud: "2027-01-20",
      cuarentena: "2027-01-30",
    });
  });

  it("calcula la edad en meses completos", () => {
    expect(ageMonths("2025-01-15", "2026-11-14")).toBe(21);
    expect(ageMonths("2025-01-15", "2026-11-15")).toBe(22);
    expect(ageMonths("2030-01-01", "2026-11-15")).toBe(0);
  });

  it("marca los animales que podría alcanzar la restricción de 2026", () => {
    const f = restrictionFlags(
      [
        animal("A1", { birthDate: "2026-02-01" }),
        animal("A2", { birthDate: "2020-01-01" }),
        animal("A3", { sex: "hembra", category: "vaca", birthDate: "2020-01-01" }),
        animal("A4", { sex: "hembra", category: "novilla", birthDate: null }),
      ],
      "2026-11-15",
    );
    expect(f).toEqual({ young: 1, breedingFemales: 2, unknownAge: 1 });
  });

  it("arma el anexo de predios solo con los que aportan animales", () => {
    const predios: PredioInfo[] = [
      {
        farmId: "f1",
        name: "La Esperanza",
        departamento: "Córdoba",
        municipio: "Montería",
        vereda: "El Bosque",
        propietario: "Ana Gómez",
      },
      {
        farmId: "f2",
        name: "Sin animales",
        departamento: "",
        municipio: "",
        vereda: "",
        propietario: "",
      },
    ];
    expect(predioAnnexRows(predios, [animal("A"), animal("B")])).toEqual([
      ["La Esperanza", "Córdoba", "Montería", "El Bosque", "2", "Ana Gómez"],
    ]);
  });

  it("ordena el listado de animales por número y traduce los datos", () => {
    const rows = animalListRows(
      [animal("BOV-10"), animal("BOV-2", { sex: "hembra", category: "vaca", species: "bufalino" })],
      { f1: "La Esperanza" },
    );
    expect(rows[0]).toEqual([
      "1",
      "BOV-2",
      "Bufalino",
      "Hembra",
      "Vaca",
      "2024-01-15",
      "La Esperanza",
    ]);
    expect(rows[1]?.[1]).toBe("BOV-10");
  });

  it("redacta la solicitud con los datos y la fecha límite", () => {
    const t = solicitudText({
      country: "Irak",
      embarque: "2027-03-01",
      puerto: "Cartagena",
      buque: "",
      use: "sacrificio",
      fobValue: "",
      animals: 120,
      species: ["bovino"],
      contact: "Ana Gómez",
    });
    expect(t.subject).toContain("Irak");
    expect(t.body).toContain("exportar bovinos en pie a Irak");
    expect(t.body).toContain("Cantidad de animales: 120");
    expect(t.body).toContain("Uso: Sacrificio");
    expect(t.body).toContain("Nombre del buque: (por definir)");
    expect(t.body).toContain("a más tardar el 2027-01-20");
    expect(t.body).not.toContain("Valor FOB");
  });
});
