/**
 * Exportación de ganado, carne y material genético desde Colombia: países y documentos.
 *
 * Datos reunidos de páginas oficiales (ICA, INVIMA) y prensa del sector en noviembre de 2026.
 * Los requisitos cambian y dependen de cada país: esto orienta, no reemplaza consultar al ICA o
 * al INVIMA antes de comprometer un embarque. Cada documento indica de dónde sale.
 */

export type ExportProduct = "ganado_pie" | "carne" | "genetica";
export type ExportDocStatus = "si" | "tramite" | "no";

export const EXPORT_PRODUCT_LABEL: Record<ExportProduct, string> = {
  ganado_pie: "Ganado en pie",
  carne: "Carne",
  genetica: "Semen y embriones",
};

export interface ExportDoc {
  key: string;
  product: ExportProduct;
  title: string;
  text: string;
  source: string;
}

/** Lo que la finca o el exportador debe tener antes de pedir el certificado. */
export const EXPORT_DOCS: ExportDoc[] = [
  {
    key: "predio",
    product: "ganado_pie",
    title: "Predio registrado ante el ICA",
    text: "Los animales deben salir de predios con Registro Sanitario de Predios Pecuarios (Forma 3-101).",
    source: "ICA · Bovinos en pie",
  },
  {
    key: "orejera",
    product: "ganado_pie",
    title: "Cada animal con su orejera",
    text: "La identificación individual sirve para tomar las muestras y se anota en la guía de movilización.",
    source: "ICA · Bovinos en pie",
  },
  {
    key: "establecimiento",
    product: "ganado_pie",
    title: "Establecimiento exportador certificado por el ICA",
    text: "Todo sitio que embarca bovinos o bufalinos en pie lo necesita (Resolución 097977 de 2021). Los animales permanecen allí 14 días si el país no pide pruebas y 30 días si las pide. Hay un proyecto de norma nueva en revisión.",
    source: "ICA · Resolución 097977 de 2021",
  },
  {
    key: "requisitos_pais",
    product: "ganado_pie",
    title: "Requisitos sanitarios del país de destino confirmados",
    text: "Se consultan en la página del ICA. Si no aparecen, se pregunta al servicio veterinario del país; si no hay acuerdo entre los dos países, hay que pedir una negociación sanitaria al ICA.",
    source: "ICA · Bovinos en pie",
  },
  {
    key: "permiso_importacion",
    product: "ganado_pie",
    title: "Permiso de importación del país, si lo exige",
    text: "Al pedir el certificado se adjunta ese permiso (por ejemplo en la Comunidad Andina) o, si no existe, los requisitos del país.",
    source: "ICA · Solicitud del CZE",
  },
  {
    key: "vacunas",
    product: "ganado_pie",
    title: "Vacunas y pruebas del protocolo al día",
    text: "Las que exija el protocolo del país, como la aftosa. Las toma y supervisa el ICA durante la cuarentena.",
    source: "ICA · Bovinos en pie",
  },
  {
    key: "admisibilidad",
    product: "carne",
    title: "Admisibilidad sanitaria del país confirmada",
    text: "Es el acuerdo entre Colombia y el país para recibir carne colombiana. Se confirma con el INVIMA.",
    source: "INVIMA · Acceso a mercados",
  },
  {
    key: "planta_beneficio",
    product: "carne",
    title: "Planta de beneficio habilitada por el INVIMA para exportar",
    text: "La carne debe venir de una planta habilitada, y la planta avisa al INVIMA cada sacrificio con destino a un país.",
    source: "INVIMA · Carne",
  },
  {
    key: "haccp",
    product: "carne",
    title: "Certificado HACCP del INVIMA vigente",
    text: "La planta se certifica en HACCP y el certificado dura 2 años.",
    source: "INVIMA · Carne",
  },
  {
    key: "planta_pais",
    product: "carne",
    title: "Planta autorizada por el país de destino",
    text: "Algunos países, como China, Chile, Rusia o Filipinas, inspeccionan y aprueban plantas una por una. El INVIMA publica el listado.",
    source: "INVIMA · Establecimientos autorizados",
  },
  {
    key: "centro",
    product: "genetica",
    title: "Centro de colecta y procesamiento registrado ante el ICA",
    text: "Solo se exporta semen o embriones de centros registrados (Resolución 2820 de 2005).",
    source: "ICA · Semen de bovinos y bufalinos",
  },
  {
    key: "donantes",
    product: "genetica",
    title: "Animales donantes registrados ante el ICA",
    text: "Para embriones, las hembras donantes deben estar registradas, en fincas libres de enfermedades contagiosas.",
    source: "ICA · Material genético",
  },
  {
    key: "requisitos_pais",
    product: "genetica",
    title: "Requisitos sanitarios del país de destino confirmados",
    text: "Se adjuntan a la solicitud del certificado zoosanitario. Perú, por ejemplo, exige registrar y revisar los centros colombianos.",
    source: "ICA · ProColombia",
  },
  {
    key: "permiso_importacion",
    product: "genetica",
    title: "Permiso de importación del país, si lo exige",
    text: "Se presenta ante el ICA para que emita el certificado zoosanitario.",
    source: "ProColombia · Certificación zoosanitaria",
  },
];

/** Pasos que vienen después, ya con el ICA o el INVIMA. Se muestran, no se preguntan. */
export const EXPORT_NEXT_STEPS: Record<ExportProduct, string[]> = {
  ganado_pie: [
    "Pedir la autorización a la Dirección Técnica de Cuarentena del ICA, con mínimo 40 días de anticipación al embarque.",
    "Pagar los servicios del ICA: con eso empieza la cuarentena, de mínimo 30 días, con visitas, pruebas y vacunas.",
    "Obtener la Certificación Sanitaria de Origen (CSO) y los resultados negativos de las pruebas.",
    "Registrar las orejeras en la Guía Sanitaria de Movilización Interna (GSMI) y en el anexo del CSO.",
    "Pedir el Certificado Zoosanitario de Exportación (CZE) en SISPAP y pagarlo en línea.",
    "Llevar los animales al puerto en camiones lavados y desinfectados, con la GSMI y el CSO.",
  ],
  carne: [
    "Contratar el sacrificio y el desposte en una planta habilitada para el país.",
    "La planta notifica al INVIMA el sacrificio con destino al país.",
    "El INVIMA expide el certificado sanitario de exportación que acordaron los dos países.",
  ],
  genetica: [
    "Pedir el Certificado Zoosanitario de Exportación (CZE) al ICA, con el permiso del país o sus requisitos adjuntos.",
    "El ICA verifica las declaraciones sanitarias antes de emitirlo.",
  ],
};

export type CountryAccess = "abierto" | "proceso" | "sin_acceso" | "informal" | "verificar";

export const ACCESS_LABEL: Record<CountryAccess, string> = {
  abierto: "Acceso sanitario vigente",
  proceso: "Acceso en trámite",
  sin_acceso: "Sin acceso hoy",
  informal: "Se vende sin acuerdo formal",
  verificar: "Verifique el protocolo",
};

export interface ExportCountry {
  name: string;
  access: Partial<Record<ExportProduct, CountryAccess>>;
  note?: string;
}

const MEAT_OPEN =
  "El INVIMA lo lista con admisibilidad para carne bovina; confirme la fecha y las plantas.";

/** Países mencionados por el ICA, el INVIMA y la prensa del sector. No es una lista completa. */
export const EXPORT_COUNTRIES: ExportCountry[] = [
  {
    name: "Irak",
    access: { ganado_pie: "verificar" },
    note: "Primer destino del ganado en pie en 2025 y 2026.",
  },
  { name: "Egipto", access: { ganado_pie: "verificar", carne: "abierto" }, note: MEAT_OPEN },
  { name: "Jordania", access: { ganado_pie: "verificar", carne: "abierto" }, note: MEAT_OPEN },
  { name: "Líbano", access: { carne: "abierto" }, note: MEAT_OPEN },
  {
    name: "Libia",
    access: { ganado_pie: "verificar", carne: "abierto" },
    note: "Para ganado en pie el sector gestiona agilizar los envíos.",
  },
  {
    name: "Catar",
    access: { ganado_pie: "verificar" },
    note: "El sector gestiona agilizar los envíos de ganado en pie.",
  },
  {
    name: "Emiratos Árabes Unidos",
    access: { ganado_pie: "verificar", carne: "abierto" },
    note: MEAT_OPEN,
  },
  { name: "Arabia Saudita", access: { ganado_pie: "verificar" } },
  {
    name: "Venezuela",
    access: { ganado_pie: "verificar", carne: "abierto", genetica: "verificar" },
    note: "Los animales no pueden tener origen venezolano ni ecuatoriano.",
  },
  {
    name: "Perú",
    access: { carne: "abierto", genetica: "verificar" },
    note: "Para semen hay comercio bilateral; exige registrar los centros.",
  },
  {
    name: "Chile",
    access: { carne: "abierto" },
    note: "Habilitó plantas colombianas para carne bovina deshuesada; el proceso exigió visitas y certificados acordados.",
  },
  {
    name: "China",
    access: { carne: "abierto" },
    note: "Acceso sanitario para carne bovina desde 2024, con plantas aprobadas.",
  },
  {
    name: "Filipinas",
    access: { carne: "proceso" },
    note: "Habilitó 7 plantas de carne bovina tras la auditoría de octubre y noviembre de 2025; el trámite sigue.",
  },
  {
    name: "Unión Económica Euroasiática (Rusia y otros)",
    access: { carne: "abierto" },
    note: MEAT_OPEN,
  },
  { name: "Angola", access: { carne: "abierto" }, note: MEAT_OPEN },
  { name: "Georgia", access: { carne: "abierto" }, note: MEAT_OPEN },
  { name: "Curazao", access: { carne: "abierto" }, note: MEAT_OPEN },
  { name: "Cuba", access: { carne: "abierto" }, note: MEAT_OPEN },
  {
    name: "Hong Kong",
    access: { carne: "informal", ganado_pie: "verificar" },
    note: "El INVIMA indica envíos sin acuerdo formal y un trámite de admisibilidad en proceso.",
  },
  {
    name: "Vietnam",
    access: { carne: "informal" },
    note: "El INVIMA indica envíos sin acuerdo formal y un trámite de admisibilidad en proceso.",
  },
  { name: "Malasia", access: { ganado_pie: "verificar" } },
  { name: "Macao", access: { ganado_pie: "verificar" } },
  {
    name: "Estados Unidos",
    access: { carne: "sin_acceso" },
    note: "Colombia todavía no tiene autorización sanitaria para carne bovina.",
  },
  {
    name: "Israel",
    access: { carne: "sin_acceso" },
    note: "Suspendió el proceso de admisibilidad hasta que se reactiven las relaciones.",
  },
];

/** Países de la lista que tienen algo que decir para al menos uno de los productos. */
export function countriesFor(products: ExportProduct[]): ExportCountry[] {
  return EXPORT_COUNTRIES.filter((c) => products.some((p) => c.access[p] !== undefined));
}

export const docsFor = (product: ExportProduct) => EXPORT_DOCS.filter((d) => d.product === product);
export const docId = (d: Pick<ExportDoc, "product" | "key">) => `${d.product}.${d.key}`;

export interface ExportAnswers {
  products: ExportProduct[];
  country: string;
  docs: Record<string, ExportDocStatus>;
}

export interface ExportLine {
  product: ExportProduct;
  label: string;
  access: CountryAccess | null;
  countryNote: string | null;
  have: ExportDoc[];
  inProgress: ExportDoc[];
  missing: ExportDoc[];
  next: string[];
}

export interface ExportPlan {
  country: string;
  lines: ExportLine[];
  /** Advertencias que cambian lo que conviene hacer primero. */
  notes: string[];
}

const LIVE_RESTRICTION =
  "En abril de 2026 el Gobierno anunció una restricción a exportar ganado en pie menor de dos años (el anuncio inicial incluía hembras reproductoras) y un borrador proponía un arancel del 10 %. No pude confirmar que esté vigente: consulte al Ministerio de Comercio y al ICA antes de comprometer animales.";
const COUNTRY_RULES =
  "Los requisitos cambian según el país y la fecha. Esta lista orienta; la palabra final es del ICA o del INVIMA.";

/** Qué tiene, qué está tramitando y qué le falta para exportar a un país. */
export function exportPlan(a: ExportAnswers): ExportPlan {
  const country = EXPORT_COUNTRIES.find((c) => c.name === a.country);
  const lines = a.products.map((product): ExportLine => {
    const docs = docsFor(product);
    const statusOf = (d: ExportDoc) => a.docs[docId(d)] ?? "no";
    return {
      product,
      label: EXPORT_PRODUCT_LABEL[product],
      access: country?.access[product] ?? null,
      countryNote: country?.access[product] ? (country.note ?? null) : null,
      have: docs.filter((d) => statusOf(d) === "si"),
      inProgress: docs.filter((d) => statusOf(d) === "tramite"),
      missing: docs.filter((d) => statusOf(d) === "no"),
      next: EXPORT_NEXT_STEPS[product],
    };
  });
  const notes = [COUNTRY_RULES];
  if (a.products.includes("ganado_pie")) notes.unshift(LIVE_RESTRICTION);
  if (lines.some((l) => l.access === "sin_acceso")) {
    notes.unshift(
      `Hoy ${a.country} no tiene acceso sanitario para esa carne: antes de invertir, confirme con el INVIMA.`,
    );
  }
  return { country: a.country, lines, notes };
}

/** ¿Respondió todos los documentos de los productos elegidos? */
export function exportAnswered(a: Pick<ExportAnswers, "products" | "docs">): boolean {
  return (
    a.products.length > 0 &&
    a.products.every((p) => docsFor(p).every((d) => a.docs[docId(d)] !== undefined))
  );
}
