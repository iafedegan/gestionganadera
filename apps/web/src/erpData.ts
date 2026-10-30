import { addDays, ago, iso, today } from "./kit";

/** Datos de ejemplo de los módulos de gestión. Valores normativos y tarifas: de referencia, configurables. */

const fut = (d: number) => addDays(iso(today()), d);

/* ───────────── Asistencia técnica ───────────── */

export interface Visit {
  id: string;
  fecha: string;
  asesor: string;
  area: "Veterinaria" | "Zootecnia" | "Agronomía" | "Buenas prácticas" | "Gestión";
  objetivo: string;
  estado: "Programada" | "Realizada" | "Cancelada";
  hallazgos?: string;
  duracion?: number;
}
export const VISITS: Visit[] = [
  {
    id: "V-09",
    fecha: fut(3),
    asesor: "Dra. Marcela Ruiz",
    area: "Veterinaria",
    objetivo: "Diagnóstico de gestación y revisión de vacas vacías",
    estado: "Programada",
  },
  {
    id: "V-10",
    fecha: fut(12),
    asesor: "Ing. Julián Torres",
    area: "Agronomía",
    objetivo: "Plan de fertilización y división de potreros",
    estado: "Programada",
  },
  {
    id: "V-11",
    fecha: fut(26),
    asesor: "Zoot. Paula Gómez",
    area: "Zootecnia",
    objetivo: "Ajuste de raciones del lote de ordeño",
    estado: "Programada",
  },
  {
    id: "V-08",
    fecha: ago(6),
    asesor: "Ing. Julián Torres",
    area: "Buenas prácticas",
    objetivo: "Calidad de leche y rutina de ordeño",
    estado: "Realizada",
    hallazgos: "Células somáticas en 210 mil/mL; presellado irregular; tanque llega a 4,1 °C.",
    duracion: 3,
  },
  {
    id: "V-07",
    fecha: ago(20),
    asesor: "Dra. Marcela Ruiz",
    area: "Veterinaria",
    objetivo: "Vacunación y control de mastitis",
    estado: "Realizada",
    hallazgos: "Dos casos de mastitis clínica; botiquín con producto vencido.",
    duracion: 4,
  },
  {
    id: "V-06",
    fecha: ago(41),
    asesor: "Zoot. Paula Gómez",
    area: "Zootecnia",
    objetivo: "Condición corporal del hato",
    estado: "Realizada",
    hallazgos: "Condición corporal 2,5 en vacas de inicio de lactancia.",
    duracion: 2,
  },
  {
    id: "V-05",
    fecha: ago(63),
    asesor: "Ing. Julián Torres",
    area: "Gestión",
    objetivo: "Costos de producción y presupuesto",
    estado: "Realizada",
    hallazgos: "Alimentación pesa 48 % de los ingresos.",
    duracion: 3,
  },
];

export interface Reco {
  id: string;
  visita: string;
  area: Visit["area"];
  texto: string;
  prioridad: "Alta" | "Media" | "Baja";
  responsable: string;
  limite: string;
  estado: "Abierta" | "En curso" | "Cumplida" | "Descartada";
}
export const RECOS: Reco[] = [
  {
    id: "R-21",
    visita: "V-08",
    area: "Buenas prácticas",
    texto: "Aplicar presellado y secado con toalla individual en cada ordeño",
    prioridad: "Alta",
    responsable: "Ana Rojas",
    limite: fut(4),
    estado: "En curso",
  },
  {
    id: "R-22",
    visita: "V-08",
    area: "Buenas prácticas",
    texto: "Revisar el equipo de frío: el tanque debe llegar a 4 °C en dos horas",
    prioridad: "Alta",
    responsable: "Luis Martínez",
    limite: ago(2),
    estado: "Abierta",
  },
  {
    id: "R-23",
    visita: "V-08",
    area: "Buenas prácticas",
    texto: "Cambiar pezoneras (más de 2.500 ordeños)",
    prioridad: "Media",
    responsable: "Luis Martínez",
    limite: fut(10),
    estado: "Abierta",
  },
  {
    id: "R-18",
    visita: "V-07",
    area: "Veterinaria",
    texto: "Retirar y desechar productos vencidos del botiquín",
    prioridad: "Alta",
    responsable: "Luis Martínez",
    limite: ago(15),
    estado: "Cumplida",
  },
  {
    id: "R-19",
    visita: "V-07",
    area: "Veterinaria",
    texto: "Cultivo y antibiograma de los casos de mastitis",
    prioridad: "Alta",
    responsable: "Dra. Marcela Ruiz",
    limite: ago(12),
    estado: "Cumplida",
  },
  {
    id: "R-20",
    visita: "V-07",
    area: "Veterinaria",
    texto: "Llevar registro CMT semanal del lote de ordeño",
    prioridad: "Media",
    responsable: "Ana Rojas",
    limite: ago(5),
    estado: "Abierta",
  },
  {
    id: "R-15",
    visita: "V-06",
    area: "Zootecnia",
    texto: "Aumentar la energía de la dieta en las primeras 8 semanas de lactancia",
    prioridad: "Media",
    responsable: "Luis Martínez",
    limite: ago(30),
    estado: "Cumplida",
  },
  {
    id: "R-16",
    visita: "V-06",
    area: "Zootecnia",
    texto: "Calificar condición corporal al parto, al pico y al secado",
    prioridad: "Baja",
    responsable: "Pedro Gómez",
    limite: fut(20),
    estado: "En curso",
  },
  {
    id: "R-12",
    visita: "V-05",
    area: "Gestión",
    texto: "Registrar todos los egresos con su soporte",
    prioridad: "Media",
    responsable: "Propietario",
    limite: ago(40),
    estado: "Cumplida",
  },
  {
    id: "R-13",
    visita: "V-05",
    area: "Gestión",
    texto: "Comparar cada mes el costo por litro con el precio pagado",
    prioridad: "Media",
    responsable: "Propietario",
    limite: fut(15),
    estado: "En curso",
  },
];

export interface Grant {
  asesor: string;
  rol: string;
  modulos: string[];
  desde: string;
  hasta: string;
  activo: boolean;
}
export const GRANTS: Grant[] = [
  {
    asesor: "Dra. Marcela Ruiz",
    rol: "Médica veterinaria",
    modulos: ["Animales", "Reproducción", "Sanidad"],
    desde: ago(120),
    hasta: fut(245),
    activo: true,
  },
  {
    asesor: "Ing. Julián Torres",
    rol: "Asistente técnico",
    modulos: ["Pasturas", "Producción", "Economía"],
    desde: ago(90),
    hasta: fut(90),
    activo: true,
  },
  {
    asesor: "Zoot. Paula Gómez",
    rol: "Zootecnista",
    modulos: ["Producción", "Pasturas"],
    desde: ago(60),
    hasta: fut(5),
    activo: true,
  },
  {
    asesor: "Laboratorio Lácteo del Valle",
    rol: "Laboratorio",
    modulos: ["Producción"],
    desde: ago(300),
    hasta: ago(10),
    activo: false,
  },
];

/* ───────────── Ventas ───────────── */

export interface Delivery {
  fecha: string;
  comprador: string;
  especie: "bovino" | "bufalino";
  litros: number;
  precioBase: number;
  bonificacion: number;
  descuento: number;
  guia: string;
}
const buyers = { bovino: "Lácteos del Valle", bufalino: "Quesera La Esperanza" };
export const DELIVERIES: Delivery[] = Array.from({ length: 14 }, (_, i) => [
  {
    fecha: ago(i),
    comprador: buyers.bovino,
    especie: "bovino" as const,
    litros: Math.round(186 + Math.sin(i) * 9),
    precioBase: 1850,
    bonificacion: 95,
    descuento: 60,
    guia: `LV-${5610 - i}`,
  },
  {
    fecha: ago(i),
    comprador: buyers.bufalino,
    especie: "bufalino" as const,
    litros: Math.round(33 + Math.cos(i) * 3),
    precioBase: 3600,
    bonificacion: 180,
    descuento: 0,
    guia: `QE-${2210 - i}`,
  },
]).flat();

export interface CattleSale {
  fecha: string;
  animal: string;
  categoria: string;
  pesoKg: number;
  precioKg: number;
  comprador: string;
  guiaICA: string;
  estado: "Pagada" | "Por cobrar";
}
export const CATTLE_SALES: CattleSale[] = [
  {
    fecha: ago(9),
    animal: "BOV-024",
    categoria: "Macho de levante",
    pesoKg: 318,
    precioKg: 9200,
    comprador: "Frigorífico Central",
    guiaICA: "GSMI 77-4512",
    estado: "Pagada",
  },
  {
    fecha: ago(9),
    animal: "BOV-025",
    categoria: "Macho de levante",
    pesoKg: 296,
    precioKg: 9200,
    comprador: "Frigorífico Central",
    guiaICA: "GSMI 77-4512",
    estado: "Pagada",
  },
  {
    fecha: ago(55),
    animal: "BOV-013",
    categoria: "Vaca de descarte",
    pesoKg: 498,
    precioKg: 6200,
    comprador: "Subasta Ganadera del Norte",
    guiaICA: "GSMI 71-3310",
    estado: "Pagada",
  },
  {
    fecha: ago(3),
    animal: "BUF-011",
    categoria: "Bucerro",
    pesoKg: 210,
    precioKg: 8100,
    comprador: "Ganadería El Recreo",
    guiaICA: "GSMI 78-0021",
    estado: "Por cobrar",
  },
];

export interface Client {
  nombre: string;
  nit: string;
  tipo: "Planta" | "Quesera" | "Frigorífico" | "Subasta" | "Particular";
  telefono: string;
  plazo: number;
  saldo: number;
  vencido: number;
  diasMora: number;
}
export const CLIENTS: Client[] = [
  {
    nombre: "Lácteos del Valle",
    nit: "900.123.456-1",
    tipo: "Planta",
    telefono: "310 555 0142",
    plazo: 15,
    saldo: 5_180_000,
    vencido: 0,
    diasMora: 0,
  },
  {
    nombre: "Quesera La Esperanza",
    nit: "901.555.210-7",
    tipo: "Quesera",
    telefono: "320 555 0119",
    plazo: 8,
    saldo: 2_240_000,
    vencido: 640_000,
    diasMora: 12,
  },
  {
    nombre: "Frigorífico Central",
    nit: "800.777.333-2",
    tipo: "Frigorífico",
    telefono: "315 555 0177",
    plazo: 30,
    saldo: 0,
    vencido: 0,
    diasMora: 0,
  },
  {
    nombre: "Ganadería El Recreo",
    nit: "71.234.567",
    tipo: "Particular",
    telefono: "311 555 0190",
    plazo: 30,
    saldo: 1_701_000,
    vencido: 0,
    diasMora: 0,
  },
  {
    nombre: "Subasta Ganadera del Norte",
    nit: "890.111.222-4",
    tipo: "Subasta",
    telefono: "604 555 0101",
    plazo: 8,
    saldo: 0,
    vencido: 0,
    diasMora: 0,
  },
];

/** Cuota de fomento ganadero y lechero sobre el precio de la leche (referencia). */
export const CUOTA_FOMENTO_LECHE = 0.0075;

/* ───────────── Personal ───────────── */

export interface Person {
  nombre: string;
  documento: string;
  cargo: string;
  contrato: "Término indefinido" | "Término fijo" | "Obra o labor" | "Jornal";
  ingreso: string;
  salario: number;
  riesgoARL: 1 | 2 | 3 | 4 | 5;
  eps: string;
  estado: "Activo" | "Vacaciones" | "Incapacidad" | "Retirado";
  telefono: string;
}
export const PEOPLE: Person[] = [
  {
    nombre: "Luis Martínez",
    documento: "CC 1.023.456",
    cargo: "Mayordomo",
    contrato: "Término indefinido",
    ingreso: ago(1800),
    salario: 2_100_000,
    riesgoARL: 3,
    eps: "Nueva EPS",
    estado: "Activo",
    telefono: "312 555 0110",
  },
  {
    nombre: "Ana Rojas",
    documento: "CC 1.045.789",
    cargo: "Ordeñadora",
    contrato: "Término indefinido",
    ingreso: ago(900),
    salario: 1_600_000,
    riesgoARL: 3,
    eps: "Sura",
    estado: "Activo",
    telefono: "313 555 0121",
  },
  {
    nombre: "Pedro Gómez",
    documento: "CC 1.067.111",
    cargo: "Vaquero",
    contrato: "Término fijo",
    ingreso: ago(400),
    salario: 1_550_000,
    riesgoARL: 3,
    eps: "Sanitas",
    estado: "Activo",
    telefono: "314 555 0132",
  },
  {
    nombre: "María Ospina",
    documento: "CC 1.089.222",
    cargo: "Ordeñadora",
    contrato: "Término fijo",
    ingreso: ago(200),
    salario: 1_550_000,
    riesgoARL: 3,
    eps: "Nueva EPS",
    estado: "Vacaciones",
    telefono: "315 555 0143",
  },
  {
    nombre: "Carlos Díaz",
    documento: "CC 1.099.333",
    cargo: "Jornalero",
    contrato: "Jornal",
    ingreso: ago(60),
    salario: 75_000,
    riesgoARL: 3,
    eps: "Sura",
    estado: "Activo",
    telefono: "316 555 0154",
  },
];

export const SMMLV = 1_423_500;
export const AUX_TRANSPORTE = 200_000;
export const ARL_TARIFA: Record<number, number> = {
  1: 0.00522,
  2: 0.01044,
  3: 0.02436,
  4: 0.0435,
  5: 0.0696,
};

export const LABORES = [
  "Ordeño",
  "Rotación",
  "Sanidad",
  "Cercas",
  "Alimentación",
  "Mantenimiento",
  "Descanso",
];
export const SHIFTS: Record<string, string[]> = {
  "Luis Martínez": [
    "Sanidad",
    "Rotación",
    "Mantenimiento",
    "Sanidad",
    "Rotación",
    "Alimentación",
    "Descanso",
  ],
  "Ana Rojas": ["Ordeño", "Ordeño", "Ordeño", "Ordeño", "Ordeño", "Ordeño", "Descanso"],
  "Pedro Gómez": ["Rotación", "Cercas", "Rotación", "Alimentación", "Cercas", "Descanso", "Ordeño"],
  "María Ospina": [
    "Descanso",
    "Descanso",
    "Descanso",
    "Descanso",
    "Descanso",
    "Descanso",
    "Descanso",
  ],
  "Carlos Díaz": [
    "Cercas",
    "Cercas",
    "Mantenimiento",
    "Cercas",
    "Mantenimiento",
    "Descanso",
    "Descanso",
  ],
};

export interface Course {
  persona: string;
  curso: string;
  fecha: string;
  vence: string;
}
export const COURSES: Course[] = [
  { persona: "Ana Rojas", curso: "Manipulación de alimentos", fecha: ago(330), vence: fut(35) },
  { persona: "Ana Rojas", curso: "Buenas prácticas de ordeño", fecha: ago(200), vence: fut(530) },
  { persona: "Luis Martínez", curso: "Primeros auxilios", fecha: ago(400), vence: ago(35) },
  {
    persona: "Luis Martínez",
    curso: "Aplicación segura de medicamentos veterinarios",
    fecha: ago(150),
    vence: fut(580),
  },
  {
    persona: "Pedro Gómez",
    curso: "Manejo de bovinos y bienestar animal",
    fecha: ago(90),
    vence: fut(640),
  },
  { persona: "María Ospina", curso: "Manipulación de alimentos", fecha: ago(370), vence: ago(5) },
];

export interface Task {
  titulo: string;
  responsable: string;
  limite: string;
  estado: "Pendiente" | "En curso" | "Hecha";
  area: string;
}
export const TASKS: Task[] = [
  {
    titulo: "Reparar cerca eléctrica del potrero Norte",
    responsable: "Carlos Díaz",
    limite: fut(1),
    estado: "En curso",
    area: "Cercas",
  },
  {
    titulo: "Lavar tanque de frío y registrar temperatura",
    responsable: "Ana Rojas",
    limite: fut(0),
    estado: "Pendiente",
    area: "Ordeño",
  },
  {
    titulo: "Mover lote de levante a Potrero Norte",
    responsable: "Pedro Gómez",
    limite: fut(2),
    estado: "Pendiente",
    area: "Rotación",
  },
  {
    titulo: "Aplicar Ivermectina al lote de levante",
    responsable: "Luis Martínez",
    limite: ago(1),
    estado: "Pendiente",
    area: "Sanidad",
  },
  {
    titulo: "Inventario de sal mineralizada",
    responsable: "Luis Martínez",
    limite: ago(3),
    estado: "Hecha",
    area: "Alimentación",
  },
  {
    titulo: "Calibrar báscula ganadera",
    responsable: "Carlos Díaz",
    limite: fut(9),
    estado: "Pendiente",
    area: "Mantenimiento",
  },
];

/* ───────────── Activos ───────────── */

export interface Asset {
  codigo: string;
  nombre: string;
  tipo: "Maquinaria" | "Equipo de ordeño" | "Vehículo" | "Instalación" | "Herramienta";
  ubicacion: string;
  estado: "Operativo" | "En mantenimiento" | "Fuera de servicio";
  compra: string;
  costo: number;
  vidaAnios: number;
  residual: number;
  horas?: number;
}
export const ASSETS: Asset[] = [
  {
    codigo: "MQ-01",
    nombre: "Tractor John Deere 5075E",
    tipo: "Maquinaria",
    ubicacion: "Bodega",
    estado: "Operativo",
    compra: ago(365 * 4),
    costo: 165_000_000,
    vidaAnios: 10,
    residual: 30_000_000,
    horas: 3120,
  },
  {
    codigo: "MQ-02",
    nombre: "Guadañadora de discos",
    tipo: "Maquinaria",
    ubicacion: "Bodega",
    estado: "Operativo",
    compra: ago(365 * 3),
    costo: 18_500_000,
    vidaAnios: 8,
    residual: 2_000_000,
    horas: 610,
  },
  {
    codigo: "OR-01",
    nombre: "Equipo de ordeño mecánico 4 puestos",
    tipo: "Equipo de ordeño",
    ubicacion: "Sala de ordeño",
    estado: "Operativo",
    compra: ago(365 * 5),
    costo: 42_000_000,
    vidaAnios: 10,
    residual: 4_000_000,
  },
  {
    codigo: "OR-02",
    nombre: "Tanque de enfriamiento 1.000 L",
    tipo: "Equipo de ordeño",
    ubicacion: "Sala de ordeño",
    estado: "En mantenimiento",
    compra: ago(365 * 6),
    costo: 26_000_000,
    vidaAnios: 12,
    residual: 3_000_000,
  },
  {
    codigo: "VH-01",
    nombre: "Camioneta 4x4",
    tipo: "Vehículo",
    ubicacion: "Casa",
    estado: "Operativo",
    compra: ago(365 * 2),
    costo: 120_000_000,
    vidaAnios: 5,
    residual: 50_000_000,
  },
  {
    codigo: "IN-01",
    nombre: "Sala de ordeño y corrales",
    tipo: "Instalación",
    ubicacion: "Centro de la finca",
    estado: "Operativo",
    compra: ago(365 * 9),
    costo: 95_000_000,
    vidaAnios: 20,
    residual: 10_000_000,
  },
  {
    codigo: "IN-02",
    nombre: "Cercas eléctricas (6,5 km) e impulsor",
    tipo: "Instalación",
    ubicacion: "Potreros",
    estado: "Operativo",
    compra: ago(365 * 3),
    costo: 14_000_000,
    vidaAnios: 8,
    residual: 1_000_000,
  },
  {
    codigo: "HE-01",
    nombre: "Báscula ganadera electrónica",
    tipo: "Herramienta",
    ubicacion: "Manga",
    estado: "Operativo",
    compra: ago(365 * 2),
    costo: 9_800_000,
    vidaAnios: 8,
    residual: 800_000,
  },
  {
    codigo: "HE-02",
    nombre: "Guadaña a motor",
    tipo: "Herramienta",
    ubicacion: "Bodega",
    estado: "Fuera de servicio",
    compra: ago(365 * 5),
    costo: 2_100_000,
    vidaAnios: 5,
    residual: 0,
  },
];

export interface Plan {
  codigo: string;
  tarea: string;
  cadaDias?: number;
  cadaHoras?: number;
  ultima: string;
  ultimasHoras?: number;
  costo: number;
}
export const MAINT_PLAN: Plan[] = [
  {
    codigo: "MQ-01",
    tarea: "Cambio de aceite y filtros",
    cadaHoras: 250,
    ultima: ago(40),
    ultimasHoras: 2900,
    costo: 620_000,
  },
  { codigo: "MQ-01", tarea: "Engrase general", cadaDias: 30, ultima: ago(34), costo: 60_000 },
  {
    codigo: "OR-01",
    tarea: "Cambio de pezoneras",
    cadaDias: 180,
    ultima: ago(170),
    costo: 480_000,
  },
  {
    codigo: "OR-01",
    tarea: "Revisión de pulsadores y vacío",
    cadaDias: 90,
    ultima: ago(95),
    costo: 250_000,
  },
  {
    codigo: "OR-02",
    tarea: "Revisión del compresor y gas",
    cadaDias: 180,
    ultima: ago(200),
    costo: 380_000,
  },
  {
    codigo: "HE-01",
    tarea: "Calibración de la báscula",
    cadaDias: 365,
    ultima: ago(350),
    costo: 220_000,
  },
  {
    codigo: "IN-02",
    tarea: "Revisión de voltaje de cercas",
    cadaDias: 15,
    ultima: ago(9),
    costo: 0,
  },
  {
    codigo: "VH-01",
    tarea: "Revisión técnico-mecánica y SOAT",
    cadaDias: 365,
    ultima: ago(300),
    costo: 1_150_000,
  },
];

export interface MaintLog {
  fecha: string;
  codigo: string;
  tipo: "Preventivo" | "Correctivo";
  trabajo: string;
  costo: number;
  proveedor: string;
}
export const MAINT_LOG: MaintLog[] = [
  {
    fecha: ago(4),
    codigo: "OR-02",
    tipo: "Correctivo",
    trabajo: "Cambio de compresor del tanque",
    costo: 1_450_000,
    proveedor: "Frío Andino",
  },
  {
    fecha: ago(9),
    codigo: "IN-02",
    tipo: "Preventivo",
    trabajo: "Revisión de voltaje: 6,2 kV",
    costo: 0,
    proveedor: "Interno",
  },
  {
    fecha: ago(34),
    codigo: "MQ-01",
    tipo: "Preventivo",
    trabajo: "Engrase general",
    costo: 60_000,
    proveedor: "Interno",
  },
  {
    fecha: ago(40),
    codigo: "MQ-01",
    tipo: "Preventivo",
    trabajo: "Cambio de aceite y filtros (2.900 h)",
    costo: 620_000,
    proveedor: "Agromotor",
  },
  {
    fecha: ago(95),
    codigo: "OR-01",
    tipo: "Preventivo",
    trabajo: "Revisión de pulsadores",
    costo: 250_000,
    proveedor: "DeLaval servicio",
  },
  {
    fecha: ago(120),
    codigo: "HE-02",
    tipo: "Correctivo",
    trabajo: "Diagnóstico de motor: no reparable",
    costo: 80_000,
    proveedor: "Taller El Cruce",
  },
];

export const FUEL = [
  { mes: "Jun", galones: 86, horas: 92 },
  { mes: "Jul", galones: 74, horas: 80 },
  { mes: "Ago", galones: 61, horas: 66 },
  { mes: "Sep", galones: 92, horas: 101 },
  { mes: "Oct", galones: 104, horas: 112 },
  { mes: "Nov", galones: 70, horas: 75 },
];

/* ───────────── Contabilidad ───────────── */

export interface Invoice {
  numero: string;
  fecha: string;
  cliente: string;
  concepto: string;
  base: number;
  iva: number;
  retencion: number;
  estado: "Aceptada DIAN" | "Pendiente" | "Rechazada";
  vence: string;
  pagada: boolean;
}
export const INVOICES: Invoice[] = [
  {
    numero: "FE-0482",
    fecha: ago(2),
    cliente: "Quesera La Esperanza",
    concepto: "Leche de búfala semana 43",
    base: 2_240_000,
    iva: 0,
    retencion: 33_600,
    estado: "Aceptada DIAN",
    vence: fut(6),
    pagada: false,
  },
  {
    numero: "FE-0481",
    fecha: ago(2),
    cliente: "Lácteos del Valle",
    concepto: "Leche bovina semana 43",
    base: 5_180_000,
    iva: 0,
    retencion: 77_700,
    estado: "Aceptada DIAN",
    vence: fut(13),
    pagada: false,
  },
  {
    numero: "FE-0480",
    fecha: ago(3),
    cliente: "Ganadería El Recreo",
    concepto: "Venta de bucerro BUF-011",
    base: 1_701_000,
    iva: 0,
    retencion: 25_515,
    estado: "Pendiente",
    vence: fut(27),
    pagada: false,
  },
  {
    numero: "FE-0476",
    fecha: ago(9),
    cliente: "Frigorífico Central",
    concepto: "Venta de 2 machos de levante",
    base: 5_648_800,
    iva: 0,
    retencion: 84_732,
    estado: "Aceptada DIAN",
    vence: fut(21),
    pagada: true,
  },
  {
    numero: "FE-0471",
    fecha: ago(16),
    cliente: "Lácteos del Valle",
    concepto: "Leche bovina semana 42",
    base: 4_960_000,
    iva: 0,
    retencion: 74_400,
    estado: "Aceptada DIAN",
    vence: ago(1),
    pagada: true,
  },
  {
    numero: "FE-0466",
    fecha: ago(20),
    cliente: "Quesera La Esperanza",
    concepto: "Leche de búfala semana 41",
    base: 2_090_000,
    iva: 0,
    retencion: 31_350,
    estado: "Aceptada DIAN",
    vence: ago(12),
    pagada: false,
  },
  {
    numero: "FE-0459",
    fecha: ago(25),
    cliente: "Particular",
    concepto: "Venta de estiércol compostado",
    base: 450_000,
    iva: 85_500,
    retencion: 0,
    estado: "Rechazada",
    vence: ago(5),
    pagada: false,
  },
];

export interface Payable {
  proveedor: string;
  nit: string;
  concepto: string;
  valor: number;
  vence: string;
  pagada: boolean;
}
export const PAYABLES: Payable[] = [
  {
    proveedor: "Agroinsumos del Sur",
    nit: "900.456.789-0",
    concepto: "Concentrado lechero 40 bultos",
    valor: 2_480_000,
    vence: fut(5),
    pagada: false,
  },
  {
    proveedor: "Veterinaria San José",
    nit: "830.222.111-5",
    concepto: "Medicamentos y CMT",
    valor: 312_000,
    vence: fut(12),
    pagada: false,
  },
  {
    proveedor: "Frío Andino",
    nit: "901.333.444-6",
    concepto: "Compresor del tanque",
    valor: 1_450_000,
    vence: ago(3),
    pagada: false,
  },
  {
    proveedor: "Electrificadora",
    nit: "890.000.111-1",
    concepto: "Energía sala de ordeño",
    valor: 486_000,
    vence: fut(2),
    pagada: false,
  },
  {
    proveedor: "Fertilizantes del Valle",
    nit: "900.888.777-3",
    concepto: "Urea y fósforo",
    valor: 1_320_000,
    vence: ago(18),
    pagada: true,
  },
];

export const OBLIGATIONS = [
  { obligacion: "Retención en la fuente (mensual)", fecha: fut(11), entidad: "DIAN" },
  { obligacion: "Planilla de seguridad social (PILA)", fecha: fut(6), entidad: "Operador PILA" },
  {
    obligacion: "Cuota de fomento ganadero y lechero",
    fecha: fut(9),
    entidad: "Fondo Nacional del Ganado",
  },
  { obligacion: "Pago de prima de servicios", fecha: fut(55), entidad: "Trabajadores" },
  { obligacion: "Consignación de cesantías", fecha: fut(98), entidad: "Fondo de cesantías" },
  {
    obligacion: "Declaración de renta",
    fecha: fut(250),
    entidad: "DIAN (según calendario del año)",
  },
];

/** Balance de prueba simplificado (PUC comercial), de ejemplo. */
export const LEDGER = [
  { cuenta: "1105", nombre: "Caja", debito: 1_250_000, credito: 0 },
  { cuenta: "1110", nombre: "Bancos", debito: 18_400_000, credito: 0 },
  { cuenta: "1305", nombre: "Clientes", debito: 13_211_000, credito: 0 },
  { cuenta: "1455", nombre: "Inventario de materiales (insumos)", debito: 6_820_000, credito: 0 },
  { cuenta: "1520", nombre: "Maquinaria y equipo", debito: 251_500_000, credito: 0 },
  { cuenta: "1592", nombre: "Depreciación acumulada", debito: 0, credito: 96_300_000 },
  { cuenta: "2205", nombre: "Proveedores", debito: 0, credito: 4_728_000 },
  { cuenta: "2365", nombre: "Retención en la fuente por pagar", debito: 0, credito: 320_000 },
  { cuenta: "2505", nombre: "Salarios por pagar", debito: 0, credito: 2_650_000 },
  { cuenta: "3105", nombre: "Capital", debito: 0, credito: 160_000_000 },
  { cuenta: "4105", nombre: "Ingresos: ganadería", debito: 0, credito: 54_960_000 },
  { cuenta: "6105", nombre: "Costo de producción", debito: 22_480_000, credito: 0 },
  { cuenta: "5105", nombre: "Gastos de personal", debito: 5_297_000, credito: 0 },
];
