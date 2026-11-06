import {
  type AnimalRegisterPayload,
  type ErrorCode,
  ErrorCodes,
  type Role,
  type Species,
} from "@ganaderia/contracts";

/** Normaliza el arete visible: sin espacios extremos y en mayúsculas. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toUpperCase();
}

const FEMALE_ONLY = new Set(["novilla", "vaca"]);
const MALE_ONLY = new Set(["novillo", "toro"]);

/** Ternero y "otro" admiten ambos sexos; novilla y vaca solo hembras; novillo y toro solo machos. */
export function categoryMatchesSex(category: string, sex: "hembra" | "macho"): boolean {
  if (FEMALE_ONLY.has(category)) return sex === "hembra";
  if (MALE_ONLY.has(category)) return sex === "macho";
  return true;
}

/** UUID versión 7 (ordenable por tiempo). Se genera en el dispositivo para idempotencia. */
export function uuidv7(now: number = Date.now(), rand?: Uint8Array): string {
  const r = rand ?? crypto.getRandomValues(new Uint8Array(10));
  const b = new Uint8Array(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b.set(r.subarray(0, 10), 6);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface ParentRef {
  id: string;
  species: Species;
  sex: "hembra" | "macho";
  motherId?: string | null | undefined;
  fatherId?: string | null | undefined;
}

export interface RegistrationContext {
  today: string; // AAAA-MM-DD en la zona de la finca
  mother?: ParentRef | undefined;
  father?: ParentRef | undefined;
  /** Busca un animal por id para recorrer la genealogía (detección de ciclos). */
  lookup?: ((id: string) => ParentRef | undefined) | undefined;
}

export interface DomainIssue {
  code: ErrorCode;
  message: string;
}

/** ¿Asignar `parentId` como ascendiente de `animalId` formaría un ciclo? */
export function wouldCreateCycle(
  animalId: string,
  parentId: string,
  lookup: (id: string) => ParentRef | undefined,
): boolean {
  const seen = new Set<string>();
  const stack = [parentId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === animalId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = lookup(current);
    if (node?.motherId) stack.push(node.motherId);
    if (node?.fatherId) stack.push(node.fatherId);
  }
  return false;
}

/** Reglas de negocio del alta de un animal (RF L02). Devuelve la lista de incumplimientos. */
export function validateRegistration(
  input: AnimalRegisterPayload,
  ctx: RegistrationContext,
): DomainIssue[] {
  const issues: DomainIssue[] = [];

  if (normalizeTag(input.tag).length === 0) {
    issues.push({ code: ErrorCodes.VALIDACION, message: "El arete no puede estar vacío." });
  }
  if (!categoryMatchesSex(input.category, input.sex)) {
    issues.push({ code: ErrorCodes.VALIDACION, message: "La categoría no corresponde al sexo." });
  }
  if (input.birthDate && input.birthDate.date > ctx.today) {
    issues.push({ code: ErrorCodes.FECHA_FUTURA, message: "La fecha de nacimiento es futura." });
  }
  if (input.entry.occurredAt > ctx.today) {
    issues.push({ code: ErrorCodes.FECHA_FUTURA, message: "La fecha de entrada es futura." });
  }
  if (
    input.birthDate &&
    input.entry.reason !== "nacimiento" &&
    input.entry.occurredAt < input.birthDate.date
  ) {
    issues.push({
      code: ErrorCodes.VALIDACION,
      message: "La entrada no puede ser anterior al nacimiento conocido.",
    });
  }

  if (input.motherId) {
    const m = ctx.mother;
    if (!m || m.sex !== "hembra" || m.species !== input.species || m.id === input.id) {
      issues.push({
        code: ErrorCodes.MADRE_INVALIDA,
        message: "La madre debe ser una hembra de la misma especie.",
      });
    } else if (ctx.lookup && wouldCreateCycle(input.id, m.id, ctx.lookup)) {
      issues.push({ code: ErrorCodes.MADRE_INVALIDA, message: "La genealogía formaría un ciclo." });
    }
  }
  if (input.fatherId) {
    const f = ctx.father;
    if (!f || f.sex !== "macho" || f.species !== input.species || f.id === input.id) {
      issues.push({
        code: ErrorCodes.PADRE_INVALIDO,
        message: "El padre debe ser un macho de la misma especie.",
      });
    } else if (ctx.lookup && wouldCreateCycle(input.id, f.id, ctx.lookup)) {
      issues.push({ code: ErrorCodes.PADRE_INVALIDO, message: "La genealogía formaría un ciclo." });
    }
  }
  return issues;
}

export type Permission =
  | "farm.read"
  | "farm.write"
  | "animal.read"
  | "animal.write"
  | "event.write"
  | "economy.read"
  | "supply.write"
  | "stock.write"
  | "audit.read"
  | "team.manage";

const MATRIX: Record<Role, readonly Permission[]> = {
  admin_entidad: [
    "farm.read",
    "farm.write",
    "animal.read",
    "animal.write",
    "event.write",
    "supply.write",
    "stock.write",
    "audit.read",
    "team.manage",
  ],
  propietario: [
    "farm.read",
    "farm.write",
    "animal.read",
    "animal.write",
    "event.write",
    "economy.read",
    "supply.write",
    "stock.write",
    "audit.read",
    "team.manage",
  ],
  // TDR: operario con consulta mínima y captura de eventos autorizados; sin administración.
  // Puede recibir y consumir insumos en bodega, pero no crear el catálogo ni ver costos.
  operario: ["farm.read", "animal.read", "event.write", "stock.write"],
  // TDR: técnico con consulta y registro técnico; sin acceso económico por defecto.
  tecnico: ["farm.read", "animal.read", "event.write"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

/** Etiqueta legible de cada rol para la interfaz. */
export const ROLE_LABEL: Record<Role, string> = {
  admin_entidad: "Administrador de entidad",
  propietario: "Propietario o administrador de finca",
  operario: "Operario",
  tecnico: "Técnico o asesor",
};

/* ───────────── Insumos y existencias (ERP 1) ───────────── */

/** Redondea a 3 decimales: evita acumular error de punto flotante en cantidades. */
export const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface StockLot {
  lotCode: string | null;
  expiresOn: string | null;
  balance: number;
}

export interface FefoAllocation {
  lotCode: string | null;
  expiresOn: string | null;
  quantity: number;
}

export interface FefoResult {
  ok: boolean;
  allocations: FefoAllocation[];
  /** Cantidad disponible para consumir (sin contar lotes vencidos). */
  available: number;
  /** Saldo en lotes vencidos, que nunca se consume. */
  expired: number;
}

/**
 * Asigna un consumo a los lotes que vencen primero (FEFO). Los lotes vencidos a la
 * fecha del consumo no se usan. Si no alcanza, `ok` es falso y no se asigna nada.
 */
export function allocateFefo(lots: StockLot[], quantity: number, asOf: string): FefoResult {
  const live = lots.filter((l) => l.balance > 0 && !(l.expiresOn && l.expiresOn < asOf));
  const expired = round3(
    lots
      .filter((l) => l.balance > 0 && l.expiresOn && l.expiresOn < asOf)
      .reduce((a, l) => a + l.balance, 0),
  );
  const available = round3(live.reduce((a, l) => a + l.balance, 0));
  if (round3(quantity) > available) return { ok: false, allocations: [], available, expired };

  // Primero los que vencen antes; los que no tienen vencimiento, al final.
  const sorted = [...live].sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return (a.lotCode ?? "").localeCompare(b.lotCode ?? "");
    if (a.expiresOn === null) return 1;
    if (b.expiresOn === null) return -1;
    return a.expiresOn < b.expiresOn ? -1 : 1;
  });
  let left = round3(quantity);
  const allocations: FefoAllocation[] = [];
  for (const lot of sorted) {
    if (left <= 0) break;
    const take = round3(Math.min(lot.balance, left));
    allocations.push({ lotCode: lot.lotCode, expiresOn: lot.expiresOn, quantity: take });
    left = round3(left - take);
  }
  return { ok: true, allocations, available, expired };
}

export interface StockAlertInput {
  onHand: number;
  minStock: number;
  /** Vencimiento más próximo entre lotes con saldo. */
  nearestExpiry: string | null;
  today: string;
  /** Días de anticipación para avisar un vencimiento. */
  warnDays?: number;
}

export type StockStatus = "normal" | "bajo_minimo" | "vence_pronto" | "vencido" | "sin_existencia";

const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
};

/** Estado de un insumo; el vencimiento pesa más que el mínimo porque es un riesgo, no un trámite. */
export function stockStatus(i: StockAlertInput): StockStatus {
  if (i.onHand <= 0) return "sin_existencia";
  if (i.nearestExpiry && i.nearestExpiry < i.today) return "vencido";
  if (i.nearestExpiry && i.nearestExpiry <= addDays(i.today, i.warnDays ?? 30))
    return "vence_pronto";
  if (i.minStock > 0 && i.onHand < i.minStock) return "bajo_minimo";
  return "normal";
}

export interface StockReceiveInput {
  quantity: number;
  occurredOn: string;
  expiresOn?: string | undefined;
}

/** Reglas de una recepción de insumos. */
export function validateStockReceive(
  input: StockReceiveInput,
  ctx: { today: string },
): DomainIssue[] {
  const issues: DomainIssue[] = [];
  if (input.occurredOn > ctx.today) {
    issues.push({ code: ErrorCodes.FECHA_FUTURA, message: "La fecha de recepción es futura." });
  }
  if (input.expiresOn && input.expiresOn < input.occurredOn) {
    issues.push({
      code: ErrorCodes.VALIDACION,
      message: "El producto ya estaba vencido al recibirlo.",
    });
  }
  return issues;
}

/** Hectáreas por unidad. Fanegada y cuadra colombianas: 6.400 m²; pueden variar por región. */
export const HA_PER_UNIT = { ha: 1, fanegada: 0.64, cuadra: 0.64, acre: 0.404686 } as const;
export type AreaUnitKey = keyof typeof HA_PER_UNIT;

export function toHectares(value: number, unit: AreaUnitKey): number {
  return Math.round(value * HA_PER_UNIT[unit] * 10_000) / 10_000;
}

export function fromHectares(ha: number, unit: AreaUnitKey): number {
  return Math.round((ha / HA_PER_UNIT[unit]) * 100) / 100;
}

/** UGG estimadas por categoría cuando no hay pesaje. 1 UGG = 450 kg de peso vivo. */
const UGG_BY_CATEGORY: Record<string, number> = {
  ternero: 0.3,
  novilla: 0.7,
  novillo: 0.7,
  vaca: 1,
  toro: 1.3,
  otro: 0.7,
};

/** Carga estimada de la finca: UGG totales y UGG/ha sobre el área ganadera. */
export function estimatedLoad(
  byCategory: { category: string; n: number }[],
  livestockAreaHa: number | null,
): { ugg: number; perHa: number | null } {
  const ugg = byCategory.reduce((s, c) => s + (UGG_BY_CATEGORY[c.category] ?? 0.7) * c.n, 0);
  return { ugg, perHa: livestockAreaHa && livestockAreaHa > 0 ? ugg / livestockAreaHa : null };
}

/** Fecha en que un animal cumple la edad de destete (AAAA-MM-DD). Ajusta al último día del mes. */
export function weaningDate(birthDate: string, months: number): string {
  const b = new Date(`${birthDate}T00:00:00Z`);
  const target = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(b.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

/** El aviso de destete vive de 7 días antes a 30 después, para que no quede abierto para siempre. */
export function isWeaningDue(birthDate: string, months: number, today: string): boolean {
  const days = (Date.parse(weaningDate(birthDate, months)) - Date.parse(today)) / 86_400_000;
  return days <= 7 && days >= -30;
}

/* ───────────── Eventos del animal ───────────── */

const FEMALE_EVENTS = new Set([
  "servicio",
  "celo",
  "dx",
  "parto",
  "aborto",
  "secado",
  "leche",
  "cmt",
]);

/** Reglas comunes para registrar un evento, en el dispositivo y en el servidor. */
export function validateAnimalEvent(
  input: { type: string; occurredOn: string },
  ctx: { today: string; sex: string; status: string; birthDate: string | null },
): DomainIssue[] {
  const issues: DomainIssue[] = [];
  if (ctx.status !== "activo") {
    issues.push({ code: ErrorCodes.ANIMAL_INACTIVO, message: "El animal ya no está activo." });
  }
  if (input.occurredOn > ctx.today) {
    issues.push({ code: ErrorCodes.FECHA_FUTURA, message: "La fecha del evento es futura." });
  }
  if (ctx.birthDate && input.occurredOn < ctx.birthDate) {
    issues.push({
      code: ErrorCodes.VALIDACION,
      message: "El evento no puede ser anterior al nacimiento.",
    });
  }
  if (FEMALE_EVENTS.has(input.type) && ctx.sex !== "hembra") {
    issues.push({
      code: ErrorCodes.EVENTO_NO_APLICA,
      message: "Este evento solo aplica a hembras.",
    });
  }
  return issues;
}

/**
 * ¿La hembra llegó a los días de lactancia en que la finca acostumbra secar?
 * Sigue activo hasta que se registre el secado o un parto nuevo reinicie la lactancia.
 */
export function isDryOffDue(
  events: { type: string; occurredOn: string }[],
  dryOffDays: number,
  today: string,
): boolean {
  const lastOf = (type: string) =>
    events
      .filter((e) => e.type === type)
      .map((e) => e.occurredOn)
      .sort()
      .pop();
  const parto = lastOf("parto");
  if (!parto) return false;
  const secado = lastOf("secado");
  if (secado && secado >= parto) return false;
  return (Date.parse(today) - Date.parse(parto)) / 86_400_000 >= dryOffDays;
}
export * from "./diagnosis";
export * from "./exportDocs";
export * from "./exportForms";
