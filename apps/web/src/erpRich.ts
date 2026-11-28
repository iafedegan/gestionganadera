import {
  ASSETS,
  type Asset,
  CLIENTS,
  COURSES,
  type CattleSale,
  type Client,
  type Course,
  type Delivery,
  type Invoice,
  MAINT_LOG,
  type MaintLog,
  PEOPLE,
  type Payable,
  type Person,
  SHIFTS,
  TASKS,
  type Task,
} from "./erpData";
import type { Mov } from "./herd";
import { addDays, ago, iso, today } from "./kit";
import { dataScope, setSeedOverride } from "./lib/scope";

/**
 * Datos de ejemplo de la gestión para la cuenta grande de muestra (Agropecuaria Los Llanos):
 * tres fincas, unos 4.400 L de leche al día y 22 personas. Todo cuadra entre sí: las entregas de
 * leche y las ventas de ganado salen en las facturas y en la plata; la nómina sale de las personas
 * y el mantenimiento de los equipos. Se generan siempre igual (semilla fija) para que las cifras
 * no cambien entre pantallas.
 */

const fut = (d: number) => addDays(iso(today()), d);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLANTS = [
  { nombre: "Lácteos del Valle", share: 0.6, precio: 1_950, prefijo: "LV" },
  { nombre: "Cooperativa Lechera de Casanare", share: 0.4, precio: 1_900, prefijo: "CC" },
] as const;
const QUESERA = { nombre: "Quesera La Esperanza", precio: 3_600, prefijo: "QE" };
const BOVINE_LPD = 3_950;
const BUFFALO_LPD = 450;

/* ───────────── Ventas: entregas, ganado y clientes ───────────── */

function deliveries(): Delivery[] {
  const r = rng(11);
  const out: Delivery[] = [];
  for (let i = 0; i < 90; i++) {
    const season = 1 + 0.06 * Math.sin(i / 9);
    for (const p of PLANTS) {
      out.push({
        fecha: ago(i),
        comprador: p.nombre,
        especie: "bovino",
        litros: Math.round(BOVINE_LPD * p.share * season * (0.95 + r() * 0.1)),
        precioBase: p.precio,
        bonificacion: Math.round(70 + r() * 50),
        descuento: Math.round(r() * 60),
        guia: `${p.prefijo}-${8400 - i}`,
      });
    }
    out.push({
      fecha: ago(i),
      comprador: QUESERA.nombre,
      especie: "bufalino",
      litros: Math.round(BUFFALO_LPD * season * (0.93 + r() * 0.14)),
      precioBase: QUESERA.precio,
      bonificacion: Math.round(150 + r() * 60),
      descuento: 0,
      guia: `${QUESERA.prefijo}-${3600 - i}`,
    });
  }
  return out;
}

const CATTLE_BUYERS = [
  "Frigorífico Central",
  "Ganadería El Recreo",
  "Subasta Ganadera del Llano",
  "Comercializadora Orinoquía",
];
const KINDS: [string, number, number, number][] = [
  // [categoría, peso mínimo, peso máximo, precio por kg]
  ["Novillo cebado", 430, 520, 9_100],
  ["Macho de levante", 260, 340, 9_600],
  ["Vaca de descarte", 380, 460, 7_400],
  ["Ternero macho destetado", 180, 230, 10_200],
  ["Novilla de vientre", 330, 390, 9_800],
];

function cattleSales(): CattleSale[] {
  const r = rng(23);
  const prefixes = ["LLA", "PAL", "SAB"];
  const out: CattleSale[] = [];
  for (let i = 0; i < 34; i++) {
    const k = KINDS[Math.floor(r() * KINDS.length)] as (typeof KINDS)[number];
    const days = Math.floor(i * 5.2 + r() * 4);
    out.push({
      fecha: ago(days),
      animal: `${prefixes[i % 3]}-${String(300 + Math.floor(r() * 180)).padStart(3, "0")}`,
      categoria: k[0],
      pesoKg: Math.round(k[1] + r() * (k[2] - k[1])),
      precioKg: Math.round((k[3] * (0.96 + r() * 0.08)) / 10) * 10,
      comprador: CATTLE_BUYERS[Math.floor(r() * CATTLE_BUYERS.length)] as string,
      guiaICA: `GSMI 85-${String(6100 + i * 7).padStart(4, "0")}`,
      estado: days < 12 && i % 2 === 0 ? "Por cobrar" : "Pagada",
    });
  }
  return out;
}

function clients(): Client[] {
  const extra: Client[] = [
    {
      nombre: "Cooperativa Lechera de Casanare",
      nit: "891.855.102-3",
      tipo: "Planta",
      telefono: "608 635 1200",
      plazo: 15,
      saldo: 46_800_000,
      vencido: 0,
      diasMora: 0,
    },
    {
      nombre: "Subasta Ganadera del Llano",
      nit: "900.311.420-8",
      tipo: "Subasta",
      telefono: "310 445 9012",
      plazo: 8,
      saldo: 14_350_000,
      vencido: 0,
      diasMora: 0,
    },
    {
      nombre: "Comercializadora Orinoquía",
      nit: "901.022.334-5",
      tipo: "Frigorífico",
      telefono: "318 200 4411",
      plazo: 30,
      saldo: 21_900_000,
      vencido: 6_200_000,
      diasMora: 9,
    },
    {
      nombre: "Quesos del Ariporo",
      nit: "901.554.778-1",
      tipo: "Quesera",
      telefono: "321 780 3355",
      plazo: 15,
      saldo: 3_150_000,
      vencido: 1_150_000,
      diasMora: 21,
    },
    {
      nombre: "Carnicería La Llanera",
      nit: "1.118.556.090",
      tipo: "Particular",
      telefono: "314 662 1987",
      plazo: 0,
      saldo: 0,
      vencido: 0,
      diasMora: 0,
    },
  ];
  return [...CLIENTS, ...extra];
}

/* ───────────── Personal: personas, tareas y cursos ───────────── */

const NEW_PEOPLE: [
  string,
  string,
  Person["contrato"],
  number,
  1 | 2 | 3 | 4 | 5,
  Person["estado"],
][] = [
  ["Marta Rojas", "Administradora", "Término indefinido", 4_800_000, 1, "Activo"],
  ["Jesús Ramírez", "Mayordomo El Palmar", "Término indefinido", 2_200_000, 3, "Activo"],
  ["Nelson Pabón", "Mayordomo La Sabana", "Término indefinido", 2_100_000, 3, "Activo"],
  ["Yaneth Cárdenas", "Ordeñadora", "Término indefinido", 1_650_000, 3, "Activo"],
  ["Wilmer Ortiz", "Ordeñador", "Término fijo", 1_600_000, 3, "Activo"],
  ["Diana Suárez", "Ordeñadora", "Término fijo", 1_600_000, 3, "Incapacidad"],
  ["Fredy Barrera", "Ordeñador", "Término indefinido", 1_650_000, 3, "Activo"],
  ["Pedro Silva", "Vaquero", "Término indefinido", 1_550_000, 4, "Activo"],
  ["Héctor Cuervo", "Vaquero", "Término indefinido", 1_550_000, 4, "Activo"],
  ["Ramiro Fonseca", "Vaquero", "Obra o labor", 1_500_000, 4, "Activo"],
  ["Edilson Rivera", "Vaquero", "Jornal", 1_423_500, 4, "Activo"],
  ["Alirio Vega", "Tractorista", "Término indefinido", 1_900_000, 4, "Activo"],
  ["Sonia Patiño", "Auxiliar contable", "Término indefinido", 2_300_000, 1, "Activo"],
  ["Gloria Medina", "Cocinera", "Término indefinido", 1_423_500, 1, "Activo"],
  ["Rosa Linares", "Cocinera", "Término fijo", 1_423_500, 1, "Vacaciones"],
  ["Camilo Rueda", "Oficios varios", "Jornal", 1_423_500, 3, "Activo"],
  ["Luis Carlos Mora", "Cercas y potreros", "Obra o labor", 1_500_000, 4, "Activo"],
];

function people(): Person[] {
  const r = rng(31);
  const extra = NEW_PEOPLE.map(([nombre, cargo, contrato, salario, riesgoARL, estado], i) => ({
    nombre,
    documento: `CC ${(1_118_000 + Math.floor(r() * 900_000)).toLocaleString("es-CO")}`,
    cargo,
    contrato,
    ingreso: ago(120 + Math.floor(r() * 2_400)),
    salario,
    riesgoARL,
    eps: ["Nueva EPS", "Sanitas", "Salud Total", "Capresoca"][i % 4] as string,
    estado,
    telefono: `3${10 + (i % 9)} ${400 + i * 13} ${String(1000 + i * 77).slice(0, 4)}`,
  }));
  return [...PEOPLE, ...extra];
}

function shifts(): Record<string, string[]> {
  const out: Record<string, string[]> = { ...SHIFTS };
  for (const [nombre, cargo] of NEW_PEOPLE) {
    const role = cargo.startsWith("Orde")
      ? "Ordeño"
      : cargo.startsWith("Vaquero")
        ? "Rotación"
        : cargo.startsWith("Tractor")
          ? "Mantenimiento"
          : cargo.startsWith("Cercas")
            ? "Cercas"
            : cargo.startsWith("Mayordomo")
              ? "Sanidad"
              : "Alimentación";
    const off = nombre.length % 7;
    out[nombre] = Array.from({ length: 7 }, (_, d) => (d === off ? "Descanso" : role));
  }
  return out;
}

const TASK_SEEDS: [string, string, string][] = [
  ["Palpar las vacas servidas de Los Llanos", "Jesús Ramírez", "Reproducción"],
  ["Vacunar terneras contra brucelosis (RB51)", "Nelson Pabón", "Sanidad"],
  ["Cambiar pezoneras del equipo de ordeño de El Palmar", "Alirio Vega", "Ordeño"],
  ["Aforo de potreros de La Sabana", "Luis Carlos Mora", "Pasturas"],
  ["Henificar el potrero 6 de Los Llanos", "Alirio Vega", "Pasturas"],
  ["Pesar novillas de levante", "Pedro Silva", "Producción"],
  ["Reparar bebedero del potrero 3", "Camilo Rueda", "Mantenimiento"],
  ["Inventario de bodega de medicamentos", "Sonia Patiño", "Bodega"],
  ["Liquidar nómina de la quincena", "Sonia Patiño", "Administración"],
  ["Renovar registro ICA del predio La Sabana", "Marta Rojas", "Administración"],
  ["CMT a todas las vacas de El Palmar", "Yaneth Cárdenas", "Ordeño"],
  ["Mover el lote de cría al potrero 5", "Héctor Cuervo", "Rotación"],
  ["Fertilizar con urea potreros 1 y 2", "Luis Carlos Mora", "Pasturas"],
  ["Mantenimiento del tanque de enfriamiento", "Alirio Vega", "Mantenimiento"],
  ["Destetar terneros de La Sabana", "Ramiro Fonseca", "Producción"],
  ["Cercar bosque de galería del caño", "Luis Carlos Mora", "Cercas"],
  ["Desparasitar el lote de levante", "Edilson Rivera", "Sanidad"],
  ["Calibrar báscula de pesaje", "Alirio Vega", "Mantenimiento"],
  ["Capacitación en ordeño higiénico", "Marta Rojas", "Capacitación"],
  ["Revisar cerca eléctrica perimetral", "Camilo Rueda", "Cercas"],
];

function tasks(): Task[] {
  const extra = TASK_SEEDS.map(([titulo, responsable, area], i) => ({
    titulo,
    responsable,
    area,
    limite: i < 3 ? ago(2 + i) : fut(i - 2),
    estado: (i % 5 === 0 ? "Hecha" : i % 3 === 0 ? "En curso" : "Pendiente") as Task["estado"],
  }));
  return [...TASKS, ...extra];
}

const COURSE_NAMES = [
  "Buenas prácticas de ordeño",
  "Manejo de bovinos y bienestar animal",
  "Primeros auxilios",
  "Aplicación segura de medicamentos veterinarios",
  "Trabajo seguro en alturas",
  "Manejo de maquinaria agrícola",
  "Manipulación de alimentos",
];

function courses(): Course[] {
  const extra: Course[] = [];
  for (const [i, [nombre, cargo]] of NEW_PEOPLE.entries()) {
    const curso = cargo.startsWith("Orde")
      ? COURSE_NAMES[0]
      : cargo.startsWith("Tractor")
        ? COURSE_NAMES[5]
        : cargo.startsWith("Cocin")
          ? COURSE_NAMES[6]
          : COURSE_NAMES[(i % 4) + 1];
    const taken = 60 + ((i * 47) % 700);
    extra.push({
      persona: nombre,
      curso: curso as string,
      fecha: ago(taken),
      vence: addDays(ago(taken), 730),
    });
    if (i % 3 === 0)
      extra.push({
        persona: nombre,
        curso: "Primeros auxilios",
        fecha: ago(380 + i),
        vence: ago(15 - i),
      });
  }
  return [...COURSES, ...extra];
}

/* ───────────── Activos y mantenimiento ───────────── */

const NEW_ASSETS: [string, string, Asset["tipo"], string, number, number, number, number?][] = [
  [
    "MQ-10",
    "Tractor Massey Ferguson 4292",
    "Maquinaria",
    "Los Llanos",
    185_000_000,
    12,
    35_000_000,
    4_480,
  ],
  ["MQ-11", "Rastra pesada 20 discos", "Maquinaria", "Los Llanos", 28_000_000, 12, 3_000_000],
  ["MQ-12", "Henificadora y rastrillo", "Maquinaria", "Los Llanos", 64_000_000, 10, 8_000_000, 610],
  ["MQ-13", "Picadora de forraje", "Maquinaria", "El Palmar", 18_500_000, 8, 1_500_000, 1_150],
  [
    "OR-10",
    "Equipo de ordeño 12 puestos",
    "Equipo de ordeño",
    "El Palmar",
    96_000_000,
    12,
    9_000_000,
    9_800,
  ],
  [
    "OR-11",
    "Tanque de enfriamiento 5.000 L",
    "Equipo de ordeño",
    "El Palmar",
    72_000_000,
    15,
    7_000_000,
  ],
  [
    "OR-12",
    "Tanque de enfriamiento 3.000 L",
    "Equipo de ordeño",
    "Los Llanos",
    48_000_000,
    15,
    5_000_000,
  ],
  [
    "OR-13",
    "Ordeñadora móvil 2 puestos (búfalas)",
    "Equipo de ordeño",
    "Los Llanos",
    14_000_000,
    8,
    1_000_000,
    2_300,
  ],
  ["VH-10", "Camioneta Toyota Hilux", "Vehículo", "Los Llanos", 168_000_000, 10, 50_000_000],
  ["VH-11", "Motocicleta Honda XR 150", "Vehículo", "La Sabana", 9_800_000, 6, 1_500_000],
  ["VH-12", "Remolque ganadero", "Vehículo", "La Sabana", 22_000_000, 15, 2_000_000],
  ["IN-10", "Corral y manga de La Sabana", "Instalación", "La Sabana", 58_000_000, 20, 0],
  ["IN-11", "Sala de ordeño El Palmar", "Instalación", "El Palmar", 210_000_000, 25, 0],
  ["IN-12", "Pozo profundo y bomba solar", "Instalación", "Los Llanos", 46_000_000, 15, 4_000_000],
  ["IN-13", "Cerca eléctrica solar 25 km", "Instalación", "Los Llanos", 21_000_000, 8, 0],
  ["HR-10", "Báscula electrónica de 2 t", "Herramienta", "Los Llanos", 12_500_000, 10, 1_000_000],
];

function assets(): Asset[] {
  const extra = NEW_ASSETS.map(
    ([codigo, nombre, tipo, ubicacion, costo, vidaAnios, residual, horas], i) => ({
      codigo,
      nombre,
      tipo,
      ubicacion,
      estado: (i === 3
        ? "En mantenimiento"
        : i === 10
          ? "Fuera de servicio"
          : "Operativo") as Asset["estado"],
      compra: ago(365 * (1 + (i % 7)) + i * 11),
      costo,
      vidaAnios,
      residual,
      ...(horas ? { horas } : {}),
    }),
  );
  return [...ASSETS, ...extra];
}

const WORKS: [string, MaintLog["tipo"], string, number, string][] = [
  ["MQ-10", "Preventivo", "Cambio de aceite, filtros y engrase", 780_000, "Taller Agromotor Yopal"],
  ["OR-10", "Preventivo", "Cambio de pezoneras y mangueras", 1_350_000, "Lechería Insumos"],
  ["OR-11", "Preventivo", "Revisión del compresor y gas", 420_000, "Frío Andino"],
  ["VH-10", "Preventivo", "Mantenimiento de 60.000 km", 1_120_000, "Concesionario del Llano"],
  ["MQ-13", "Correctivo", "Cambio de cuchillas", 640_000, "Taller Agromotor Yopal"],
  [
    "IN-12",
    "Correctivo",
    "Cambio del controlador de la bomba",
    1_980_000,
    "Energía Solar Casanare",
  ],
  ["IN-13", "Preventivo", "Revisión de aisladores y tierra", 260_000, "Mano de obra propia"],
  ["OR-13", "Correctivo", "Reparación de la bomba de vacío", 850_000, "Lechería Insumos"],
  ["MQ-12", "Preventivo", "Engrase y ajuste antes de henificar", 340_000, "Mano de obra propia"],
  ["VH-11", "Correctivo", "Cambio de llantas y frenos", 690_000, "Taller Motos Paz de Ariporo"],
];

function maintLog(): MaintLog[] {
  const extra: MaintLog[] = [];
  for (let round = 0; round < 3; round++) {
    for (const [i, [codigo, tipo, trabajo, costo, proveedor]] of WORKS.entries()) {
      if (round > 0 && tipo === "Correctivo" && (i + round) % 2 === 0) continue;
      extra.push({
        fecha: ago(round * 58 + i * 5 + 2),
        codigo,
        tipo,
        trabajo,
        costo: Math.round(costo * (1 - round * 0.03)),
        proveedor,
      });
    }
  }
  return [...MAINT_LOG, ...extra];
}

/* ───────────── Contabilidad: facturas y cuentas por pagar ───────────── */

function weekly(list: Delivery[]) {
  const weeks = new Map<
    string,
    { comprador: string; week: number; litros: number; valor: number }
  >();
  for (const d of list) {
    const week = Math.floor((Date.parse(iso(today())) - Date.parse(d.fecha)) / (7 * 864e5));
    const k = `${d.comprador}|${week}`;
    const w = weeks.get(k) ?? { comprador: d.comprador, week, litros: 0, valor: 0 };
    w.litros += d.litros;
    w.valor += d.litros * (d.precioBase + d.bonificacion - d.descuento);
    weeks.set(k, w);
  }
  return [...weeks.values()].filter((w) => w.week < 12);
}

function invoices(): Invoice[] {
  const out: Invoice[] = [];
  let n = 1_260;
  const milk = weekly(deliveries()).sort((a, b) => b.week - a.week);
  for (const w of milk) {
    const fecha = ago(w.week * 7 + 1);
    out.push({
      numero: `FE-${n++}`,
      fecha,
      cliente: w.comprador,
      concepto: `Leche ${w.comprador === QUESERA.nombre ? "de búfala" : "bovina"} · ${Math.round(w.litros).toLocaleString("es-CO")} L`,
      base: Math.round(w.valor),
      iva: 0,
      retencion: Math.round(w.valor * 0.015),
      estado: w.week === 0 ? "Pendiente" : "Aceptada DIAN",
      vence: addDays(fecha, 15),
      pagada: w.week > 2,
    });
  }
  for (const s of cattleSales().filter((x) => x.fecha >= ago(90))) {
    const base = s.pesoKg * s.precioKg;
    out.push({
      numero: `FE-${n++}`,
      fecha: s.fecha,
      cliente: s.comprador,
      concepto: `${s.categoria} ${s.animal} · ${s.pesoKg} kg`,
      base,
      iva: 0,
      retencion: Math.round(base * 0.015),
      estado: "Aceptada DIAN",
      vence: addDays(s.fecha, 8),
      pagada: s.estado === "Pagada",
    });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

const PAYABLE_SEEDS: [string, string, string, number, number, boolean][] = [
  [
    "Agroinsumos del Llano",
    "900.456.789-0",
    "Concentrado lechero 18 % · 200 bultos",
    16_400_000,
    6,
    false,
  ],
  [
    "Agroinsumos del Llano",
    "900.456.789-0",
    "Sal mineralizada 8 % · 60 bultos",
    5_880_000,
    18,
    false,
  ],
  [
    "Veterinaria El Cebú",
    "830.222.111-5",
    "Vacunas, antibióticos y purgantes",
    4_215_000,
    9,
    false,
  ],
  [
    "Nutrición Animal Yopal",
    "901.333.210-4",
    "Bloques nutricionales · 120 unidades",
    5_520_000,
    22,
    false,
  ],
  ["Lechería Insumos", "900.778.430-2", "Sellador, pezoneras y CMT", 3_140_000, -4, false],
  ["Frío Andino", "830.556.120-9", "Mantenimiento tanques de enfriamiento", 1_260_000, 12, false],
  ["Enerca", "892.099.234-1", "Energía sala de ordeño y bombas", 3_870_000, 3, false],
  [
    "Taller Agromotor Yopal",
    "1.118.445.229",
    "Repuestos y mano de obra tractores",
    2_340_000,
    25,
    false,
  ],
  ["Ferretería La Llanera", "900.120.332-7", "Alambre y aisladores", 7_125_000, 30, false],
  ["Concesionario del Llano", "900.889.120-3", "Mantenimiento camioneta", 1_120_000, -12, true],
  ["Genética Bovina SAS", "900.501.223-6", "Pajillas y nitrógeno líquido", 3_800_000, 15, false],
  ["Agroinsumos del Llano", "900.456.789-0", "Urea y NPK · 70 bultos", 12_060_000, -20, true],
];

function payables(): Payable[] {
  return PAYABLE_SEEDS.map(([proveedor, nit, concepto, valor, vence, pagada]) => ({
    proveedor,
    nit,
    concepto,
    valor,
    vence: vence >= 0 ? fut(vence) : ago(-vence),
    pagada,
  }));
}

/* ───────────── Economía: seis meses de ingresos y egresos ───────────── */

function movs(): Mov[] {
  const r = rng(47);
  const out: Mov[] = [];
  const add = (
    d: number,
    tipo: Mov["tipo"],
    categoria: string,
    descripcion: string,
    valor: number,
    actividad: Mov["actividad"],
    soporte = "—",
  ) =>
    out.push({
      fecha: ago(d),
      tipo,
      categoria,
      descripcion,
      valor: Math.round(valor),
      actividad,
      soporte,
    });

  // Leche: lo que pagan los compradores cada semana (las mismas entregas de Ventas).
  for (const w of weekly(deliveries())) {
    if (w.week === 0) continue;
    const bufala = w.comprador === QUESERA.nombre;
    add(
      w.week * 7 - 3,
      "Ingreso",
      bufala ? "Leche de búfala" : "Leche bovina",
      `${w.comprador} · semana ${48 - w.week}`,
      w.valor * 0.985,
      "Leche",
      `FE-${1_260 + w.week}`,
    );
  }
  // Ganado: las ventas registradas.
  for (const s of cattleSales())
    if (s.estado === "Pagada")
      add(
        Math.max(0, Math.round((Date.parse(iso(today())) - Date.parse(s.fecha)) / 864e5) - 2),
        "Ingreso",
        "Ganado",
        `${s.categoria} ${s.animal} · ${s.comprador}`,
        s.pesoKg * s.precioKg,
        "Cría y levante",
        s.guiaICA,
      );

  const payroll = people()
    .filter((p) => p.estado !== "Retirado")
    .reduce((t, p) => t + p.salario, 0);
  for (let m = 0; m < 6; m++) {
    const base = m * 30;
    // Nómina quincenal con aportes y prestaciones (cerca de 52 % sobre el salario).
    add(
      base + 1,
      "Egreso",
      "Mano de obra",
      "Nómina y aportes · segunda quincena",
      (payroll / 2) * 1.52,
      "General",
      "Planilla PILA",
    );
    add(
      base + 16,
      "Egreso",
      "Mano de obra",
      "Nómina y aportes · primera quincena",
      (payroll / 2) * 1.52,
      "General",
      "Planilla PILA",
    );
    add(
      base + 4,
      "Egreso",
      "Alimentación",
      "Concentrado lechero 18 % · 200 bultos",
      16_400_000 * (0.95 + r() * 0.1),
      "Leche",
      "Agroinsumos del Llano",
    );
    add(
      base + 11,
      "Egreso",
      "Alimentación",
      "Sal mineralizada y bloques nutricionales",
      9_600_000 * (0.9 + r() * 0.2),
      "General",
      "Agroinsumos del Llano",
    );
    add(
      base + 19,
      "Egreso",
      "Alimentación",
      "Semilla y aditivo para ensilaje",
      3_200_000 * (0.85 + r() * 0.3),
      "Leche",
    );
    add(
      base + 7,
      "Egreso",
      "Sanidad",
      "Vacunas, antibióticos y purgantes",
      4_100_000 * (0.85 + r() * 0.3),
      "General",
      "Veterinaria El Cebú",
    );
    add(
      base + 21,
      "Egreso",
      "Sanidad",
      "Visita y honorarios veterinarios",
      2_400_000,
      "General",
      "Dra. Camila Torres",
    );
    add(
      base + 13,
      "Egreso",
      "Reproducción",
      "Pajillas, IATF y nitrógeno",
      3_800_000 * (0.8 + r() * 0.4),
      "Leche",
      "Genética Bovina SAS",
    );
    add(
      base + 9,
      "Egreso",
      "Pasturas",
      "Urea y NPK para potreros",
      6_000_000 * (0.7 + r() * 0.6),
      "General",
      "Agroinsumos del Llano",
    );
    add(
      base + 3,
      "Egreso",
      "Energía y agua",
      "Energía sala de ordeño y bombas",
      3_870_000 * (0.9 + r() * 0.2),
      "Leche",
      "Enerca",
    );
    add(
      base + 26,
      "Egreso",
      "Energía y agua",
      "Combustible tractores y planta",
      2_900_000 * (0.85 + r() * 0.3),
      "General",
    );
    add(
      base + 15,
      "Egreso",
      "Impuestos",
      "Impuesto predial y registro ICA",
      m === 2 ? 8_600_000 : 450_000,
      "General",
    );
    add(
      base + 23,
      "Ingreso",
      "Subproductos",
      "Venta de compost y estiércol",
      900_000 * (0.7 + r() * 0.6),
      "General",
    );
  }
  // Mantenimiento: los trabajos registrados en Activos.
  for (const l of maintLog())
    add(
      Math.round((Date.parse(iso(today())) - Date.parse(l.fecha)) / 864e5),
      "Egreso",
      "Mantenimiento",
      `${l.trabajo} (${l.codigo})`,
      l.costo,
      "General",
      l.proveedor,
    );
  return out.filter((m) => m.fecha <= iso(today())).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Presupuesto mensual a la escala de la finca. */
const BUDGET = [
  { rubro: "Alimentación", presupuesto: 30_000_000 },
  { rubro: "Mano de obra", presupuesto: 62_000_000 },
  { rubro: "Sanidad", presupuesto: 7_000_000 },
  { rubro: "Reproducción", presupuesto: 4_500_000 },
  { rubro: "Pasturas", presupuesto: 7_000_000 },
  { rubro: "Energía y agua", presupuesto: 7_500_000 },
  { rubro: "Mantenimiento", presupuesto: 6_000_000 },
];

/* ───────────── Selección ───────────── */

const GENERATORS: Record<string, () => unknown> = {
  entregas: deliveries,
  "ventas-ganado": cattleSales,
  clientes: clients,
  personas: people,
  tareas: tasks,
  cursos: courses,
  activos: assets,
  "mant-log": maintLog,
  facturas: invoices,
  "por-pagar": payables,
  "movs-eco": movs,
  shifts,
  budget: () => BUDGET,
};

const cache = new Map<string, unknown>();

/**
 * Lo de ejemplo de un módulo: el de la cuenta grande si se está en ella y existe; si no, `base`.
 * Se calcula una vez por día y cuenta.
 */
export function richOr<T>(key: string, base: T): T {
  const make = GENERATORS[key];
  if (!dataScope.rich || !make) return base;
  const k = `${dataScope.org}|${iso(today())}|${key}`;
  if (!cache.has(k)) cache.set(k, make());
  return cache.get(k) as T;
}

setSeedOverride(richOr);
