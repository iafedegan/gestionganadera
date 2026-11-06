/**
 * Datos para los trámites del ICA al exportar bovinos y bufalinos en pie. La aplicación solo los
 * prepara: la solicitud, el CSO y el CZE se presentan en los sistemas del ICA (SISPAP) o por correo.
 */

export const ICA_QUARANTINE_EMAIL = "cuarentena.animal@ica.gov.co";
/** La solicitud va mínimo 40 días antes del embarque; la cuarentena dura mínimo 30. */
export const REQUEST_DAYS_BEFORE = 40;
export const QUARANTINE_DAYS_BEFORE = 30;

export type ExportUse = "reproduccion" | "sacrificio" | "lidia";
export const EXPORT_USE_LABEL: Record<ExportUse, string> = {
  reproduccion: "Reproducción",
  sacrificio: "Sacrificio",
  lidia: "Lidia",
};

export interface ExportAnimal {
  tag: string;
  species: string;
  sex: string;
  category: string;
  birthDate: string | null;
  farmId: string;
}

export interface PredioInfo {
  farmId: string;
  name: string;
  departamento: string;
  municipio: string;
  vereda: string;
  propietario: string;
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Fechas límite según el día planeado del embarque. */
export function embarkDeadlines(embarque: string) {
  return {
    solicitud: shift(embarque, -REQUEST_DAYS_BEFORE),
    cuarentena: shift(embarque, -QUARANTINE_DAYS_BEFORE),
  };
}

export function ageMonths(birthDate: string, today: string): number {
  const b = new Date(`${birthDate}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  let m = (t.getUTCFullYear() - b.getUTCFullYear()) * 12 + (t.getUTCMonth() - b.getUTCMonth());
  if (t.getUTCDate() < b.getUTCDate()) m--;
  return Math.max(0, m);
}

export interface RestrictionFlags {
  /** Menores de dos años. */
  young: number;
  /** Hembras de reproducción (vacas y novillas). */
  breedingFemales: number;
  /** Sin fecha de nacimiento: no se sabe si son menores de dos años. */
  unknownAge: number;
}

/**
 * Animales que podría alcanzar la restricción anunciada en abril de 2026. No se confirmó que esté
 * vigente: es un aviso para consultar antes de comprometer el embarque.
 */
export function restrictionFlags(animals: ExportAnimal[], today: string): RestrictionFlags {
  const out: RestrictionFlags = { young: 0, breedingFemales: 0, unknownAge: 0 };
  for (const a of animals) {
    if (a.birthDate === null) out.unknownAge++;
    else if (ageMonths(a.birthDate, today) < 24) out.young++;
    if (a.sex === "hembra" && (a.category === "vaca" || a.category === "novilla")) {
      out.breedingFemales++;
    }
  }
  return out;
}

const SPECIES: Record<string, string> = { bovino: "Bovino", bufalino: "Bufalino" };
const SEX: Record<string, string> = { hembra: "Hembra", macho: "Macho" };
const CATEGORY: Record<string, string> = {
  ternero: "Ternero",
  novilla: "Novilla",
  novillo: "Novillo",
  vaca: "Vaca",
  toro: "Toro",
  otro: "Otro",
};

export const PREDIO_HEADER = [
  "NOMBRE DEL PREDIO",
  "DEPARTAMENTO",
  "MUNICIPIO",
  "VEREDA",
  "CANTIDAD ANIMALES A EXPORTAR",
  "PROPIETARIO",
];

/** Anexo de la solicitud de autorización: un renglón por predio proveedor. */
export function predioAnnexRows(predios: PredioInfo[], animals: ExportAnimal[]): string[][] {
  return predios
    .map((p) => ({ p, n: animals.filter((a) => a.farmId === p.farmId).length }))
    .filter((x) => x.n > 0)
    .map(({ p, n }) => [p.name, p.departamento, p.municipio, p.vereda, String(n), p.propietario]);
}

export const ANIMAL_HEADER = [
  "ORDEN",
  "IDENTIFICACIÓN (OREJERA)",
  "ESPECIE",
  "SEXO",
  "CATEGORÍA",
  "FECHA DE NACIMIENTO",
  "PREDIO DE ORIGEN",
];

/** Listado de los animales con su identificación, para registrarla en la guía y el CSO. */
export function animalListRows(
  animals: ExportAnimal[],
  farmNames: Record<string, string>,
): string[][] {
  return [...animals]
    .sort((a, b) => a.tag.localeCompare(b.tag, "es", { numeric: true }))
    .map((a, i) => [
      String(i + 1),
      a.tag,
      SPECIES[a.species] ?? a.species,
      SEX[a.sex] ?? a.sex,
      CATEGORY[a.category] ?? a.category,
      a.birthDate ?? "",
      farmNames[a.farmId] ?? "",
    ]);
}

export interface SolicitudInput {
  country: string;
  embarque: string;
  puerto: string;
  buque: string;
  use: ExportUse;
  fobValue: string;
  animals: number;
  species: string[];
  contact: string;
}

/** Texto del correo a la Dirección Técnica de Cuarentena del ICA. */
export function solicitudText(i: SolicitudInput): { subject: string; body: string } {
  const d = embarkDeadlines(i.embarque);
  const plural: Record<string, string> = { bovino: "Bovinos", bufalino: "Bufalinos" };
  const species = i.species.map((x) => plural[x] ?? x).join(" y ") || "Bovinos";
  const lines = [
    "Señores",
    "Dirección Técnica de Cuarentena Animal, ICA",
    "",
    `Asunto: solicitud de autorización para exportar ${species.toLowerCase()} en pie a ${i.country}`,
    "",
    "Solicito autorización para exportar animales en pie con los siguientes datos:",
    `- País de destino: ${i.country}`,
    `- Uso: ${EXPORT_USE_LABEL[i.use]}`,
    `- Cantidad de animales: ${i.animals}`,
    `- Puerto de salida: ${i.puerto || "(por definir)"}`,
    `- Nombre del buque: ${i.buque || "(por definir)"}`,
    `- Fecha estimada de embarque: ${i.embarque}`,
    ...(i.fobValue ? [`- Valor FOB total: ${i.fobValue}`] : []),
    "",
    "Adjunto el listado de predios proveedores y el listado de animales con su identificación.",
    `Esta solicitud se presenta con anticipación de al menos ${REQUEST_DAYS_BEFORE} días al embarque (a más tardar el ${d.solicitud}).`,
    "",
    "Quedo atento a las facturas de los servicios para iniciar la cuarentena.",
    "",
    "Cordialmente,",
    i.contact,
  ];
  return {
    subject: `Solicitud de autorización de exportación de bovinos en pie a ${i.country}`,
    body: lines.join("\n"),
  };
}
