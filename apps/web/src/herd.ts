import { addDays, ago, daysBetween, daysFromNow, iso, today } from "./kit";

/**
 * Hato y reglas de dominio del prototipo. Los parámetros son valores de referencia
 * para bovinos y búfalos de leche en el trópico; el veterinario de la finca debe ajustarlos.
 */

export type Species = "bovino" | "bufalino";

export interface SpeciesParams {
  label: string;
  gestacion: number;
  pubertadMeses: number;
  primerPartoMeses: number;
  ciclo: number;
  esperaVoluntaria: number;
  diasAbiertosMeta: number;
  iepMeta: number;
  secarAntes: number;
  lactanciaDias: number;
  dxDesde: number;
  dxHasta: number;
}

export const PARAMS: Record<Species, SpeciesParams> = {
  bovino: {
    label: "Bovino",
    gestacion: 283,
    pubertadMeses: 15,
    primerPartoMeses: 30,
    ciclo: 21,
    esperaVoluntaria: 50,
    diasAbiertosMeta: 110,
    iepMeta: 395,
    secarAntes: 60,
    lactanciaDias: 305,
    dxDesde: 30,
    dxHasta: 45,
  },
  bufalino: {
    label: "Bufalino",
    gestacion: 315,
    pubertadMeses: 21,
    primerPartoMeses: 40,
    ciclo: 21,
    esperaVoluntaria: 60,
    diasAbiertosMeta: 150,
    iepMeta: 450,
    secarAntes: 60,
    lactanciaDias: 270,
    dxDesde: 35,
    dxHasta: 60,
  },
};

export interface Animal {
  tag: string;
  species: Species;
  sex: "hembra" | "macho";
  cat: string;
  born: number;
  lot: string;
  breed: string;
  weight: number;
  milk: number;
}

const A = (
  tag: string,
  species: Species,
  sex: "hembra" | "macho",
  cat: string,
  bornDaysAgo: number,
  lot: string,
  breed: string,
  weight: number,
  milk = 0,
): Animal => ({ tag, species, sex, cat, born: bornDaysAgo, lot, breed, weight, milk });

const y = 365;
export const HERD: Animal[] = [
  A("BOV-001", "bovino", "hembra", "Vaca", 5 * y, "Ordeño", "Holstein", 560, 22.4),
  A("BOV-002", "bovino", "hembra", "Vaca", 4 * y + 120, "Ordeño", "Holstein", 540, 26.1),
  A("BOV-003", "bovino", "hembra", "Vaca", 4 * y, "Ordeño", "Girolando", 510, 19.8),
  A("BOV-004", "bovino", "hembra", "Vaca", 6 * y, "Ordeño", "Jersey", 430, 17.6),
  A("BOV-005", "bovino", "hembra", "Vaca", 5 * y + 90, "Ordeño", "Holstein", 575, 12.3),
  A("BOV-006", "bovino", "hembra", "Vaca", 7 * y, "Ordeño", "Normando", 520, 9.2),
  A("BOV-007", "bovino", "hembra", "Vaca", 3 * y + 200, "Ordeño", "Girolando", 495, 24.2),
  A("BOV-008", "bovino", "hembra", "Vaca", 6 * y + 60, "Secas", "Holstein", 590, 0),
  A("BOV-009", "bovino", "hembra", "Vaca", 4 * y + 40, "Ordeño", "Gyr lechero", 470, 15.4),
  A("BOV-010", "bovino", "hembra", "Vaca", 3 * y + 300, "Ordeño", "Girolando", 500, 18.7),
  A("BOV-015", "bovino", "hembra", "Novilla", 20 * 30, "Levante", "Girolando", 370, 0),
  A("BOV-016", "bovino", "hembra", "Novilla", 18 * 30, "Levante", "Holstein", 345, 0),
  A("BOV-017", "bovino", "hembra", "Novilla", 15 * 30, "Levante", "Jersey", 270, 0),
  A(
    "BOV-020",
    "bovino",
    "macho",
    "Macho de levante",
    11 * 30,
    "Levante",
    "Brahman x Holstein",
    290,
    0,
  ),
  A(
    "BOV-021",
    "bovino",
    "macho",
    "Macho de levante",
    10 * 30,
    "Levante",
    "Brahman x Holstein",
    268,
    0,
  ),
  A("BOV-022", "bovino", "macho", "Macho de levante", 8 * 30, "Levante", "Gyr", 221, 0),
  A("BOV-031", "bovino", "hembra", "Ternera", 10, "Crías", "Girolando", 41, 0),
  A("BOV-032", "bovino", "macho", "Ternero", 52, "Crías", "Holstein", 66, 0),
  A("TORO-02", "bovino", "macho", "Reproductor", 4 * y, "Reproductores", "Gyr", 820, 0),
  A("BUF-001", "bufalino", "hembra", "Búfala", 6 * y, "Búfalas", "Murrah", 610, 7.6),
  A("BUF-002", "bufalino", "hembra", "Búfala", 5 * y + 80, "Búfalas", "Mediterránea", 640, 8.3),
  A("BUF-003", "bufalino", "hembra", "Búfala", 7 * y, "Búfalas", "Murrah", 620, 5.1),
  A("BUF-004", "bufalino", "hembra", "Búfala", 8 * y, "Búfalas", "Jaffarabadi", 660, 4.2),
  A("BUF-005", "bufalino", "hembra", "Búfala", 5 * y, "Búfalas", "Murrah", 600, 6.9),
  A("BUF-006", "bufalino", "hembra", "Novilla", 26 * 30, "Levante", "Mediterránea", 430, 0),
  A("BUF-009", "bufalino", "macho", "Cría", 33, "Crías", "Murrah", 62, 0),
  A("BUF-TORO-01", "bufalino", "macho", "Reproductor", 6 * y, "Reproductores", "Murrah", 880, 0),
];

export const animalOf = (tag: string) => HERD.find((a) => a.tag === tag);
export const speciesOf = (tag: string): Species =>
  animalOf(tag)?.species ?? (tag.startsWith("BUF") ? "bufalino" : "bovino");
export const ageMonths = (a: Animal) => Math.floor(a.born / 30.4);

/* ───────────── Reproducción ───────────── */

export type RepType = "servicio" | "dx" | "parto" | "celo" | "aborto" | "secado";
export interface RepEvent {
  tipo: RepType;
  tag: string;
  fecha: string;
  via?: string;
  macho?: string;
  resultado?: string;
  cria?: string;
  sexo?: string;
  peso?: string;
  obs?: string;
}

const E = (tipo: RepType, tag: string, d: number, extra: Partial<RepEvent> = {}): RepEvent => ({
  tipo,
  tag,
  fecha: ago(d),
  ...extra,
});

export const REP_SEED: RepEvent[] = [
  E("parto", "BOV-001", 210, { cria: "BOV-018", sexo: "Hembra", peso: "36" }),
  E("servicio", "BOV-001", 95, { via: "IA", macho: "HOL-221" }),
  E("dx", "BOV-001", 60, { resultado: "Preñada", obs: "Ecografía, 34 días" }),
  E("parto", "BOV-002", 40, { cria: "BOV-032", sexo: "Macho", peso: "39" }),
  E("parto", "BOV-003", 75, { cria: "BOV-033", sexo: "Hembra", peso: "35" }),
  E("celo", "BOV-003", 20, { obs: "Mucosidad y monta" }),
  E("servicio", "BOV-003", 12, { via: "IA", macho: "GIR-310" }),
  E("parto", "BOV-004", 150, { cria: "BOV-034", sexo: "Hembra", peso: "30" }),
  E("servicio", "BOV-004", 100, { via: "IA", macho: "JER-118" }),
  E("dx", "BOV-004", 55, { resultado: "Vacía" }),
  E("servicio", "BOV-004", 33, { via: "Monta", macho: "TORO-02" }),
  E("parto", "BOV-005", 300, { cria: "BOV-035", sexo: "Macho", peso: "42" }),
  E("servicio", "BOV-005", 210, { via: "IA", macho: "HOL-221" }),
  E("dx", "BOV-005", 170, { resultado: "Preñada", obs: "Palpación" }),
  E("parto", "BOV-006", 380, { cria: "BOV-036", sexo: "Hembra", peso: "33" }),
  E("parto", "BOV-007", 10, { cria: "BOV-031", sexo: "Hembra", peso: "41" }),
  E("parto", "BOV-008", 330, { cria: "BOV-037", sexo: "Macho", peso: "40" }),
  E("servicio", "BOV-008", 250, { via: "IA", macho: "HOL-221" }),
  E("dx", "BOV-008", 205, { resultado: "Preñada" }),
  E("secado", "BOV-008", 25),
  E("parto", "BOV-009", 120, { cria: "BOV-038", sexo: "Hembra", peso: "34" }),
  E("servicio", "BOV-009", 70, { via: "Monta", macho: "TORO-02" }),
  E("dx", "BOV-009", 30, { resultado: "Preñada", obs: "Palpación, 40 días" }),
  E("parto", "BOV-010", 95, { cria: "BOV-039", sexo: "Macho", peso: "37" }),
  E("servicio", "BOV-010", 45, { via: "IA", macho: "GIR-310" }),
  E("parto", "BUF-001", 180, { cria: "BUF-007", sexo: "Hembra", peso: "36" }),
  E("servicio", "BUF-001", 100, { via: "Monta", macho: "BUF-TORO-01" }),
  E("dx", "BUF-001", 55, { resultado: "Preñada", obs: "Ecografía, 45 días" }),
  E("parto", "BUF-002", 33, { cria: "BUF-009", sexo: "Macho", peso: "38" }),
  E("parto", "BUF-003", 260, { cria: "BUF-008", sexo: "Hembra", peso: "35" }),
  E("servicio", "BUF-003", 190, { via: "Monta", macho: "BUF-TORO-01" }),
  E("dx", "BUF-003", 150, { resultado: "Preñada", obs: "Ecografía" }),
  E("parto", "BUF-004", 400, { cria: "BUF-006b", sexo: "Macho", peso: "37" }),
  E("parto", "BUF-005", 110, { cria: "BUF-010", sexo: "Hembra", peso: "34" }),
  E("servicio", "BUF-005", 60, {
    via: "Monta",
    macho: "BUF-TORO-01",
    obs: "Celo silencioso, servicio por calendario",
  }),
];

export type RepStatus =
  | "Gestante"
  | "Servida"
  | "Vacía"
  | "En espera"
  | "Seca gestante"
  | "Novilla"
  | "Parto reciente";

export interface RepState {
  animal: Animal;
  p: SpeciesParams;
  status: RepStatus;
  parto: string | null;
  del: number | null;
  servicio: string | null;
  macho: string | null;
  fpp: string | null;
  diasGestacion: number | null;
  diasAbiertos: number | null;
  servicios: number;
  dxPendiente: boolean;
  dxAtrasado: boolean;
  seca: boolean;
  estimaCelo: string | null;
}

export function repState(a: Animal, events: RepEvent[]): RepState {
  const p = PARAMS[a.species];
  const ev = events.filter((e) => e.tag === a.tag).sort((x, y2) => (x.fecha < y2.fecha ? -1 : 1));
  const last = (t: RepType) => [...ev].reverse().find((e) => e.tipo === t);
  const parto = last("parto");
  const sinceParto = ev.filter((e) => !parto || e.fecha >= parto.fecha);
  const serv = [...sinceParto].reverse().find((e) => e.tipo === "servicio");
  const dx = serv
    ? [...sinceParto].reverse().find((e) => e.tipo === "dx" && e.fecha >= serv.fecha)
    : undefined;
  const aborto = [...sinceParto]
    .reverse()
    .find((e) => e.tipo === "aborto" && (!serv || e.fecha >= serv.fecha));
  const prenada = Boolean(serv && dx?.resultado === "Preñada" && !aborto);
  const secado = last("secado");
  const seca = Boolean(prenada && secado && (!parto || secado.fecha > parto.fecha));
  const servSince = serv ? daysBetween(serv.fecha, iso(today())) : null;
  const del = parto ? daysBetween(parto.fecha, iso(today())) : null;
  const fpp = prenada && serv ? addDays(serv.fecha, p.gestacion) : null;
  let status: RepStatus;
  if (!parto && a.cat === "Novilla") status = "Novilla";
  else if (seca) status = "Seca gestante";
  else if (prenada) status = "Gestante";
  else if (serv && !dx) status = "Servida";
  else if (del !== null && del <= 14) status = "Parto reciente";
  else if (del !== null && del < p.esperaVoluntaria && !serv) status = "En espera";
  else status = "Vacía";
  const abiertos =
    del === null
      ? null
      : serv && prenada
        ? daysBetween(parto?.fecha ?? serv.fecha, serv.fecha)
        : del;
  const nServ = ev.filter(
    (e) => e.tipo === "servicio" && (!parto || e.fecha >= parto.fecha),
  ).length;
  const dxPend = Boolean(serv && !dx && servSince !== null && servSince >= p.dxDesde - 10);
  return {
    animal: a,
    p,
    status,
    parto: parto?.fecha ?? null,
    del,
    servicio: serv?.fecha ?? null,
    macho: serv?.macho ?? null,
    fpp,
    diasGestacion: prenada && serv ? daysBetween(serv.fecha, iso(today())) : null,
    diasAbiertos: abiertos,
    servicios: nServ,
    dxPendiente: dxPend,
    dxAtrasado: Boolean(serv && !dx && servSince !== null && servSince > p.dxHasta),
    seca,
    estimaCelo: serv && !dx ? addDays(serv.fecha, p.ciclo) : null,
  };
}

export const FEMALES = HERD.filter(
  (a) => a.sex === "hembra" && a.born > 400 && a.cat !== "Cría" && a.cat !== "Ternera",
);

/** Calcula fecha probable de parto y hitos a partir de la fecha del servicio. */
export function milestones(species: Species, servicio: string) {
  const p = PARAMS[species];
  return {
    dx: addDays(servicio, p.dxDesde),
    celoSiVacia: addDays(servicio, p.ciclo),
    secado: addDays(servicio, p.gestacion - p.secarAntes),
    preparto: addDays(servicio, p.gestacion - 21),
    fpp: addDays(servicio, p.gestacion),
  };
}

/* ───────────── Sanidad ───────────── */

export interface Product {
  name: string;
  tipo:
    | "Vacuna"
    | "Antibiótico"
    | "Antiparasitario"
    | "Antiinflamatorio"
    | "Hormonal"
    | "Suplemento";
  retiroLeche: number;
  retiroCarne: number;
  dosis: string;
}
/** Retiros de referencia. Siempre prevalece el prospecto del producto y el criterio del veterinario. */
export const PRODUCTS: Product[] = [
  { name: "Vacuna antiaftosa", tipo: "Vacuna", retiroLeche: 0, retiroCarne: 0, dosis: "2 mL SC" },
  {
    name: "Vacuna brucelosis RB51",
    tipo: "Vacuna",
    retiroLeche: 0,
    retiroCarne: 0,
    dosis: "2 mL SC (terneras 3 a 8 meses)",
  },
  { name: "Vacuna rabia", tipo: "Vacuna", retiroLeche: 0, retiroCarne: 0, dosis: "2 mL SC" },
  {
    name: "Vacuna clostridiales (carbón y edema)",
    tipo: "Vacuna",
    retiroLeche: 0,
    retiroCarne: 21,
    dosis: "5 mL SC",
  },
  {
    name: "Vacuna IBR-DVB-Leptospira",
    tipo: "Vacuna",
    retiroLeche: 0,
    retiroCarne: 21,
    dosis: "2 mL IM",
  },
  {
    name: "Ivermectina 1 %",
    tipo: "Antiparasitario",
    retiroLeche: 28,
    retiroCarne: 35,
    dosis: "1 mL por 50 kg SC",
  },
  {
    name: "Albendazol 10 %",
    tipo: "Antiparasitario",
    retiroLeche: 3,
    retiroCarne: 14,
    dosis: "1 mL por 20 kg VO",
  },
  {
    name: "Oxitetraciclina larga acción",
    tipo: "Antibiótico",
    retiroLeche: 7,
    retiroCarne: 28,
    dosis: "1 mL por 10 kg IM",
  },
  {
    name: "Penicilina + estreptomicina",
    tipo: "Antibiótico",
    retiroLeche: 3,
    retiroCarne: 14,
    dosis: "1 mL por 25 kg IM",
  },
  {
    name: "Ceftiofur",
    tipo: "Antibiótico",
    retiroLeche: 0,
    retiroCarne: 4,
    dosis: "1 mL por 45 kg IM",
  },
  {
    name: "Antibiótico intramamario (secado)",
    tipo: "Antibiótico",
    retiroLeche: 42,
    retiroCarne: 28,
    dosis: "1 jeringa por cuarto",
  },
  {
    name: "Flunixin meglumina",
    tipo: "Antiinflamatorio",
    retiroLeche: 2,
    retiroCarne: 10,
    dosis: "2 mL por 45 kg IV",
  },
  {
    name: "Prostaglandina (cloprostenol)",
    tipo: "Hormonal",
    retiroLeche: 0,
    retiroCarne: 1,
    dosis: "2 mL IM",
  },
  {
    name: "Calcio borogluconato",
    tipo: "Suplemento",
    retiroLeche: 0,
    retiroCarne: 0,
    dosis: "500 mL IV lento",
  },
];
export const productOf = (n: string) => PRODUCTS.find((p) => p.name === n);

export interface HealthEvent {
  tipo: "Vacunación" | "Tratamiento" | "Desparasitación" | "Diagnóstico" | "Control";
  sujeto: string;
  fecha: string;
  producto: string;
  motivo: string;
  dosis?: string;
  responsable: string;
  costo: number;
  retiroLeche: number;
  retiroCarne: number;
}
const H = (
  tipo: HealthEvent["tipo"],
  sujeto: string,
  d: number,
  producto: string,
  motivo: string,
  costo: number,
  extra: Partial<HealthEvent> = {},
): HealthEvent => {
  const pr = productOf(producto);
  return {
    tipo,
    sujeto,
    fecha: ago(d),
    producto,
    motivo,
    responsable: "Dra. Marcela Ruiz",
    costo,
    retiroLeche: pr?.retiroLeche ?? 0,
    retiroCarne: pr?.retiroCarne ?? 0,
    ...extra,
  };
};
export const HEALTH_SEED: HealthEvent[] = [
  H("Vacunación", "Todo el hato", 3, "Vacuna antiaftosa", "Ciclo ICA", 310000),
  H("Tratamiento", "BOV-012", 4, "Oxitetraciclina larga acción", "Cojera, pododermatitis", 38000, {
    sujeto: "BOV-006",
    motivo: "Pododermatitis",
  }),
  H(
    "Tratamiento",
    "BUF-005",
    9,
    "Penicilina + estreptomicina",
    "Mastitis clínica cuarto posterior izquierdo",
    42000,
  ),
  H("Desparasitación", "Levante", 14, "Ivermectina 1 %", "Control de parásitos, OPG alto", 96000),
  H("Vacunación", "Terneras 3-8 meses", 22, "Vacuna brucelosis RB51", "Obligatoria ICA", 68000),
  H("Vacunación", "Hembras en servicio", 35, "Vacuna IBR-DVB-Leptospira", "Pre-servicio", 175000),
  H("Tratamiento", "BOV-007", 8, "Calcio borogluconato", "Hipocalcemia posparto", 54000),
  H("Control", "Lote de ordeño", 6, "Vacuna rabia", "Revisión de ubres y pezones", 0, {
    tipo: "Control",
    producto: "Vacuna rabia",
    retiroLeche: 0,
    retiroCarne: 0,
  }),
  H("Vacunación", "Todo el hato", 190, "Vacuna antiaftosa", "Ciclo ICA anterior", 295000),
  H(
    "Vacunación",
    "Todo el hato",
    160,
    "Vacuna clostridiales (carbón y edema)",
    "Refuerzo anual",
    240000,
  ),
  H("Vacunación", "Todo el hato", 120, "Vacuna rabia", "Zona de riesgo", 150000),
];

export const VACCINES: {
  name: string;
  product: string;
  intervalo: number;
  aplica: string;
  nota: string;
  species: Species[];
}[] = [
  {
    name: "Fiebre aftosa",
    product: "Vacuna antiaftosa",
    intervalo: 190,
    aplica: "Todos los bovinos y bufalinos",
    nota: "Ciclos del ICA, dos por año",
    species: ["bovino", "bufalino"],
  },
  {
    name: "Brucelosis",
    product: "Vacuna brucelosis RB51",
    intervalo: 9999,
    aplica: "Hembras de 3 a 8 meses",
    nota: "Una sola vez; marca indeleble",
    species: ["bovino", "bufalino"],
  },
  {
    name: "Rabia de origen silvestre",
    product: "Vacuna rabia",
    intervalo: 365,
    aplica: "Todo el hato en zona de riesgo",
    nota: "Vacuna bivalente en el ciclo",
    species: ["bovino", "bufalino"],
  },
  {
    name: "Clostridiales (carbón, edema)",
    product: "Vacuna clostridiales (carbón y edema)",
    intervalo: 365,
    aplica: "Todo el hato",
    nota: "Primovacunación desde los 3 meses",
    species: ["bovino", "bufalino"],
  },
  {
    name: "IBR · DVB · Leptospira",
    product: "Vacuna IBR-DVB-Leptospira",
    intervalo: 365,
    aplica: "Hembras antes del servicio",
    nota: "Refuerzo anual",
    species: ["bovino", "bufalino"],
  },
];

export function retiroActivo(e: HealthEvent) {
  const l = e.retiroLeche > 0 ? addDays(e.fecha, e.retiroLeche) : null;
  const c = e.retiroCarne > 0 ? addDays(e.fecha, e.retiroCarne) : null;
  return {
    leche: l && daysFromNow(l) >= 0 ? l : null,
    carne: c && daysFromNow(c) >= 0 ? c : null,
  };
}

export interface CmtRec {
  fecha: string;
  tag: string;
  AI: number;
  AD: number;
  PI: number;
  PD: number;
}
export const CMT_LEVELS = ["N", "T", "1", "2", "3"];
export const CMT_SEED: CmtRec[] = [
  { fecha: ago(6), tag: "BOV-001", AI: 0, AD: 0, PI: 1, PD: 0 },
  { fecha: ago(6), tag: "BOV-002", AI: 0, AD: 0, PI: 0, PD: 0 },
  { fecha: ago(6), tag: "BOV-003", AI: 1, AD: 0, PI: 0, PD: 0 },
  { fecha: ago(6), tag: "BOV-004", AI: 0, AD: 4, PI: 0, PD: 0 },
  { fecha: ago(6), tag: "BOV-007", AI: 0, AD: 0, PI: 0, PD: 0 },
  { fecha: ago(6), tag: "BOV-010", AI: 0, AD: 1, PI: 1, PD: 0 },
  { fecha: ago(6), tag: "BUF-001", AI: 0, AD: 0, PI: 0, PD: 0 },
  { fecha: ago(6), tag: "BUF-002", AI: 0, AD: 0, PI: 1, PD: 0 },
  { fecha: ago(6), tag: "BUF-005", AI: 0, AD: 0, PI: 3, PD: 0 },
];

export const BOTIQUIN = [
  {
    item: "Oxitetraciclina larga acción 100 mL",
    lote: "OX-2306",
    vence: addDays(iso(today()), 210),
    cant: 6,
    min: 4,
  },
  {
    item: "Ivermectina 1 % 500 mL",
    lote: "IV-2211",
    vence: addDays(iso(today()), 80),
    cant: 2,
    min: 2,
  },
  {
    item: "Penicilina + estreptomicina 100 mL",
    lote: "PE-2402",
    vence: addDays(iso(today()), 340),
    cant: 3,
    min: 3,
  },
  {
    item: "Calcio borogluconato 500 mL",
    lote: "CA-2309",
    vence: addDays(iso(today()), 25),
    cant: 4,
    min: 2,
  },
  {
    item: "Antibiótico intramamario de secado",
    lote: "SE-2401",
    vence: addDays(iso(today()), 150),
    cant: 8,
    min: 12,
  },
  {
    item: "Vacuna antiaftosa (dosis)",
    lote: "AF-2410",
    vence: addDays(iso(today()), 45),
    cant: 12,
    min: 40,
  },
  {
    item: "Reactivo CMT 500 mL",
    lote: "CM-2312",
    vence: addDays(iso(today()), 300),
    cant: 1,
    min: 1,
  },
];

/* ───────────── Producción ───────────── */

const rnd = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export const LACTATING = HERD.filter((a) => a.milk > 0);

export interface MilkDay {
  fecha: string;
  litros: Record<string, number>;
}
/** Ordeño diario por animal de los últimos 21 días, determinista. */
export function milkHistory(): MilkDay[] {
  return Array.from({ length: 21 }, (_, i) => {
    const d = 20 - i;
    const litros: Record<string, number> = {};
    LACTATING.forEach((a, k) => {
      const v = a.milk * (0.94 + rnd(d * 31 + k) * 0.12) * (1 + (20 - d) * 0.002);
      litros[a.tag] = Math.round(v * 10) / 10;
    });
    return { fecha: ago(d), litros };
  });
}

export const LACT_CURVE = {
  bovino: [24, 28, 27, 25, 23, 21, 19, 17, 15, 13],
  bufalino: [7, 8.4, 8.1, 7.6, 7, 6.3, 5.6, 4.8, 3.9, 3],
};

export const QUALITY_SEED = [
  {
    fecha: ago(2),
    muestra: "Tanque bovinos",
    especie: "bovino",
    grasa: 3.9,
    proteina: 3.2,
    ccs: 180,
    ufc: 45,
    temp: 3.8,
  },
  {
    fecha: ago(2),
    muestra: "Tanque búfalas",
    especie: "bufalino",
    grasa: 7.8,
    proteina: 4.4,
    ccs: 150,
    ufc: 38,
    temp: 3.9,
  },
  {
    fecha: ago(9),
    muestra: "Tanque bovinos",
    especie: "bovino",
    grasa: 3.8,
    proteina: 3.3,
    ccs: 210,
    ufc: 62,
    temp: 4.1,
  },
  {
    fecha: ago(9),
    muestra: "Tanque búfalas",
    especie: "bufalino",
    grasa: 8.1,
    proteina: 4.5,
    ccs: 135,
    ufc: 41,
    temp: 3.7,
  },
  {
    fecha: ago(16),
    muestra: "Tanque bovinos",
    especie: "bovino",
    grasa: 4.0,
    proteina: 3.1,
    ccs: 165,
    ufc: 55,
    temp: 4.0,
  },
  {
    fecha: ago(16),
    muestra: "Tanque búfalas",
    especie: "bufalino",
    grasa: 7.6,
    proteina: 4.3,
    ccs: 160,
    ufc: 47,
    temp: 4.2,
  },
];

export const GROWTH_REF = {
  months: [0, 3, 6, 9, 12, 15, 18, 24],
  bovino: [38, 100, 175, 240, 305, 370, 430, 520],
  bufalino: [35, 90, 150, 205, 260, 315, 370, 440],
};

/* ───────────── Pasturas ───────────── */

export interface Forage {
  name: string;
  descansoMin: number;
  descansoMax: number;
  ocupacion: number;
  residuo: number;
}
export const FORAGES: Forage[] = [
  { name: "Brachiaria brizantha", descansoMin: 30, descansoMax: 35, ocupacion: 4, residuo: 1800 },
  { name: "Mombasa (Megathyrsus)", descansoMin: 35, descansoMax: 42, ocupacion: 3, residuo: 2200 },
  { name: "Estrella (Cynodon)", descansoMin: 28, descansoMax: 35, ocupacion: 3, residuo: 1500 },
  { name: "Pasto elefante", descansoMin: 45, descansoMax: 60, ocupacion: 2, residuo: 2500 },
  { name: "Brachiaria humidicola", descansoMin: 35, descansoMax: 42, ocupacion: 5, residuo: 1500 },
];
export const forageOf = (n: string) => FORAGES.find((f) => f.name === n) ?? (FORAGES[0] as Forage);

export interface Paddock {
  id: string;
  nombre: string;
  area: number;
  forraje: string;
  lote: string | null;
  entrada: number | null;
  salida: number | null;
  aforo: number;
  aforoHace: number;
  agua: boolean;
  suelo: "Plano" | "Ondulado" | "Bajo inundable";
}
export const PADDOCKS: Paddock[] = [
  {
    id: "P1",
    nombre: "La Loma 1",
    area: 3.5,
    forraje: "Mombasa (Megathyrsus)",
    lote: "Ordeño",
    entrada: 2,
    salida: null,
    aforo: 3400,
    aforoHace: 4,
    agua: true,
    suelo: "Ondulado",
  },
  {
    id: "P2",
    nombre: "La Loma 2",
    area: 3.5,
    forraje: "Mombasa (Megathyrsus)",
    lote: null,
    entrada: null,
    salida: 12,
    aforo: 3100,
    aforoHace: 3,
    agua: true,
    suelo: "Ondulado",
  },
  {
    id: "P3",
    nombre: "La Loma 3",
    area: 3.5,
    forraje: "Mombasa (Megathyrsus)",
    lote: null,
    entrada: null,
    salida: 29,
    aforo: 3900,
    aforoHace: 3,
    agua: true,
    suelo: "Ondulado",
  },
  {
    id: "P4",
    nombre: "Potrero Sur",
    area: 8.5,
    forraje: "Brachiaria brizantha",
    lote: "Levante",
    entrada: 3,
    salida: null,
    aforo: 2400,
    aforoHace: 5,
    agua: true,
    suelo: "Plano",
  },
  {
    id: "P5",
    nombre: "Potrero Norte",
    area: 6,
    forraje: "Estrella (Cynodon)",
    lote: null,
    entrada: null,
    salida: 21,
    aforo: 1900,
    aforoHace: 9,
    agua: false,
    suelo: "Plano",
  },
  {
    id: "P6",
    nombre: "El Bajo 1",
    area: 5.5,
    forraje: "Brachiaria humidicola",
    lote: "Búfalas",
    entrada: 1,
    salida: null,
    aforo: 2900,
    aforoHace: 6,
    agua: true,
    suelo: "Bajo inundable",
  },
  {
    id: "P7",
    nombre: "El Bajo 2",
    area: 5.5,
    forraje: "Brachiaria humidicola",
    lote: null,
    entrada: null,
    salida: 38,
    aforo: 3300,
    aforoHace: 6,
    agua: true,
    suelo: "Bajo inundable",
  },
  {
    id: "P8",
    nombre: "Banco de forraje",
    area: 1.5,
    forraje: "Pasto elefante",
    lote: null,
    entrada: null,
    salida: 15,
    aforo: 5200,
    aforoHace: 12,
    agua: false,
    suelo: "Plano",
  },
];

export const CONSUMO_MS = 0.025;
export const UGG = 450;
export const lotStats = (lot: string) => {
  const an = HERD.filter((a) => a.lot === lot);
  const ugg = an.reduce((s, a) => s + a.weight / UGG, 0);
  return { n: an.length, ugg, demandaDia: ugg * UGG * CONSUMO_MS };
};

export const RAIN = {
  labels: ["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
  mm: [180, 95, 70, 160, 240, 210],
  hist: [170, 120, 100, 170, 230, 190],
};

/* ───────────── Economía ───────────── */

export interface Mov {
  fecha: string;
  tipo: "Ingreso" | "Egreso";
  categoria: string;
  descripcion: string;
  valor: number;
  actividad: "Leche" | "Cría y levante" | "General";
  soporte: string;
}
const M = (
  d: number,
  tipo: Mov["tipo"],
  categoria: string,
  descripcion: string,
  valor: number,
  actividad: Mov["actividad"],
  soporte = "—",
): Mov => ({
  fecha: ago(d),
  tipo,
  categoria,
  descripcion,
  valor,
  actividad,
  soporte,
});
export const MOV_SEED: Mov[] = [
  M(
    2,
    "Ingreso",
    "Leche bovina",
    "Planta Lácteos del Valle · semana 43",
    5_180_000,
    "Leche",
    "Factura FE-0481",
  ),
  M(
    2,
    "Ingreso",
    "Leche de búfala",
    "Quesera La Esperanza · semana 43",
    2_240_000,
    "Leche",
    "Factura FE-0482",
  ),
  M(
    4,
    "Egreso",
    "Alimentación",
    "Concentrado lechero 40 bultos",
    2_480_000,
    "Leche",
    "Remisión 3321",
  ),
  M(6, "Egreso", "Mano de obra", "Jornales de la quincena", 2_650_000, "General", "Nómina Q20"),
  M(8, "Egreso", "Sanidad", "Calcio, antibióticos y CMT", 312_000, "Leche", "Factura V-882"),
  M(
    9,
    "Ingreso",
    "Ganado",
    "Venta de 2 machos de levante",
    5_600_000,
    "Cría y levante",
    "Guía de movilización 77",
  ),
  M(11, "Egreso", "Sanidad", "Vacuna antiaftosa (ciclo ICA)", 310_000, "General", "Factura V-871"),
  M(
    12,
    "Egreso",
    "Energía y agua",
    "Recibo de energía sala de ordeño",
    486_000,
    "Leche",
    "Recibo 5532",
  ),
  M(
    16,
    "Ingreso",
    "Leche bovina",
    "Planta Lácteos del Valle · semana 42",
    4_960_000,
    "Leche",
    "Factura FE-0470",
  ),
  M(
    17,
    "Egreso",
    "Reproducción",
    "Pajillas y nitrógeno líquido",
    560_000,
    "Leche",
    "Factura R-204",
  ),
  M(
    21,
    "Egreso",
    "Pasturas",
    "Fertilización potreros La Loma",
    1_320_000,
    "General",
    "Factura F-118",
  ),
  M(24, "Egreso", "Mano de obra", "Jornales de la quincena", 2_650_000, "General", "Nómina Q19"),
  M(
    28,
    "Ingreso",
    "Leche de búfala",
    "Quesera La Esperanza · semana 41",
    2_090_000,
    "Leche",
    "Factura FE-0461",
  ),
  M(33, "Egreso", "Alimentación", "Sal mineralizada y melaza", 940_000, "General", "Remisión 3290"),
  M(
    40,
    "Egreso",
    "Mantenimiento",
    "Cercas eléctricas y bebederos",
    720_000,
    "General",
    "Factura M-55",
  ),
  M(55, "Ingreso", "Ganado", "Venta de vaca de descarte", 3_100_000, "Cría y levante", "Guía 71"),
  M(
    70,
    "Egreso",
    "Alimentación",
    "Concentrado lechero 40 bultos",
    2_410_000,
    "Leche",
    "Remisión 3188",
  ),
  M(
    85,
    "Ingreso",
    "Leche bovina",
    "Planta Lácteos del Valle · mes",
    19_800_000,
    "Leche",
    "Factura FE-0402",
  ),
];

export const BUDGET = [
  { rubro: "Alimentación", presupuesto: 12_000_000 },
  { rubro: "Mano de obra", presupuesto: 10_600_000 },
  { rubro: "Sanidad", presupuesto: 2_400_000 },
  { rubro: "Reproducción", presupuesto: 1_200_000 },
  { rubro: "Pasturas", presupuesto: 3_000_000 },
  { rubro: "Energía y agua", presupuesto: 1_600_000 },
  { rubro: "Mantenimiento", presupuesto: 1_800_000 },
];
