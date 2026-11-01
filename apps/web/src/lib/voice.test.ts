import { describe, expect, it } from "vitest";
import {
  type VoiceField,
  detectCommand,
  detectConfirmation,
  detectCorrection,
  endsWithSave,
  extractAnswers,
  interpretAnswer,
  matchChoice,
  needsAnswer,
  parseSpokenDate,
  parseSpokenNumber,
  parseSpokenTag,
  questionFor,
  sanityDoubt,
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

  it("hace preguntas cortas y detalla las opciones solo si no entendió", () => {
    const turno: VoiceField = {
      name: "t",
      label: "Turno",
      type: "select",
      choices: opts("Mañana", "Tarde"),
    };
    expect(questionFor({ name: "p", label: "Peso (kg)", type: "number" })).toBe("Peso?");
    expect(questionFor(turno)).toBe("Turno?");
    expect(questionFor(turno, true)).toBe("Turno: Mañana, Tarde.");
  });
});

describe("varios datos en una sola frase", () => {
  const ordeno: VoiceField[] = [
    {
      name: "tag",
      label: "Animal",
      type: "select",
      choices: opts("VACA-01", "BOV-002", "CRIA-78"),
    },
    { name: "fecha", label: "Fecha", type: "date" },
    { name: "turno", label: "Turno", type: "select", choices: opts("Mañana", "Tarde") },
    { name: "litros", label: "Litros", type: "number" },
  ];
  const x = (text: string, fields = ordeno, current?: string) =>
    extractAnswers(fields, text, TODAY, current);

  it("llena todo el ordeño en cualquier orden", () => {
    const want = { tag: "VACA-01", fecha: "2026-10-30", turno: "Tarde", litros: "18" };
    expect(x("vaca cero uno hoy en la tarde dieciocho litros").values).toEqual(want);
    expect(x("18 litros, tarde, hoy, vaca 01").values).toEqual(want);
    expect(x("hoy turno tarde litros 18 animal vaca cero uno").values).toEqual(want);
  });

  it("acepta datos parciales y decimales", () => {
    expect(x("dieciocho y medio litros").values).toEqual({ litros: "18.5" });
    expect(x("tarde 12,5").values).toEqual({ turno: "Tarde", litros: "12.5" });
    expect(x("la vaca bov cero cero dos en la mañana").values).toMatchObject({
      tag: "BOV-002",
      turno: "Mañana",
    });
  });

  it("tolera errores del reconocedor en palabras, nunca en cifras", () => {
    expect(x("baca cero uno").values.tag).toBe("VACA-01");
    expect(x("en la mañanas").values.turno).toBe("Mañana");
    // Esa vaca no existe: no se anota en otro animal ni el número se toma como litros.
    expect(x("vaca cero dos").values).toEqual({});
  });

  it("no inventa datos con ruido", () => {
    expect(x("buenos días señor").values).toEqual({});
  });

  it("reparte números por su nombre, sin confundirlos", () => {
    const f: VoiceField[] = [
      { name: "peso", label: "Peso (kg)", type: "number" },
      { name: "costo", label: "Costo (COP)", type: "number" },
    ];
    expect(extractAnswers(f, "cien mil pesos y 350 kilos", TODAY).values).toEqual({
      costo: "100000",
      peso: "350",
    });
    expect(extractAnswers(f, "costo 5000 peso 420", TODAY).values).toEqual({
      costo: "5000",
      peso: "420",
    });
  });

  it("separa áreas y unidad al registrar una finca", () => {
    const f: VoiceField[] = [
      {
        name: "unit",
        label: "Unidad de medida",
        type: "select",
        choices: opts("Hectárea", "Fanegada"),
      },
      { name: "total", label: "Área total", type: "number" },
      { name: "gan", label: "Área en ganadería", type: "number" },
    ];
    expect(extractAnswers(f, "150 en ganadería y 200 total en fanegadas", TODAY).values).toEqual({
      unit: "Fanegada",
      gan: "150",
      total: "200",
    });
    expect(extractAnswers(f, "doscientas hectáreas ciento cincuenta", TODAY).values).toEqual({
      unit: "Hectárea",
      total: "200",
      gan: "150",
    });
  });

  it("toma textos nombrados y fechas de varios campos", () => {
    const f: VoiceField[] = [
      { name: "entrada", label: "Fecha de entrada", type: "date" },
      { name: "nacio", label: "Fecha de nacimiento", type: "date", required: false },
      { name: "motivo", label: "Motivo o diagnóstico", type: "text" },
      { name: "resp", label: "Responsable", type: "text" },
    ];
    expect(
      extractAnswers(
        f,
        "hoy nacimiento 15 de marzo de 2022 motivo ciclo nacional responsable doctora ruiz",
        TODAY,
      ).values,
    ).toEqual({
      entrada: "2026-10-30",
      nacio: "2022-03-15",
      motivo: "Ciclo nacional",
      resp: "Doctora ruiz",
    });
  });

  it("dicta aretes nuevos con su nombre o sin él", () => {
    const f: VoiceField[] = [
      { name: "tag", label: "Arete del animal", type: "tag" },
      { name: "cat", label: "Categoría", type: "select", choices: opts("Vaca", "Toro") },
    ];
    expect(extractAnswers(f, "arete cero cinco vaca", TODAY).values).toEqual({
      tag: "05",
      cat: "Vaca",
    });
    expect(extractAnswers(f, "bov cero cero nueve toro", TODAY).values).toEqual({
      tag: "BOV009",
      cat: "Toro",
    });
  });

  it("deja el sobrante para un campo de texto", () => {
    const f: VoiceField[] = [
      { name: "name", label: "Nombre de la finca", type: "text" },
      { name: "focus", label: "Especialidad", type: "select", choices: opts("Leche", "Carne") },
    ];
    const r = extractAnswers(f, "el porvenir carne", TODAY, "name");
    expect(r.values).toEqual({ focus: "Carne" });
    expect(r.rest).toBe("el porvenir");
  });

  it("sabe qué falta preguntar", () => {
    const select: VoiceField = { name: "s", label: "S", type: "select", choices: opts("A", "B") };
    expect(needsAnswer(select, "A")).toBe(true);
    expect(needsAnswer({ ...select, defaultOk: true }, "A")).toBe(false);
    expect(needsAnswer({ ...select, choices: opts("A") }, "A")).toBe(false);
    expect(needsAnswer({ name: "d", label: "D", type: "date" }, "2026-10-30")).toBe(false);
    expect(needsAnswer({ name: "n", label: "N", type: "number" }, "")).toBe(true);
    expect(needsAnswer({ name: "o", label: "O", type: "text", required: false }, "")).toBe(false);
  });

  it("detecta guardar al final de la frase", () => {
    expect(endsWithSave("dieciocho litros guardar")).toBe(true);
    expect(endsWithSave("dieciocho litros, listo.")).toBe(true);
    expect(endsWithSave("guardar dieciocho")).toBe(false);
  });
});

describe("valores raros", () => {
  const litros: VoiceField = { name: "l", label: "Litros", type: "number" };
  const nacer: VoiceField = { name: "n", label: "Peso al nacer (kg)", type: "number" };
  const peso: VoiceField = { name: "p", label: "Peso (kg)", type: "number" };

  it("duda de lo que no cuadra y deja pasar lo normal", () => {
    expect(sanityDoubt(litros, "180")).toContain("180 litros");
    expect(sanityDoubt(litros, "18")).toBeNull();
    expect(sanityDoubt(nacer, "350")).toContain("al nacer");
    expect(sanityDoubt(nacer, "36")).toBeNull();
    expect(sanityDoubt(peso, "5000")).toContain("5000 kilos");
    expect(sanityDoubt(peso, "350")).toBeNull();
    expect(sanityDoubt({ name: "o", label: "Notas", type: "text" }, "180")).toBeNull();
  });
});

describe("vocabulario del campo", () => {
  const pick = (labels: string[], said: string) => matchChoice(opts(...labels), said)?.value;

  it("entiende cómo se dice cada opción", () => {
    expect(pick(["Preñada", "Vacía", "Dudosa"], "quedó cargada")).toBe("Preñada");
    expect(pick(["Preñada", "Vacía", "Dudosa"], "no quedó")).toBe("Vacía");
    expect(pick(["Ecografía", "Palpación rectal"], "por tacto")).toBe("Palpación rectal");
    expect(pick(["IA", "Monta"], "fue inseminada")).toBe("IA");
    expect(pick(["Normal", "Asistido", "Distocia (cesárea)"], "le hicieron cesárea")).toBe(
      "Distocia (cesárea)",
    );
    expect(pick(["Ternero", "Novilla", "Vaca"], "una becerra")).toBe("Ternero");
    expect(pick(["Ternero", "Novilla", "Vaca"], "vaquilla")).toBe("Novilla");
    expect(pick(["Vacunación", "Tratamiento", "Desparasitación"], "la purgué")).toBe(
      "Desparasitación",
    );
    expect(pick(["Mañana", "Tarde"], "bien temprano")).toBe("Mañana");
    expect(pick(["Báscula", "Cinta", "Estimado"], "a ojo")).toBe("Estimado");
  });

  it("encuentra un producto por la palabra que solo él tiene", () => {
    const productos = ["Vacuna antiaftosa", "Vacuna rabia", "Ivermectina 1 %"];
    expect(pick(productos, "aftosa")).toBe("Vacuna antiaftosa");
    expect(pick(productos, "ivermectina")).toBe("Ivermectina 1 %");
    expect(pick(productos, "vacuna")).toBeUndefined();
  });

  it("no adivina si la palabra no corresponde", () => {
    expect(pick(["Mañana", "Tarde"], "por la noche")).toBeUndefined();
    expect(pick(["Preñada", "Vacía"], "buenos días")).toBeUndefined();
  });

  it("llena varios campos con una sola palabra del campo", () => {
    const f: VoiceField[] = [
      { name: "cat", label: "Categoría", type: "select", choices: opts("Ternero", "Vaca") },
      { name: "sexo", label: "Sexo", type: "select", choices: opts("Hembra", "Macho") },
    ];
    expect(extractAnswers(f, "una becerra", TODAY).values).toEqual({
      cat: "Ternero",
      sexo: "Hembra",
    });
  });

  it("reconoce el animal por su número al hablar natural", () => {
    const f: VoiceField[] = [
      { name: "tag", label: "Animal", type: "select", choices: opts("VACA-15", "BOV-002") },
      { name: "turno", label: "Turno", type: "select", choices: opts("Mañana", "Tarde") },
      { name: "litros", label: "Litros", type: "number" },
    ];
    expect(extractAnswers(f, "la quince dio veinte litros en la tarde", TODAY).values).toEqual({
      tag: "VACA-15",
      turno: "Tarde",
      litros: "20",
    });
    // Sin palabra de animal, el número es de los litros y no se confunde con el arete.
    expect(extractAnswers(f, "quince", TODAY).values).toEqual({ litros: "15" });
  });

  it("identifica el animal por número aunque el formulario no pida cifras", () => {
    const f: VoiceField[] = [
      { name: "tag", label: "Hembra", type: "select", choices: opts("VACA-15", "BOV-002") },
      { name: "fecha", label: "Fecha", type: "date" },
    ];
    expect(extractAnswers(f, "la quince, ayer", TODAY).values).toEqual({
      tag: "VACA-15",
      fecha: "2026-10-29",
    });
  });

  it("limpia las muletillas al dictar", () => {
    const tag: VoiceField = { name: "t", label: "T", type: "tag" };
    const text: VoiceField = { name: "n", label: "Nombre", type: "text" };
    expect(interpretAnswer(tag, "la número quince", TODAY)).toBe("15");
    expect(interpretAnswer(text, "pues se llama el porvenir", TODAY)).toBe("Porvenir");
    expect(interpretAnswer(text, "la", TODAY)).toBe("La");
  });

  it("entiende confirmaciones naturales", () => {
    expect(detectConfirmation("así está bien")).toBe("si");
    expect(detectConfirmation("hágale")).toBe("si");
    expect(detectConfirmation("eso")).toBe("si");
    expect(detectConfirmation("no")).toBe("no");
  });
});

describe("respuestas de sanidad", () => {
  const f: VoiceField[] = [
    { name: "tipo", label: "Tipo", type: "select", choices: opts("Vacunación", "Desparasitación") },
    { name: "tag", label: "Animal", type: "select", choices: opts("VACA-01", "BOV-002") },
    {
      name: "producto",
      label: "Producto",
      type: "select",
      choices: opts("Ivermectina 1 %", "Albendazol 10 %"),
    },
    { name: "motivo", label: "Motivo o diagnóstico", type: "text" },
    { name: "resp", label: "Responsable", type: "text" },
  ];

  it("saca el motivo de «por …» y separa cada dato", () => {
    expect(
      extractAnswers(
        f,
        "la purgué con ivermectina a la vaca cero uno por parásitos responsable juan",
        TODAY,
      ).values,
    ).toEqual({
      tipo: "Desparasitación",
      tag: "VACA-01",
      producto: "Ivermectina 1 %",
      motivo: "Parasitos",
      resp: "Juan",
    });
  });

  it("no toma un sí o un no como contenido de un campo de texto", () => {
    expect(interpretAnswer(f[3] as VoiceField, "sí", TODAY)).toBeNull();
    expect(interpretAnswer(f[3] as VoiceField, "no", TODAY)).toBeNull();
    expect(interpretAnswer(f[3] as VoiceField, "ciclo nacional", TODAY)).toBe("Ciclo nacional");
  });
});
