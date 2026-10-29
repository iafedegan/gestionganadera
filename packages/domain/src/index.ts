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
  | "economy.read"
  | "audit.read";

const MATRIX: Record<Role, readonly Permission[]> = {
  admin_entidad: ["farm.read", "farm.write", "animal.read", "animal.write", "audit.read"],
  propietario: [
    "farm.read",
    "farm.write",
    "animal.read",
    "animal.write",
    "economy.read",
    "audit.read",
  ],
  // TDR: operario con consulta mínima y captura de eventos autorizados; sin administración.
  operario: ["farm.read", "animal.read"],
  // TDR: técnico con consulta y registro técnico; sin acceso económico por defecto.
  tecnico: ["farm.read", "animal.read"],
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
