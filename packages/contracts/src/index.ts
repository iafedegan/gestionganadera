import { z } from "zod";

/** Contrato compartido cliente/servidor. La especie es parte explícita del modelo (TDR, RF L02). */
export const Species = z.enum(["bovino", "bufalino"]);
export type Species = z.infer<typeof Species>;

export const Sex = z.enum(["hembra", "macho"]);
export type Sex = z.infer<typeof Sex>;

export const Category = z.enum(["ternero", "novilla", "novillo", "vaca", "toro", "otro"]);
export type Category = z.infer<typeof Category>;

export const AnimalStatus = z.enum(["activo", "vendido", "muerto", "otra_salida"]);
export type AnimalStatus = z.infer<typeof AnimalStatus>;

export const EntryReason = z.enum(["inventario_inicial", "compra", "nacimiento", "reingreso"]);
export type EntryReason = z.infer<typeof EntryReason>;

export const Role = z.enum(["admin_entidad", "propietario", "operario", "tecnico"]);
export type Role = z.infer<typeof Role>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD");
const uuid = z.string().uuid();

/** Fecha exacta o estimada; nunca se completa información ficticia. */
export const BirthDate = z.object({
  date: isoDate,
  precision: z.enum(["exacta", "estimada"]),
});
export type BirthDate = z.infer<typeof BirthDate>;

export const AnimalRegisterPayload = z.object({
  id: uuid,
  farmId: uuid,
  tag: z.string().trim().min(1).max(40),
  species: Species,
  sex: Sex,
  category: Category,
  birthDate: BirthDate.optional(),
  motherId: uuid.optional(),
  fatherId: uuid.optional(),
  entry: z.object({
    reason: EntryReason,
    occurredAt: isoDate,
    origin: z.string().trim().max(120).optional(),
  }),
  notes: z.string().trim().max(500).optional(),
});
export type AnimalRegisterPayload = z.infer<typeof AnimalRegisterPayload>;

export const SupplyCategory = z.enum([
  "alimento",
  "medicamento",
  "suplemento",
  "fertilizante",
  "material",
]);
export type SupplyCategory = z.infer<typeof SupplyCategory>;

export const SupplyUnit = z.enum(["kg", "L", "dosis", "bulto", "unidad"]);
export type SupplyUnit = z.infer<typeof SupplyUnit>;

const qty = z.number().positive().max(1_000_000_000);

export const SupplyCreatePayload = z.object({
  id: uuid,
  name: z.string().trim().min(2).max(120),
  category: SupplyCategory,
  unit: SupplyUnit,
  minStock: z.number().min(0).max(1_000_000_000).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type SupplyCreatePayload = z.infer<typeof SupplyCreatePayload>;

export const StockReceivePayload = z.object({
  supplyId: uuid,
  farmId: uuid,
  quantity: qty,
  occurredOn: isoDate,
  lotCode: z.string().trim().max(60).optional(),
  expiresOn: isoDate.optional(),
  /** Costo unitario en pesos colombianos. Solo lo ven los perfiles con acceso económico. */
  unitCost: z.number().min(0).max(1_000_000_000).optional(),
  supplier: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});
export type StockReceivePayload = z.infer<typeof StockReceivePayload>;

export const ConsumeTarget = z.object({
  kind: z.enum(["lote", "actividad", "general"]),
  label: z.string().trim().max(80).optional(),
});
export type ConsumeTarget = z.infer<typeof ConsumeTarget>;

export const StockConsumePayload = z.object({
  supplyId: uuid,
  farmId: uuid,
  quantity: qty,
  occurredOn: isoDate,
  target: ConsumeTarget,
  note: z.string().trim().max(300).optional(),
});
export type StockConsumePayload = z.infer<typeof StockConsumePayload>;

const base = { id: uuid, clientTs: z.string().datetime({ offset: true }) };

export const AnimalCommand = z.object({
  ...base,
  type: z.literal("animal.register"),
  payload: AnimalRegisterPayload,
});
export type AnimalCommand = z.infer<typeof AnimalCommand>;

export const SupplyCreateCommand = z.object({
  ...base,
  type: z.literal("supply.create"),
  payload: SupplyCreatePayload,
});
export const StockReceiveCommand = z.object({
  ...base,
  type: z.literal("stock.receive"),
  payload: StockReceivePayload,
});
export const StockConsumeCommand = z.object({
  ...base,
  type: z.literal("stock.consume"),
  payload: StockConsumePayload,
});
export type SupplyCreateCommand = z.infer<typeof SupplyCreateCommand>;
export type StockReceiveCommand = z.infer<typeof StockReceiveCommand>;
export type StockConsumeCommand = z.infer<typeof StockConsumeCommand>;

/** Cualquier comando que un dispositivo puede encolar. */
export const CommandEnvelope = z.discriminatedUnion("type", [
  AnimalCommand,
  SupplyCreateCommand,
  StockReceiveCommand,
  StockConsumeCommand,
]);
export type CommandEnvelope = z.infer<typeof CommandEnvelope>;

export const PushRequest = z.object({
  organizationId: uuid,
  deviceId: z.string().min(8).max(64),
  commands: z.array(z.unknown()).max(100),
});
export type PushRequest = z.infer<typeof PushRequest>;

export type CommandResult =
  | { id: string; status: "accepted"; serverVersion: number }
  | { id: string; status: "rejected"; code: string; message: string }
  | { id: string; status: "conflict"; code: string; message: string };

export interface PushResponse {
  results: CommandResult[];
}

export interface FarmDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  locationText: string | null;
  speciesPresent: Species[];
}

export interface AnimalDto {
  id: string;
  organizationId: string;
  farmId: string;
  tag: string;
  species: Species;
  sex: Sex;
  category: Category;
  status: AnimalStatus;
  birthDate: BirthDate | null;
  motherId: string | null;
  fatherId: string | null;
  notes: string | null;
  entry: { reason: EntryReason; occurredAt: string; origin: string | null } | null;
}

export interface SupplyDto {
  id: string;
  organizationId: string;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  minStock: number;
  notes: string | null;
}

export interface StockMovementDto {
  id: string;
  organizationId: string;
  farmId: string;
  supplyId: string;
  kind: "entrada" | "consumo";
  quantity: number;
  lotCode: string | null;
  expiresOn: string | null;
  /** Nulo para quien no tiene acceso económico. */
  unitCost: number | null;
  supplier: string | null;
  target: ConsumeTarget | null;
  occurredOn: string;
  note: string | null;
}

export type Change =
  | { version: number; entity: "farm"; op: "upsert"; data: FarmDto }
  | { version: number; entity: "animal"; op: "upsert"; data: AnimalDto }
  | { version: number; entity: "supply"; op: "upsert"; data: SupplyDto }
  | { version: number; entity: "stock_movement"; op: "upsert"; data: StockMovementDto };

/** Las existencias de insumos son del conjunto de la organización: usan esta "finca" nula en el feed. */
export const ORG_SCOPE_FARM_ID = "00000000-0000-0000-0000-000000000000";

export interface PullResponse {
  changes: Change[];
  cursor: number;
  hasMore: boolean;
  serverTime: string;
  /** Huella de las fincas autorizadas. Si cambia, el cliente debe volver a descargar desde cero. */
  scope: string;
}

export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export interface MembershipDto {
  organizationId: string;
  organizationName: string;
  role: Role;
  farmId: string | null;
}

export interface SessionDto {
  userId: string;
  email: string;
  displayName: string;
  memberships: MembershipDto[];
  /** Instante máximo hasta el cual se admite operar sin renovar en línea (72 h). */
  offlineLeaseUntil: string;
}

export const FarmCreate = z.object({
  organizationId: uuid,
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  locationText: z.string().trim().max(200).optional(),
  speciesPresent: z.array(Species).min(1),
});
export type FarmCreate = z.infer<typeof FarmCreate>;

/** Códigos de error de dominio (estables; la interfaz los traduce). */
export const ErrorCodes = {
  TAG_DUPLICADO: "TAG_DUPLICADO",
  FINCA_NO_AUTORIZADA: "FINCA_NO_AUTORIZADA",
  PERMISO_DENEGADO: "PERMISO_DENEGADO",
  VALIDACION: "VALIDACION",
  MADRE_INVALIDA: "MADRE_INVALIDA",
  PADRE_INVALIDO: "PADRE_INVALIDO",
  FECHA_FUTURA: "FECHA_FUTURA",
  ID_EN_USO: "ID_EN_USO",
  STOCK_INSUFICIENTE: "STOCK_INSUFICIENTE",
  INSUMO_NO_EXISTE: "INSUMO_NO_EXISTE",
  INSUMO_DUPLICADO: "INSUMO_DUPLICADO",
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
