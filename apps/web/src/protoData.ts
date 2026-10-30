import type { ModuleKey } from "./modules";

/** Datos de ejemplo y formularios de los módulos que aún no tienen servidor (prototipo). */

export type Row = Record<string, string | number>;
export type Tone = "verde" | "azul" | "ambar" | "violeta";

export interface Field {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
  placeholder?: string;
}
export interface Column {
  key: string;
  label: string;
  kind?: "money" | "chip" | "date" | "num";
}
export interface ListDef {
  key: string;
  title: string;
  sub: string;
  columns: Column[];
  rows: Row[];
}
export interface Action {
  label: string;
  /** Agrega un registro a esta lista. */
  list?: string;
  title?: string;
  fields?: Field[];
  defaults?: Row;
  /** Solo cambia a esa lista. */
  view?: string;
  /** Solo muestra este aviso. */
  toast?: string;
}
export interface KpiDef {
  label: string;
  tone: Tone;
  meta: string;
  value?: string;
  count?: string;
  sum?: { list: string; field: string; where?: [string, string] };
  unit?: string;
  money?: boolean;
}
export interface ProtoDef {
  kpis: KpiDef[];
  chart?: { title: string; unit: string; labels: string[]; values: number[] };
  lists: ListDef[];
  actions: Action[];
}

const D = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};
const dias = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.now() - (n - 1 - i) * 864e5).toLocaleDateString("es-CO", { weekday: "short" }),
  );

const animal = {
  name: "animal",
  label: "Animal",
  type: "text",
  placeholder: "Ej. BOV-014",
} as const;
const fecha = { name: "fecha", label: "Fecha", type: "date" } as const;
const valor = { name: "valor", label: "Valor (COP)", type: "number" } as const;

export const PROTO: Partial<Record<ModuleKey, ProtoDef>> = {
  produccion: {
    kpis: [
      {
        label: "Leche registrada",
        tone: "azul",
        sum: { list: "ordenos", field: "litros" },
        unit: "L",
        meta: "Suma de los ordeños de la lista",
      },
      {
        label: "Animales pesados",
        tone: "verde",
        count: "pesajes",
        meta: "Controles de peso registrados",
      },
      { label: "Grasa promedio", tone: "ambar", value: "3,9 %", meta: "Último control de calidad" },
    ],
    chart: {
      title: "Leche diaria",
      unit: "L",
      labels: dias(7),
      values: [168, 172, 175, 171, 180, 186, 183],
    },
    lists: [
      {
        key: "ordenos",
        title: "Ordeños",
        sub: "Por animal, turno y destino.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "animal", label: "Animal" },
          { key: "litros", label: "Litros", kind: "num" },
          { key: "turno", label: "Turno", kind: "chip" },
          { key: "destino", label: "Destino", kind: "chip" },
        ],
        rows: [
          { fecha: D(0), animal: "BOV-001", litros: 14.5, turno: "Mañana", destino: "Venta" },
          { fecha: D(0), animal: "BOV-010", litros: 12.8, turno: "Mañana", destino: "Venta" },
          { fecha: D(0), animal: "BOV-011", litros: 11.2, turno: "Tarde", destino: "Venta" },
          { fecha: D(1), animal: "BOV-012", litros: 9.6, turno: "Mañana", destino: "Consumo" },
          { fecha: D(1), animal: "BUF-003", litros: 8.4, turno: "Tarde", destino: "Venta" },
          { fecha: D(2), animal: "BOV-001", litros: 15.1, turno: "Tarde", destino: "Descarte" },
        ],
      },
      {
        key: "pesajes",
        title: "Pesajes y crecimiento",
        sub: "Peso en kilogramos y ganancia diaria.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "animal", label: "Animal" },
          { key: "peso", label: "Peso (kg)", kind: "num" },
          { key: "gdp", label: "Ganancia (g/día)", kind: "num" },
          { key: "metodo", label: "Método", kind: "chip" },
        ],
        rows: [
          { fecha: D(3), animal: "BOV-020", peso: 312, gdp: 780, metodo: "Báscula" },
          { fecha: D(3), animal: "BOV-021", peso: 288, gdp: 720, metodo: "Báscula" },
          { fecha: D(8), animal: "BUF-005", peso: 365, gdp: 690, metodo: "Cinta" },
          { fecha: D(12), animal: "BOV-022", peso: 241, gdp: 810, metodo: "Estimado" },
        ],
      },
      {
        key: "calidad",
        title: "Calidad de la leche",
        sub: "Controles de grasa, proteína y células somáticas.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "grasa", label: "Grasa (%)", kind: "num" },
          { key: "proteina", label: "Proteína (%)", kind: "num" },
          { key: "ccs", label: "Células (mil/mL)", kind: "num" },
        ],
        rows: [
          { fecha: D(2), grasa: 3.9, proteina: 3.2, ccs: 180 },
          { fecha: D(9), grasa: 3.8, proteina: 3.3, ccs: 210 },
          { fecha: D(16), grasa: 4.0, proteina: 3.1, ccs: 165 },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar ordeño",
        list: "ordenos",
        title: "Registrar ordeño",
        fields: [
          fecha,
          animal,
          { name: "litros", label: "Litros", type: "number" },
          { name: "turno", label: "Turno", type: "select", options: ["Mañana", "Tarde"] },
          {
            name: "destino",
            label: "Destino",
            type: "select",
            options: ["Venta", "Consumo", "Descarte"],
          },
        ],
      },
      {
        label: "Control de calidad",
        list: "calidad",
        title: "Control de calidad",
        fields: [
          fecha,
          { name: "grasa", label: "Grasa (%)", type: "number" },
          { name: "proteina", label: "Proteína (%)", type: "number" },
          { name: "ccs", label: "Células (mil/mL)", type: "number" },
        ],
      },
      {
        label: "Registrar peso",
        list: "pesajes",
        title: "Registrar peso",
        fields: [
          fecha,
          animal,
          { name: "peso", label: "Peso (kg)", type: "number" },
          { name: "gdp", label: "Ganancia (g/día)", type: "number" },
          {
            name: "metodo",
            label: "Método",
            type: "select",
            options: ["Báscula", "Cinta", "Estimado"],
          },
        ],
      },
    ],
  },

  reproduccion: {
    kpis: [
      { label: "Servicios", tone: "violeta", count: "servicios", meta: "Montas e inseminaciones" },
      {
        label: "Gestaciones confirmadas",
        tone: "verde",
        sum: { list: "diagnosticos", field: "cuenta", where: ["resultado", "Preñada"] },
        meta: "Diagnósticos positivos",
      },
      { label: "Partos", tone: "ambar", count: "partos", meta: "Crías registradas" },
    ],
    chart: {
      title: "Servicios por mes",
      unit: "",
      labels: ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
      values: [6, 9, 7, 11, 8, 10],
    },
    lists: [
      {
        key: "servicios",
        title: "Servicios",
        sub: "Monta natural e inseminación artificial.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "hembra", label: "Hembra" },
          { key: "tipo", label: "Tipo", kind: "chip" },
          { key: "macho", label: "Reproductor o pajilla" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            fecha: D(5),
            hembra: "BOV-001",
            tipo: "IA",
            macho: "Pajilla HOL-221",
            estado: "Pendiente de diagnóstico",
          },
          {
            fecha: D(21),
            hembra: "BOV-010",
            tipo: "Monta",
            macho: "TORO-02",
            estado: "Pendiente de diagnóstico",
          },
          {
            fecha: D(48),
            hembra: "BOV-011",
            tipo: "IA",
            macho: "Pajilla BRA-104",
            estado: "Confirmada",
          },
          {
            fecha: D(70),
            hembra: "BUF-003",
            tipo: "Monta",
            macho: "BUF-TORO-01",
            estado: "Confirmada",
          },
        ],
      },
      {
        key: "diagnosticos",
        title: "Diagnósticos",
        sub: "Palpación o ecografía.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "hembra", label: "Hembra" },
          { key: "resultado", label: "Resultado", kind: "chip" },
          { key: "dias", label: "Días de gestación", kind: "num" },
        ],
        rows: [
          { fecha: D(4), hembra: "BOV-011", resultado: "Preñada", dias: 44, cuenta: 1 },
          { fecha: D(10), hembra: "BUF-003", resultado: "Preñada", dias: 60, cuenta: 1 },
          { fecha: D(15), hembra: "BOV-012", resultado: "Vacía", dias: 0, cuenta: 0 },
        ],
      },
      {
        key: "partos",
        title: "Partos y crías",
        sub: "El parto crea la cría y la vincula con su madre.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "madre", label: "Madre" },
          { key: "cria", label: "Cría" },
          { key: "sexo", label: "Sexo", kind: "chip" },
          { key: "peso", label: "Peso (kg)", kind: "num" },
        ],
        rows: [
          { fecha: D(18), madre: "BOV-014", cria: "BOV-031", sexo: "Hembra", peso: 34 },
          { fecha: D(33), madre: "BUF-002", cria: "BUF-009", sexo: "Macho", peso: 38 },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar servicio",
        list: "servicios",
        title: "Registrar servicio",
        fields: [
          fecha,
          { name: "hembra", label: "Hembra", type: "text", placeholder: "Ej. BOV-014" },
          { name: "tipo", label: "Tipo", type: "select", options: ["Monta", "IA"] },
          { name: "macho", label: "Reproductor o pajilla", type: "text" },
        ],
        defaults: { estado: "Pendiente de diagnóstico" },
      },
      {
        label: "Registrar diagnóstico",
        list: "diagnosticos",
        title: "Registrar diagnóstico",
        fields: [
          fecha,
          { name: "hembra", label: "Hembra", type: "text" },
          { name: "resultado", label: "Resultado", type: "select", options: ["Preñada", "Vacía"] },
          { name: "dias", label: "Días de gestación", type: "number" },
        ],
      },
      {
        label: "Registrar parto",
        list: "partos",
        title: "Registrar parto",
        fields: [
          fecha,
          { name: "madre", label: "Madre", type: "text" },
          { name: "cria", label: "Identificación de la cría", type: "text" },
          { name: "sexo", label: "Sexo", type: "select", options: ["Hembra", "Macho"] },
          { name: "peso", label: "Peso (kg)", type: "number" },
        ],
      },
    ],
  },

  sanidad: {
    kpis: [
      {
        label: "Eventos sanitarios",
        tone: "verde",
        count: "eventos",
        meta: "Vacunas, tratamientos y controles",
      },
      {
        label: "Animales en retiro",
        tone: "ambar",
        value: "3",
        meta: "No vender leche ni carne todavía",
      },
      { label: "Campañas programadas", tone: "azul", count: "campanas", meta: "Próximas jornadas" },
    ],
    chart: {
      title: "Eventos por mes",
      unit: "",
      labels: ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
      values: [14, 9, 17, 12, 21, 11],
    },
    lists: [
      {
        key: "eventos",
        title: "Casos y controles",
        sub: "Observaciones, vacunaciones y tratamientos.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "animal", label: "Animal o lote" },
          { key: "tipo", label: "Tipo", kind: "chip" },
          { key: "producto", label: "Producto" },
          { key: "retiro", label: "Retiro leche (días)", kind: "num" },
        ],
        rows: [
          {
            fecha: D(1),
            animal: "Lote Levante",
            tipo: "Vacunación",
            producto: "Aftosa",
            retiro: 0,
          },
          {
            fecha: D(3),
            animal: "BOV-012",
            tipo: "Tratamiento",
            producto: "Ivermectina 1 %",
            retiro: 28,
          },
          {
            fecha: D(6),
            animal: "BOV-001",
            tipo: "Control",
            producto: "Revisión de ubre",
            retiro: 0,
          },
          {
            fecha: D(11),
            animal: "BUF-003",
            tipo: "Tratamiento",
            producto: "Oxitetraciclina",
            retiro: 7,
          },
          {
            fecha: D(20),
            animal: "Lote Ordeño",
            tipo: "Vacunación",
            producto: "Brucelosis",
            retiro: 0,
          },
        ],
      },
      {
        key: "campanas",
        title: "Campañas y planes",
        sub: "Vacunación, exámenes y bioseguridad.",
        columns: [
          { key: "campana", label: "Campaña" },
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "lote", label: "Lote" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            campana: "Vacunación aftosa",
            fecha: D(-14),
            lote: "Todo el hato",
            estado: "Programada",
          },
          {
            campana: "Desparasitación de terneros",
            fecha: D(-6),
            lote: "Levante",
            estado: "Programada",
          },
          { campana: "Brucelosis terneras", fecha: D(-30), lote: "Terneras", estado: "Pendiente" },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar evento sanitario",
        list: "eventos",
        title: "Registrar evento sanitario",
        fields: [
          fecha,
          { name: "animal", label: "Animal o lote", type: "text" },
          {
            name: "tipo",
            label: "Tipo",
            type: "select",
            options: ["Vacunación", "Tratamiento", "Control"],
          },
          { name: "producto", label: "Producto", type: "text" },
          { name: "retiro", label: "Retiro de leche (días)", type: "number" },
        ],
      },
      {
        label: "Programar campaña",
        list: "campanas",
        title: "Programar campaña",
        fields: [
          { name: "campana", label: "Campaña", type: "text" },
          { name: "fecha", label: "Fecha", type: "date" },
          { name: "lote", label: "Lote", type: "text" },
        ],
        defaults: { estado: "Programada" },
      },
      { label: "Ver historial", view: "eventos" },
    ],
  },

  pasturas: {
    kpis: [
      {
        label: "Potreros",
        tone: "verde",
        count: "potreros",
        meta: "Registrados por nombre y área",
      },
      {
        label: "Área total",
        tone: "azul",
        sum: { list: "potreros", field: "area" },
        unit: "ha",
        meta: "Suma de los potreros",
      },
      { label: "Aforos", tone: "ambar", count: "aforos", meta: "Mediciones de forraje" },
    ],
    chart: {
      title: "Forraje disponible (kg MS/ha)",
      unit: "",
      labels: ["P. Sur", "P. Norte", "La Loma", "El Bajo", "Rastrojo"],
      values: [2400, 1800, 3100, 2100, 1500],
    },
    lists: [
      {
        key: "potreros",
        title: "Potreros",
        sub: "Uso, descanso y lote actual.",
        columns: [
          { key: "potrero", label: "Potrero" },
          { key: "area", label: "Área (ha)", kind: "num" },
          { key: "forraje", label: "Forraje" },
          { key: "lote", label: "Lote" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            potrero: "Potrero Sur",
            area: 8.5,
            forraje: "Brachiaria",
            lote: "Levante",
            estado: "Ocupado",
          },
          { potrero: "Potrero Norte", area: 6, forraje: "Estrella", lote: "—", estado: "Descanso" },
          { potrero: "La Loma", area: 12, forraje: "Mombasa", lote: "Ordeño", estado: "Ocupado" },
          {
            potrero: "El Bajo",
            area: 5.5,
            forraje: "Pasto elefante",
            lote: "—",
            estado: "Descanso",
          },
        ],
      },
      {
        key: "aforos",
        title: "Aforos",
        sub: "Kilogramos de materia seca por hectárea.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "potrero", label: "Potrero" },
          { key: "ms", label: "kg MS/ha", kind: "num" },
        ],
        rows: [
          { fecha: D(2), potrero: "La Loma", ms: 3100 },
          { fecha: D(2), potrero: "Potrero Sur", ms: 2400 },
          { fecha: D(9), potrero: "Potrero Norte", ms: 1800 },
        ],
      },
      {
        key: "movimientos",
        title: "Rotación y movimientos",
        sub: "Cambios de lote entre potreros.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "lote", label: "Lote" },
          { key: "de", label: "Desde" },
          { key: "a", label: "Hacia" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          { fecha: D(4), lote: "Ordeño", de: "El Bajo", a: "La Loma", estado: "Confirmado" },
          {
            fecha: D(-2),
            lote: "Levante",
            de: "Potrero Sur",
            a: "Potrero Norte",
            estado: "Planificado",
          },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar aforo",
        list: "aforos",
        title: "Registrar aforo",
        fields: [
          fecha,
          { name: "potrero", label: "Potrero", type: "text" },
          { name: "ms", label: "kg MS/ha", type: "number" },
        ],
      },
      {
        label: "Planificar rotación",
        list: "movimientos",
        title: "Planificar rotación",
        fields: [
          fecha,
          { name: "lote", label: "Lote", type: "text" },
          { name: "de", label: "Desde", type: "text" },
          { name: "a", label: "Hacia", type: "text" },
        ],
        defaults: { estado: "Planificado" },
      },
      { label: "Confirmar movimiento", view: "movimientos" },
    ],
  },

  economia: {
    kpis: [
      {
        label: "Ingresos registrados",
        tone: "verde",
        sum: { list: "movimientos", field: "valor", where: ["tipo", "Ingreso"] },
        money: true,
        meta: "Ventas y otros ingresos",
      },
      {
        label: "Egresos registrados",
        tone: "ambar",
        sum: { list: "movimientos", field: "valor", where: ["tipo", "Egreso"] },
        money: true,
        meta: "Insumos, nómina y servicios",
      },
      { label: "Movimientos", tone: "azul", count: "movimientos", meta: "Con su soporte opcional" },
    ],
    chart: {
      title: "Saldo mensual (millones COP)",
      unit: "M",
      labels: ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
      values: [2.1, 1.4, 3.2, 2.8, 3.9, 2.4],
    },
    lists: [
      {
        key: "movimientos",
        title: "Ingresos y egresos",
        sub: "El saldo es de movimientos registrados, no utilidad.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "tipo", label: "Tipo", kind: "chip" },
          { key: "categoria", label: "Categoría" },
          { key: "descripcion", label: "Descripción" },
          { key: "valor", label: "Valor", kind: "money" },
        ],
        rows: [
          {
            fecha: D(1),
            tipo: "Ingreso",
            categoria: "Leche",
            descripcion: "Entrega semanal a la planta",
            valor: 4_850_000,
          },
          {
            fecha: D(3),
            tipo: "Egreso",
            categoria: "Insumos",
            descripcion: "Concentrado de levante",
            valor: 1_260_000,
          },
          {
            fecha: D(6),
            tipo: "Egreso",
            categoria: "Nómina",
            descripcion: "Jornales de la quincena",
            valor: 1_800_000,
          },
          {
            fecha: D(9),
            tipo: "Ingreso",
            categoria: "Ganado",
            descripcion: "Venta de 2 machos",
            valor: 5_600_000,
          },
          {
            fecha: D(12),
            tipo: "Egreso",
            categoria: "Sanidad",
            descripcion: "Vacuna de aftosa",
            valor: 410_000,
          },
        ],
      },
      {
        key: "presupuesto",
        title: "Presupuesto y ejecución",
        sub: "Comparación por rubro.",
        columns: [
          { key: "rubro", label: "Rubro" },
          { key: "presupuesto", label: "Presupuestado", kind: "money" },
          { key: "ejecutado", label: "Ejecutado", kind: "money" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          { rubro: "Insumos", presupuesto: 4_000_000, ejecutado: 3_150_000, estado: "En rango" },
          { rubro: "Nómina", presupuesto: 3_600_000, ejecutado: 3_600_000, estado: "Completo" },
          { rubro: "Sanidad", presupuesto: 1_200_000, ejecutado: 1_410_000, estado: "Excedido" },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar ingreso",
        list: "movimientos",
        title: "Registrar ingreso",
        fields: [
          fecha,
          {
            name: "categoria",
            label: "Categoría",
            type: "select",
            options: ["Leche", "Ganado", "Otros"],
          },
          { name: "descripcion", label: "Descripción", type: "text" },
          valor,
        ],
        defaults: { tipo: "Ingreso" },
      },
      {
        label: "Registrar egreso",
        list: "movimientos",
        title: "Registrar egreso",
        fields: [
          fecha,
          {
            name: "categoria",
            label: "Categoría",
            type: "select",
            options: ["Insumos", "Nómina", "Sanidad", "Servicios", "Otros"],
          },
          { name: "descripcion", label: "Descripción", type: "text" },
          valor,
        ],
        defaults: { tipo: "Egreso" },
      },
      { label: "Ver presupuesto", view: "presupuesto" },
    ],
  },

  asistencia: {
    kpis: [
      { label: "Visitas", tone: "azul", count: "visitas", meta: "Programadas y realizadas" },
      {
        label: "Recomendaciones abiertas",
        tone: "ambar",
        sum: { list: "recomendaciones", field: "cuenta", where: ["estado", "Abierta"] },
        meta: "Pendientes de cumplir",
      },
      { label: "Compromisos cumplidos", tone: "verde", value: "75 %", meta: "Último trimestre" },
    ],
    lists: [
      {
        key: "visitas",
        title: "Agenda de visitas",
        sub: "Visitas técnicas con su motivo.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "asesor", label: "Asesor" },
          { key: "finca", label: "Finca" },
          { key: "motivo", label: "Motivo" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            fecha: D(-3),
            asesor: "Dra. Marcela Ruiz",
            finca: "Finca demostrativa",
            motivo: "Plan reproductivo",
            estado: "Programada",
          },
          {
            fecha: D(6),
            asesor: "Ing. Julián Torres",
            finca: "Finca demostrativa",
            motivo: "Calidad de leche",
            estado: "Realizada",
          },
          {
            fecha: D(20),
            asesor: "Dra. Marcela Ruiz",
            finca: "Finca demostrativa",
            motivo: "Vacunación",
            estado: "Realizada",
          },
        ],
      },
      {
        key: "recomendaciones",
        title: "Recomendaciones",
        sub: "Con prioridad y seguimiento.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "texto", label: "Recomendación" },
          { key: "prioridad", label: "Prioridad", kind: "chip" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            fecha: D(6),
            texto: "Ajustar la sal mineralizada del lote de ordeño",
            prioridad: "Media",
            estado: "Abierta",
            cuenta: 1,
          },
          {
            fecha: D(6),
            texto: "Dividir el potrero Sur en dos franjas",
            prioridad: "Alta",
            estado: "Abierta",
            cuenta: 1,
          },
          {
            fecha: D(20),
            texto: "Revisar la rutina de ordeño",
            prioridad: "Baja",
            estado: "Cumplida",
            cuenta: 0,
          },
        ],
      },
    ],
    actions: [
      {
        label: "Programar visita",
        list: "visitas",
        title: "Programar visita",
        fields: [
          fecha,
          { name: "asesor", label: "Asesor", type: "text" },
          { name: "motivo", label: "Motivo", type: "text" },
        ],
        defaults: { finca: "Finca demostrativa", estado: "Programada" },
      },
      {
        label: "Registrar recomendación",
        list: "recomendaciones",
        title: "Registrar recomendación",
        fields: [
          fecha,
          { name: "texto", label: "Recomendación", type: "text" },
          {
            name: "prioridad",
            label: "Prioridad",
            type: "select",
            options: ["Alta", "Media", "Baja"],
          },
        ],
        defaults: { estado: "Abierta", cuenta: 1 },
      },
      {
        label: "Generar informe",
        toast: "Informe de visita generado (prototipo): se descargaría como PDF.",
      },
    ],
  },

  ventas: {
    kpis: [
      {
        label: "Ventas registradas",
        tone: "verde",
        sum: { list: "ventas", field: "valor" },
        money: true,
        meta: "Leche, ganado y otros",
      },
      { label: "Clientes", tone: "azul", count: "clientes", meta: "Activos" },
      {
        label: "Saldo por cobrar",
        tone: "ambar",
        sum: { list: "clientes", field: "saldo" },
        money: true,
        meta: "Cartera pendiente",
      },
    ],
    chart: {
      title: "Ventas por mes (millones COP)",
      unit: "M",
      labels: ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
      values: [8.2, 7.4, 10.1, 9.6, 12.3, 9.9],
    },
    lists: [
      {
        key: "ventas",
        title: "Ventas",
        sub: "Por cliente y producto.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "cliente", label: "Cliente" },
          { key: "producto", label: "Producto", kind: "chip" },
          { key: "cantidad", label: "Cantidad", kind: "num" },
          { key: "valor", label: "Valor", kind: "money" },
        ],
        rows: [
          {
            fecha: D(1),
            cliente: "Lácteos del Valle",
            producto: "Leche",
            cantidad: 1200,
            valor: 3_840_000,
          },
          {
            fecha: D(5),
            cliente: "Frigorífico Central",
            producto: "Ganado",
            cantidad: 2,
            valor: 5_600_000,
          },
          {
            fecha: D(8),
            cliente: "Quesera La Esperanza",
            producto: "Leche",
            cantidad: 600,
            valor: 1_980_000,
          },
        ],
      },
      {
        key: "clientes",
        title: "Clientes",
        sub: "Contacto y saldo.",
        columns: [
          { key: "cliente", label: "Cliente" },
          { key: "telefono", label: "Teléfono" },
          { key: "tipo", label: "Tipo", kind: "chip" },
          { key: "saldo", label: "Saldo", kind: "money" },
        ],
        rows: [
          {
            cliente: "Lácteos del Valle",
            telefono: "310 555 0142",
            tipo: "Planta",
            saldo: 1_920_000,
          },
          {
            cliente: "Frigorífico Central",
            telefono: "315 555 0177",
            tipo: "Frigorífico",
            saldo: 0,
          },
          {
            cliente: "Quesera La Esperanza",
            telefono: "320 555 0119",
            tipo: "Quesera",
            saldo: 640_000,
          },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar venta",
        list: "ventas",
        title: "Registrar venta",
        fields: [
          fecha,
          { name: "cliente", label: "Cliente", type: "text" },
          {
            name: "producto",
            label: "Producto",
            type: "select",
            options: ["Leche", "Ganado", "Otros"],
          },
          { name: "cantidad", label: "Cantidad", type: "number" },
          valor,
        ],
      },
      {
        label: "Nuevo cliente",
        list: "clientes",
        title: "Nuevo cliente",
        fields: [
          { name: "cliente", label: "Nombre", type: "text" },
          { name: "telefono", label: "Teléfono", type: "text" },
          {
            name: "tipo",
            label: "Tipo",
            type: "select",
            options: ["Planta", "Frigorífico", "Quesera", "Otro"],
          },
        ],
        defaults: { saldo: 0 },
      },
    ],
  },

  personal: {
    kpis: [
      { label: "Personas", tone: "azul", count: "empleados", meta: "En la finca" },
      {
        label: "Horas registradas",
        tone: "verde",
        sum: { list: "jornadas", field: "horas" },
        unit: "h",
        meta: "Jornadas de la lista",
      },
      {
        label: "Labores de la semana",
        tone: "ambar",
        count: "jornadas",
        meta: "Registros de jornada",
      },
    ],
    lists: [
      {
        key: "empleados",
        title: "Personal",
        sub: "Cargo y finca asignada.",
        columns: [
          { key: "nombre", label: "Nombre" },
          { key: "cargo", label: "Cargo" },
          { key: "finca", label: "Finca" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            nombre: "Luis Martínez",
            cargo: "Mayordomo",
            finca: "Finca demostrativa",
            estado: "Activo",
          },
          {
            nombre: "Ana Rojas",
            cargo: "Ordeñadora",
            finca: "Finca demostrativa",
            estado: "Activo",
          },
          {
            nombre: "Pedro Gómez",
            cargo: "Vaquero",
            finca: "Finca demostrativa",
            estado: "Activo",
          },
          {
            nombre: "Carlos Díaz",
            cargo: "Jornalero",
            finca: "Finca demostrativa",
            estado: "Inactivo",
          },
        ],
      },
      {
        key: "jornadas",
        title: "Jornadas",
        sub: "Labor y horas por persona.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "persona", label: "Persona" },
          { key: "labor", label: "Labor", kind: "chip" },
          { key: "horas", label: "Horas", kind: "num" },
        ],
        rows: [
          { fecha: D(0), persona: "Ana Rojas", labor: "Ordeño", horas: 6 },
          { fecha: D(0), persona: "Pedro Gómez", labor: "Rotación", horas: 8 },
          { fecha: D(1), persona: "Luis Martínez", labor: "Sanidad", horas: 8 },
        ],
      },
    ],
    actions: [
      {
        label: "Nueva persona",
        list: "empleados",
        title: "Nueva persona",
        fields: [
          { name: "nombre", label: "Nombre", type: "text" },
          { name: "cargo", label: "Cargo", type: "text" },
        ],
        defaults: { finca: "Finca demostrativa", estado: "Activo" },
      },
      {
        label: "Registrar jornada",
        list: "jornadas",
        title: "Registrar jornada",
        fields: [
          fecha,
          { name: "persona", label: "Persona", type: "text" },
          {
            name: "labor",
            label: "Labor",
            type: "select",
            options: ["Ordeño", "Rotación", "Sanidad", "Cercas", "Otra"],
          },
          { name: "horas", label: "Horas", type: "number" },
        ],
      },
    ],
  },

  activos: {
    kpis: [
      {
        label: "Activos",
        tone: "azul",
        count: "activos",
        meta: "Maquinaria, equipos e instalaciones",
      },
      {
        label: "Valor registrado",
        tone: "verde",
        sum: { list: "activos", field: "valor" },
        money: true,
        meta: "Valor en libros de ejemplo",
      },
      {
        label: "Costo de mantenimiento",
        tone: "ambar",
        sum: { list: "mantenimientos", field: "costo" },
        money: true,
        meta: "Trabajos registrados",
      },
    ],
    lists: [
      {
        key: "activos",
        title: "Inventario de activos",
        sub: "Estado y ubicación.",
        columns: [
          { key: "activo", label: "Activo" },
          { key: "tipo", label: "Tipo", kind: "chip" },
          { key: "ubicacion", label: "Ubicación" },
          { key: "estado", label: "Estado", kind: "chip" },
          { key: "valor", label: "Valor", kind: "money" },
        ],
        rows: [
          {
            activo: "Tractor John Deere 5075",
            tipo: "Maquinaria",
            ubicacion: "Bodega",
            estado: "Operativo",
            valor: 98_000_000,
          },
          {
            activo: "Ordeñadora de 4 puestos",
            tipo: "Equipo",
            ubicacion: "Sala de ordeño",
            estado: "Operativo",
            valor: 22_500_000,
          },
          {
            activo: "Tanque de frío 1000 L",
            tipo: "Equipo",
            ubicacion: "Sala de ordeño",
            estado: "En mantenimiento",
            valor: 18_000_000,
          },
          {
            activo: "Báscula ganadera",
            tipo: "Equipo",
            ubicacion: "Manga",
            estado: "Operativo",
            valor: 7_800_000,
          },
        ],
      },
      {
        key: "mantenimientos",
        title: "Mantenimientos",
        sub: "Trabajos y costos.",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "activo", label: "Activo" },
          { key: "trabajo", label: "Trabajo" },
          { key: "costo", label: "Costo", kind: "money" },
        ],
        rows: [
          {
            fecha: D(4),
            activo: "Tanque de frío 1000 L",
            trabajo: "Cambio de compresor",
            costo: 1_450_000,
          },
          {
            fecha: D(30),
            activo: "Tractor John Deere 5075",
            trabajo: "Cambio de aceite y filtros",
            costo: 620_000,
          },
        ],
      },
    ],
    actions: [
      {
        label: "Nuevo activo",
        list: "activos",
        title: "Nuevo activo",
        fields: [
          { name: "activo", label: "Activo", type: "text" },
          {
            name: "tipo",
            label: "Tipo",
            type: "select",
            options: ["Maquinaria", "Equipo", "Instalación", "Vehículo"],
          },
          { name: "ubicacion", label: "Ubicación", type: "text" },
          valor,
        ],
        defaults: { estado: "Operativo" },
      },
      {
        label: "Registrar mantenimiento",
        list: "mantenimientos",
        title: "Registrar mantenimiento",
        fields: [
          fecha,
          { name: "activo", label: "Activo", type: "text" },
          { name: "trabajo", label: "Trabajo", type: "text" },
          { name: "costo", label: "Costo (COP)", type: "number" },
        ],
      },
    ],
  },

  contabilidad: {
    kpis: [
      {
        label: "Facturado",
        tone: "verde",
        sum: { list: "facturas", field: "valor" },
        money: true,
        meta: "Facturas emitidas",
      },
      {
        label: "Por pagar",
        tone: "ambar",
        sum: { list: "cuentas", field: "valor" },
        money: true,
        meta: "Cuentas con proveedores",
      },
      { label: "Facturas", tone: "azul", count: "facturas", meta: "Emitidas este mes" },
    ],
    lists: [
      {
        key: "facturas",
        title: "Facturas",
        sub: "Emisión con proveedor tecnológico (simulada).",
        columns: [
          { key: "fecha", label: "Fecha", kind: "date" },
          { key: "tercero", label: "Cliente" },
          { key: "concepto", label: "Concepto" },
          { key: "valor", label: "Valor", kind: "money" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          {
            fecha: D(2),
            tercero: "Lácteos del Valle",
            concepto: "Leche semana 43",
            valor: 3_840_000,
            estado: "Aceptada",
          },
          {
            fecha: D(8),
            tercero: "Quesera La Esperanza",
            concepto: "Leche semana 42",
            valor: 1_980_000,
            estado: "Aceptada",
          },
          {
            fecha: D(11),
            tercero: "Frigorífico Central",
            concepto: "Venta de machos",
            valor: 5_600_000,
            estado: "Pendiente",
          },
        ],
      },
      {
        key: "cuentas",
        title: "Cuentas por pagar",
        sub: "Vencimientos con proveedores.",
        columns: [
          { key: "tercero", label: "Proveedor" },
          { key: "vence", label: "Vence", kind: "date" },
          { key: "valor", label: "Valor", kind: "money" },
          { key: "estado", label: "Estado", kind: "chip" },
        ],
        rows: [
          { tercero: "Agroinsumos del Sur", vence: D(-5), valor: 1_260_000, estado: "Por vencer" },
          { tercero: "Veterinaria San José", vence: D(-12), valor: 410_000, estado: "Al día" },
        ],
      },
    ],
    actions: [
      {
        label: "Registrar factura",
        list: "facturas",
        title: "Registrar factura",
        fields: [
          fecha,
          { name: "tercero", label: "Cliente", type: "text" },
          { name: "concepto", label: "Concepto", type: "text" },
          valor,
        ],
        defaults: { estado: "Pendiente" },
      },
      {
        label: "Cuenta por pagar",
        list: "cuentas",
        title: "Cuenta por pagar",
        fields: [
          { name: "tercero", label: "Proveedor", type: "text" },
          { name: "vence", label: "Vence", type: "date" },
          valor,
        ],
        defaults: { estado: "Por vencer" },
      },
    ],
  },
};
