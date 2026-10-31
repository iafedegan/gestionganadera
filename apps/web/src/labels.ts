import type { SyncState } from "./lib/localdb";

export const SPECIES_LABEL: Record<string, string> = { bovino: "Bovino", bufalino: "Bufalino" };
export const SEX_LABEL: Record<string, string> = { hembra: "Hembra", macho: "Macho" };
export const CATEGORY_LABEL: Record<string, string> = {
  ternero: "Ternero",
  novilla: "Novilla",
  novillo: "Novillo",
  vaca: "Vaca",
  toro: "Toro",
  otro: "Otro",
};
export const REASON_LABEL: Record<string, string> = {
  inventario_inicial: "Inventario inicial",
  compra: "Compra",
  nacimiento: "Nacimiento",
  reingreso: "Reingreso",
};
export const STATUS_LABEL: Record<string, string> = {
  activo: "Activo",
  vendido: "Vendido",
  muerto: "Muerto",
  otra_salida: "Otra salida",
};
export const KIND_LABEL: Record<string, string> = {
  "animal.register": "Alta de animal",
  "supply.create": "Nuevo insumo",
  "stock.receive": "Recepción de insumo",
  "stock.consume": "Consumo de insumo",
  "farm.map.save": "Mapa de la finca",
  "animal.event.record": "Evento del animal",
};
export const SUPPLY_CATEGORY_LABEL: Record<string, string> = {
  alimento: "Alimento",
  medicamento: "Medicamento",
  suplemento: "Suplemento y sales",
  fertilizante: "Fertilizante",
  material: "Material",
};
export const UNIT_LABEL: Record<string, string> = {
  kg: "kg",
  L: "L",
  dosis: "dosis",
  bulto: "bultos",
  unidad: "unidades",
};
export const STOCK_STATUS_LABEL: Record<string, string> = {
  normal: "Normal",
  bajo_minimo: "Bajo mínimo",
  vence_pronto: "Vence pronto",
  vencido: "Vencido",
  sin_existencia: "Sin existencia",
};
export const SYNC_LABEL: Record<SyncState, string> = {
  pendiente: "Pendiente de enviar",
  sincronizado: "Sincronizado",
  rechazado: "Rechazado",
  conflicto: "Conflicto",
};

/** Mensajes de error de dominio para mostrar al usuario. */
export const CODE_LABEL: Record<string, string> = {
  TAG_DUPLICADO: "Arete duplicado",
  FINCA_NO_AUTORIZADA: "Finca no autorizada",
  PERMISO_DENEGADO: "Sin permiso",
  VALIDACION: "Dato inválido",
  MADRE_INVALIDA: "Madre no válida",
  PADRE_INVALIDO: "Padre no válido",
  FECHA_FUTURA: "Fecha futura",
  ID_EN_USO: "Identificador en uso",
  STOCK_INSUFICIENTE: "Existencia insuficiente",
  INSUMO_NO_EXISTE: "Insumo no existe",
  ANIMAL_NO_EXISTE: "Animal no existe",
  ANIMAL_INACTIVO: "Animal inactivo",
  EVENTO_NO_APLICA: "El evento no aplica",
  INSUMO_DUPLICADO: "Insumo duplicado",
};

const nf = new Intl.NumberFormat("es-CO");
export const num = (n: number) => nf.format(n);

const df = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });
const dtf = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
/** Acepta AAAA-MM-DD (sin desplazar por zona horaria) o un instante ISO. */
export function fecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m
    ? df.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : df.format(new Date(iso));
}
export const fechaHora = (iso: string) => dtf.format(new Date(iso));

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
