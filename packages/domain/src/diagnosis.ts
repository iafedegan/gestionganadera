import type { FarmProfile, Goal } from "@ganaderia/contracts";

/**
 * Diagnóstico rápido a partir del perfil declarado. Usa referencias generales de la ganadería
 * colombiana: orienta por dónde empezar; no reemplaza la visita técnica.
 */
export type DiagLevel = "bien" | "atencion" | "prioridad" | "sin_dato";

export interface DiagArea {
  key: "carga" | "leche" | "carne" | "reproduccion" | "sanidad" | "finanzas" | "registros";
  title: string;
  level: DiagLevel;
  /** Cifra principal, p. ej. «1,2 animales/ha». */
  figure?: string;
  text: string;
}

export interface DiagAction {
  title: string;
  text: string;
  module: "animales" | "produccion" | "reproduccion" | "sanidad" | "pasturas" | "economia";
}

export interface Diagnosis {
  size: "pequena" | "mediana" | "grande";
  sizeLabel: string;
  areas: DiagArea[];
  actions: DiagAction[];
  /** Resumen en una línea para el asistente y la pantalla de inicio. */
  summary: string;
}

const RANK: Record<DiagLevel, number> = { prioridad: 0, atencion: 1, bien: 2, sin_dato: 3 };
const dec = (n: number, d = 1) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function farmSize(heads: number): Diagnosis["size"] {
  return heads < 50 ? "pequena" : heads <= 300 ? "mediana" : "grande";
}

/** Nivel de cuestionario sugerido: las fincas medianas y grandes ganan con el detalle. */
export const suggestedLevel = (heads: number): FarmProfile["level"] =>
  heads >= 50 ? "completo" : "rapido";

const SIZE_LABEL = {
  pequena: "Finca pequeña (menos de 50 animales)",
  mediana: "Finca mediana (50 a 300 animales)",
  grande: "Finca grande (más de 300 animales)",
} as const;

export function diagnose(p: FarmProfile): Diagnosis {
  const areas: DiagArea[] = [];
  const confined = p.system === "estabulado" || p.system === "semiestabulado";

  // Carga animal: animales por hectárea en ganadería.
  const load = p.heads / p.areaHa;
  const maxOk = p.system === "rotacional" ? 3 : confined ? 6 : 2;
  areas.push({
    key: "carga",
    title: "Carga animal",
    figure: `${dec(load)} animales/ha`,
    level: load < 0.7 && !confined ? "atencion" : load > maxOk ? "prioridad" : "bien",
    text:
      load < 0.7 && !confined
        ? "Por debajo de lo habitual: la tierra puede sostener más animales con mejor manejo de potreros."
        : load > maxOk
          ? "Alta para su sistema: riesgo de sobrepastoreo y de que falte comida en verano."
          : "Dentro de lo esperado para su sistema de manejo.",
  });

  // Leche: litros por vaca en ordeño y proporción de vacas en ordeño.
  if (p.focus !== "carne" && p.milking !== undefined && p.milkLitersDay !== undefined) {
    const perCow = p.milking > 0 ? p.milkLitersDay / p.milking : 0;
    const [good, fair] = p.focus === "leche" ? [14, 8] : [6, 4];
    const share = p.cows > 0 ? p.milking / p.cows : 0;
    let level: DiagLevel = perCow >= good ? "bien" : perCow >= fair ? "atencion" : "prioridad";
    if (share < 0.5 && level === "bien") level = "atencion";
    areas.push({
      key: "leche",
      title: "Producción de leche",
      figure: `${dec(perCow)} L por vaca al día`,
      level,
      text: `${
        level === "bien"
          ? "Buen promedio para su tipo de producción."
          : `Por debajo de la referencia (${good} L o más para ${p.focus === "leche" ? "lechería especializada" : "doble propósito"}): revise alimentación, sal mineral y genética.`
      }${share < 0.5 ? ` Solo ordeña el ${Math.round(share * 100)} % de las vacas: muchas están secas o vacías.` : ""}`,
    });
  }

  // Carne: edad de venta (nivel completo).
  if (p.focus !== "leche" && p.saleAgeMonths) {
    const a = p.saleAgeMonths;
    areas.push({
      key: "carne",
      title: "Ceba y venta",
      figure: `${dec(a, 0)} meses a la venta`,
      level: a <= 30 ? "bien" : a <= 36 ? "atencion" : "prioridad",
      text:
        a <= 30
          ? "Edad de venta competitiva."
          : "Los animales tardan en salir: cada mes extra cuesta pasto y dinero. Pesar seguido muestra quién no gana peso.",
    });
  }

  // Reproducción
  {
    let level: DiagLevel =
      p.pregCheck === "regular" ? "bien" : p.pregCheck === "a_veces" ? "atencion" : "prioridad";
    let figure: string | undefined;
    if (p.calvingIntervalMonths) {
      const i = p.calvingIntervalMonths;
      figure = `${dec(i)} meses entre partos`;
      const byInterval: DiagLevel = i <= 13 ? "bien" : i <= 15 ? "atencion" : "prioridad";
      if (RANK[byInterval] < RANK[level]) level = byInterval;
    }
    areas.push({
      key: "reproduccion",
      title: "Reproducción",
      ...(figure ? { figure } : {}),
      level,
      text:
        p.pregCheck === "nunca"
          ? "Sin palpación o ecografía no se sabe qué vacas están vacías: es la fuga de dinero más común."
          : level === "bien"
            ? "Buen control reproductivo; registre servicios y diagnósticos para seguirlo."
            : "Conviene palpar con regularidad y bajar los días entre partos (meta: 12 a 13 meses).",
    });
  }

  // Sanidad
  areas.push({
    key: "sanidad",
    title: "Sanidad",
    level: p.vet === "periodico" ? "bien" : p.vet === "problemas" ? "atencion" : "prioridad",
    text:
      p.vet === "periodico"
        ? "Con visitas periódicas: lleve aquí vacunas, tratamientos y retiros."
        : p.vet === "problemas"
          ? "Solo se llama al veterinario ante problemas: un plan preventivo cuesta menos."
          : "Sin asistencia veterinaria: organice al menos el calendario de vacunación del ICA (aftosa y brucelosis).",
  });

  // Finanzas
  const unit = p.focus === "carne" ? "kilo" : "litro";
  areas.push({
    key: "finanzas",
    title: "Costos y rentabilidad",
    level: p.knowsCost === "si" ? "bien" : p.knowsCost === "aprox" ? "atencion" : "prioridad",
    text:
      p.knowsCost === "si"
        ? `Ya conoce su costo por ${unit}: regístrelo mes a mes para ver la tendencia.`
        : `${p.knowsCost === "aprox" ? "Lo conoce de forma aproximada" : `No sabe cuánto le cuesta producir un ${unit}`}: registrar gastos e ingresos muestra si la finca gana o pierde.`,
  });

  // Registros
  areas.push({
    key: "registros",
    title: "Registros",
    level: p.records === "ninguno" ? "prioridad" : p.records === "cuaderno" ? "atencion" : "bien",
    text:
      p.records === "ninguno"
        ? "Sin registros no hay con qué decidir: empiece por cargar los animales."
        : p.records === "cuaderno"
          ? "El cuaderno se pierde y no suma solo: pasarlo aquí le da cálculos y alertas."
          : "Ya registra: puede importar sus datos para no empezar de cero.",
  });

  const actions = pickActions(p, areas);
  const size = farmSize(p.heads);
  const pri = areas.filter((a) => a.level === "prioridad").map((a) => a.title.toLowerCase());
  const summary = `${SIZE_LABEL[size]}, ${p.heads} animales en ${dec(p.areaHa)} ha (${dec(load)} animales/ha), enfoque ${p.focus.replace("_", " ")}. ${
    pri.length ? `Prioridades: ${pri.join(", ")}.` : "Sin prioridades críticas declaradas."
  }`;

  return {
    size,
    sizeLabel: SIZE_LABEL[size],
    areas: [...areas].sort((a, b) => RANK[a.level] - RANK[b.level]),
    actions,
    summary,
  };
}

const GOAL_ACTION: Partial<Record<Goal, DiagAction>> = {
  leche: {
    title: "Registre el ordeño diario",
    text: "Con los litros por vaca verá cuáles rinden y cuáles no.",
    module: "produccion",
  },
  peso: {
    title: "Pese los animales cada mes",
    text: "La ganancia diaria de peso muestra qué lote o potrero funciona.",
    module: "produccion",
  },
  reproduccion: {
    title: "Registre servicios y palpaciones",
    text: "El sistema le avisa qué vacas palpar y cuándo esperar los partos.",
    module: "reproduccion",
  },
  sanidad: {
    title: "Arme el plan sanitario",
    text: "Vacunas, tratamientos y tiempos de retiro de leche y carne.",
    module: "sanidad",
  },
  costos: {
    title: "Registre gastos e ingresos del mes",
    text: "En pocas semanas verá el costo por litro o por kilo.",
    module: "economia",
  },
  pasturas: {
    title: "Dibuje sus potreros",
    text: "Para planear la rotación y los días de descanso.",
    module: "pasturas",
  },
  trazabilidad: {
    title: "Cargue el hato con sus chapetas",
    text: "Es la base de la trazabilidad y de los reportes al ICA.",
    module: "animales",
  },
};

const AREA_ACTION: Partial<Record<DiagArea["key"], DiagAction>> = {
  reproduccion: GOAL_ACTION.reproduccion as DiagAction,
  sanidad: GOAL_ACTION.sanidad as DiagAction,
  finanzas: GOAL_ACTION.costos as DiagAction,
  leche: GOAL_ACTION.leche as DiagAction,
  carne: GOAL_ACTION.peso as DiagAction,
  carga: GOAL_ACTION.pasturas as DiagAction,
  registros: GOAL_ACTION.trazabilidad as DiagAction,
};

/** Hasta tres acciones: primero lo crítico, luego lo que el ganadero quiere lograr. */
function pickActions(p: FarmProfile, areas: DiagArea[]): DiagAction[] {
  const out: DiagAction[] = [];
  const add = (a: DiagAction | undefined) => {
    if (a && !out.some((x) => x.title === a.title) && out.length < 3) out.push(a);
  };
  for (const a of [...areas].sort((x, y) => RANK[x.level] - RANK[y.level]))
    if (a.level === "prioridad") add(AREA_ACTION[a.key]);
  for (const g of p.goals) add(GOAL_ACTION[g]);
  for (const a of areas) if (a.level === "atencion") add(AREA_ACTION[a.key]);
  return out;
}
