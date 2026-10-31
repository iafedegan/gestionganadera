import { describe, expect, it } from "vitest";
import {
  type VoiceField,
  detectCommand,
  detectConfirmation,
  detectCorrection,
  interpretAnswer,
  matchChoice,
  parseSpokenDate,
  parseSpokenNumber,
  parseSpokenTag,
  questionFor,
} from "./voice";

const TODAY = "2026-10-30";
const opts = (...l: string[]) => l.map((x) => ({ value: x, label: x }));

describe("números hablados", () => {
  it.each([
    ["18", 18],
    ["18,5", 18.5],
    ["18.5 litros", 18.5],
    ["2.500", 2500],
    ["100,000", 100000],
    ["dieciocho", 18],
    ["treinta y dos", 32],
    ["ciento veinte kilos", 120],
    ["quinientos veintitrés", 523],
    ["dos mil quinientos", 2500],
    ["cien mil pesos", 100000],
    ["doce punto cinco", 12.5],
    ["doce coma cinco", 12.5],
    ["doce y medio", 12.5],
    ["cero", 0],
  ])("%s → %d", (said, value) => {
    expect(parseSpokenNumber(said)).toBe(value);
  });

  it("no inventa números", () => {
    expect(parseSpokenNumber("no recuerdo")).toBeNull();
  });
});

describe("fechas habladas", () => {
  it.each([
    ["hoy", "2026-10-30"],
    ["ayer", "2026-10-29"],
    ["antier", "2026-10-28"],
    ["hace tres días", "2026-10-27"],
    ["hace 2 semanas", "2026-10-16"],
    ["hace un mes", "2026-09-30"],
    ["15 de marzo", "2026-03-15"],
    ["el quince de marzo", "2026-03-15"],
    ["primero de octubre", "2026-10-01"],
    ["3 de febrero de 2025", "2025-02-03"],
    ["tres de febrero de dos mil veinticinco", "2025-02-03"],
    ["15/03/2026", "2026-03-15"],
  ])("%s → %s", (said, value) => {
    expect(parseSpokenDate(said, TODAY)).toBe(value);
  });

  it("sin año toma la fecha pasada más cercana", () => {
    expect(parseSpokenDate("20 de diciembre", TODAY)).toBe("2025-12-20");
  });

  it("rechaza fechas imposibles o no entendidas", () => {
    expect(parseSpokenDate("31 de febrero", TODAY)).toBeNull();
    expect(parseSpokenDate("no me acuerdo", TODAY)).toBeNull();
  });
});

describe("opciones habladas", () => {
  const tags = opts("BOV-001", "BOV-002", "CRIA-78", "VACA-01");

  it("reconoce opciones con ruido alrededor", () => {
    expect(matchChoice(opts("Mañana", "Tarde"), "en la mañana")?.value).toBe("Mañana");
    expect(matchChoice(opts("Preñada", "Vacía", "Dudosa"), "quedó preñada")?.value).toBe("Preñada");
    expect(matchChoice(opts("Preñada", "Vacía"), "VACIA")?.value).toBe("Vacía");
  });

  it("reconoce aretes dictados de varias formas", () => {
    expect(matchChoice(tags, "bov 001")?.value).toBe("BOV-001");
    expect(matchChoice(tags, "bov cero cero dos")?.value).toBe("BOV-002");
    expect(matchChoice(tags, "vaca cero uno")?.value).toBe("VACA-01");
    expect(matchChoice(tags, "la setenta y ocho")?.value).toBe("CRIA-78");
  });

  it("no adivina cuando es ambiguo o no coincide", () => {
    expect(matchChoice(tags, "bov")).toBeNull();
    expect(matchChoice(opts("A-1", "B-1"), "uno")).toBeNull();
    expect(matchChoice(opts("Mañana", "Tarde"), "noche")).toBeNull();
    expect(matchChoice(opts("A"), "")).toBeNull();
  });
});

describe("comandos y confirmaciones", () => {
  it("distingue comandos de respuestas", () => {
    expect(detectCommand("Atrás")).toBe("atras");
    expect(detectCommand("repita")).toBe("repetir");
    expect(detectCommand("saltar.")).toBe("saltar");
    expect(detectCommand("cancelar")).toBe("detener");
    expect(detectCommand("dieciocho litros")).toBeNull();
  });

  it("entiende el sí y el no", () => {
    expect(detectConfirmation("Sí, guardar")).toBe("si");
    expect(detectConfirmation("guarda")).toBe("si");
    expect(detectConfirmation("no")).toBe("no");
    expect(detectConfirmation("nomás los litros")).toBeNull();
  });

  it("encuentra el campo a corregir", () => {
    const fields: VoiceField[] = [
      { name: "litros", label: "Litros", type: "number" },
      { name: "peso", label: "Peso al nacer (kg)", type: "number" },
    ];
    expect(detectCorrection("corregir litros", fields)?.name).toBe("litros");
    expect(detectCorrection("cambiar el peso", fields)?.name).toBe("peso");
    expect(detectCorrection("corregir color", fields)).toBeNull();
  });
});

describe("respuesta según el campo", () => {
  it("adapta el valor al tipo", () => {
    const f = (type: VoiceField["type"], extra = {}): VoiceField => ({
      name: "x",
      label: "X",
      type,
      ...extra,
    });
    expect(interpretAnswer(f("number"), "dieciocho", TODAY)).toBe("18");
    expect(interpretAnswer(f("date"), "ayer", TODAY)).toBe("2026-10-29");
    expect(interpretAnswer(f("text"), "calostro normal", TODAY)).toBe("Calostro normal");
    expect(interpretAnswer(f("tag"), "cría setenta y ocho", TODAY)).toBe("CRIA78");
    expect(
      interpretAnswer(
        f("select", { choices: [{ value: "hembra", label: "Hembra" }] }),
        "hembra",
        TODAY,
      ),
    ).toBe("hembra");
    expect(interpretAnswer(f("number"), "   ", TODAY)).toBeNull();
  });

  it("dicta aretes en mayúsculas y con dígitos", () => {
    expect(parseSpokenTag("bov cero cero uno")).toBe("BOV001");
    expect(parseSpokenTag("BOV-001")).toBe("BOV001");
    expect(parseSpokenTag("be ve setenta y ocho")).toBe("BEVE78");
  });

  it("arma la pregunta con pocas opciones y sin unidades", () => {
    expect(questionFor({ name: "p", label: "Peso (kg)", type: "number" })).toBe("Peso.");
    expect(
      questionFor({
        name: "t",
        label: "Turno",
        type: "select",
        choices: opts("Mañana", "Tarde"),
      }),
    ).toBe("Turno. Mañana, Tarde.");
    expect(questionFor({ name: "o", label: "Notas", type: "textarea", required: false })).toContain(
      "saltar",
    );
  });
});
