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

/* ───────────── Mapa de la finca: lindero y potreros ───────────── */

/** Punto [latitud, longitud] en grados decimales (WGS84). */
export const LatLng = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
export type LatLng = z.infer<typeof LatLng>;
const Ring = z.array(LatLng).min(3).max(5000);

export const MapPaddock = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  forage: z.string().trim().max(60),
  points: Ring,
});
export type MapPaddock = z.infer<typeof MapPaddock>;

/**
 * Guarda el mapa completo de una finca. `baseRevision` es la revisión sobre la que se editó:
 * si en el servidor ya hay otra (cambio desde otro dispositivo), el comando queda en conflicto.
 */
export const FarmMapSavePayload = z.object({
  farmId: uuid,
  baseRevision: z.number().int().min(0),
  boundary: Ring.nullable(),
  paddocks: z.array(MapPaddock).max(300),
});
export type FarmMapSavePayload = z.infer<typeof FarmMapSavePayload>;

/* ───────────── Eventos del animal: reproducción, producción y sanidad ───────────── */

const eventBase = { id: uuid, animalId: uuid, occurredOn: isoDate };
const note = z.string().trim().max(500).optional();

export const AnimalEventPayload = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("servicio"),
    data: z.object({
      via: z.enum(["IA", "Monta", "Transferencia de embrión"]),
      sire: z.string().trim().min(1).max(60),
      note,
    }),
  }),
  z.object({ ...eventBase, type: z.literal("celo"), data: z.object({ note }) }),
  z.object({
    ...eventBase,
    type: z.literal("dx"),
    data: z.object({
      result: z.enum(["Preñada", "Vacía", "Dudosa"]),
      method: z.enum(["Ecografía", "Palpación rectal"]),
      note,
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("parto"),
    data: z.object({
      calfTag: z.string().trim().max(40).optional(),
      calfSex: z.enum(["Hembra", "Macho", "Mellizos"]).optional(),
      birthWeightKg: z.number().positive().max(120).optional(),
      ease: z.enum(["Normal", "Asistido", "Distocia (cesárea)"]).optional(),
      note,
    }),
  }),
  z.object({ ...eventBase, type: z.literal("aborto"), data: z.object({ note }) }),
  z.object({ ...eventBase, type: z.literal("secado"), data: z.object({ note }) }),
  z.object({
    ...eventBase,
    type: z.literal("leche"),
    data: z.object({ liters: z.number().positive().max(120), shift: z.enum(["Mañana", "Tarde"]) }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("peso"),
    data: z.object({
      kg: z.number().positive().max(2000),
      method: z.enum(["Báscula", "Cinta", "Estimado"]),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("salud"),
    data: z.object({
      kind: z.enum(["Vacunación", "Tratamiento", "Desparasitación", "Diagnóstico", "Control"]),
      product: z.string().trim().max(120),
      reason: z.string().trim().max(200),
      dose: z.string().trim().max(80).optional(),
      responsible: z.string().trim().max(120),
      cost: z.number().min(0).max(1_000_000_000).nullable(),
      milkWithdrawalDays: z.number().int().min(0).max(365),
      meatWithdrawalDays: z.number().int().min(0).max(365),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("cmt"),
    data: z.object({
      AI: z.number().int().min(0).max(4),
      AD: z.number().int().min(0).max(4),
      PI: z.number().int().min(0).max(4),
      PD: z.number().int().min(0).max(4),
    }),
  }),
]);
export type AnimalEventPayload = z.infer<typeof AnimalEventPayload>;
export type AnimalEventType = AnimalEventPayload["type"];

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
export const FarmMapSaveCommand = z.object({
  ...base,
  type: z.literal("farm.map.save"),
  payload: FarmMapSavePayload,
});
export type FarmMapSaveCommand = z.infer<typeof FarmMapSaveCommand>;
export const AnimalEventCommand = z.object({
  ...base,
  type: z.literal("animal.event.record"),
  payload: AnimalEventPayload,
});
export type AnimalEventCommand = z.infer<typeof AnimalEventCommand>;
export type SupplyCreateCommand = z.infer<typeof SupplyCreateCommand>;
export type StockReceiveCommand = z.infer<typeof StockReceiveCommand>;
export type StockConsumeCommand = z.infer<typeof StockConsumeCommand>;

/** Cualquier comando que un dispositivo puede encolar. */
export const CommandEnvelope = z.discriminatedUnion("type", [
  AnimalCommand,
  SupplyCreateCommand,
  StockReceiveCommand,
  StockConsumeCommand,
  FarmMapSaveCommand,
  AnimalEventCommand,
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
  productionFocus: ProductionFocus | null;
  productionSystem: ProductionSystem | null;
  totalAreaHa: number | null;
  livestockAreaHa: number | null;
  areaUnit: AreaUnit;
  latitude: number | null;
  longitude: number | null;
  speciesSettings: Partial<Record<Species, SpeciesSetting>>;
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

export type AnimalEventDto = AnimalEventPayload & {
  organizationId: string;
  farmId: string;
  recordedBy: string;
};

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

export interface FarmMapDto {
  farmId: string;
  organizationId: string;
  revision: number;
  boundary: LatLng[] | null;
  paddocks: MapPaddock[];
  updatedAt: string;
  updatedBy: string;
}

export type Change =
  | { version: number; entity: "farm"; op: "upsert"; data: FarmDto }
  | { version: number; entity: "animal"; op: "upsert"; data: AnimalDto }
  | { version: number; entity: "supply"; op: "upsert"; data: SupplyDto }
  | { version: number; entity: "stock_movement"; op: "upsert"; data: StockMovementDto }
  | { version: number; entity: "farm_map"; op: "upsert"; data: FarmMapDto }
  | { version: number; entity: "animal_event"; op: "upsert"; data: AnimalEventDto };

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

export const ProductionFocus = z.enum(["leche", "carne", "doble_proposito"]);
export type ProductionFocus = z.infer<typeof ProductionFocus>;

export const ProductionSystem = z.enum([
  "cria",
  "levante",
  "ceba",
  "ciclo_completo",
  "puro",
  "bravura",
]);
export type ProductionSystem = z.infer<typeof ProductionSystem>;

export const AreaUnit = z.enum(["ha", "fanegada", "cuadra", "acre"]);
export type AreaUnit = z.infer<typeof AreaUnit>;

/** Parámetros de manejo por especie: edad de destete y días de lactancia al secado. */
export const SpeciesSetting = z.object({
  weaningMonths: z.number().int().min(1).max(24),
  dryOffDays: z.number().int().min(60).max(600),
});
export type SpeciesSetting = z.infer<typeof SpeciesSetting>;

const farmFields = {
  name: z.string().trim().min(1).max(120),
  locationText: z.string().trim().max(200).optional(),
  speciesPresent: z.array(Species).min(1),
  productionFocus: ProductionFocus.optional(),
  productionSystem: ProductionSystem.optional(),
  totalAreaHa: z.number().positive().max(10_000_000).optional(),
  livestockAreaHa: z.number().positive().max(10_000_000).optional(),
  areaUnit: AreaUnit.default("ha"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  speciesSettings: z
    .object({ bovino: SpeciesSetting, bufalino: SpeciesSetting })
    .partial()
    .default({}),
};

function checkFarm(
  f: {
    totalAreaHa?: number | undefined;
    livestockAreaHa?: number | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (f.totalAreaHa !== undefined && f.livestockAreaHa !== undefined) {
    if (f.livestockAreaHa > f.totalAreaHa) {
      ctx.addIssue({
        code: "custom",
        path: ["livestockAreaHa"],
        message: "El área ganadera no puede ser mayor que el área total.",
      });
    }
  }
  if ((f.latitude === undefined) !== (f.longitude === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "La ubicación necesita latitud y longitud.",
    });
  }
}

export const FarmCreate = z
  .object({
    organizationId: uuid,
    code: z.string().trim().min(1).max(20),
    ...farmFields,
  })
  .superRefine(checkFarm);
export type FarmCreate = z.input<typeof FarmCreate>;

/** Reemplaza los datos de la finca; lo que no llegue queda vacío. El código no cambia. */
export const FarmUpdate = z.object({ organizationId: uuid, ...farmFields }).superRefine(checkFarm);
export type FarmUpdate = z.input<typeof FarmUpdate>;

/* ───────────── Interpretación de lo dictado por voz ───────────── */

export const VoiceInterpretRequest = z.object({
  organizationId: uuid,
  formTitle: z.string().max(200),
  fields: z
    .array(
      z.object({
        name: z.string().max(80),
        label: z.string().max(200),
        type: z.enum(["text", "tag", "number", "date", "select", "textarea"]),
        required: z.boolean(),
        value: z.string().max(500),
        choices: z
          .array(z.object({ value: z.string().max(120), label: z.string().max(200) }))
          .max(5000)
          .optional(),
      }),
    )
    .min(1)
    .max(60),
  /** Datos de la finca que ayudan a razonar: animales, estado, retiros. */
  context: z.string().max(40_000),
  current: z.string().max(80).optional(),
  history: z
    .array(z.object({ role: z.enum(["app", "usuario"]), text: z.string().max(800) }))
    .max(30),
  /** Alternativas del reconocedor para la misma frase, de la más a la menos probable. */
  alternatives: z.array(z.string().max(800)).min(1).max(5),
});
export type VoiceInterpretRequest = z.infer<typeof VoiceInterpretRequest>;

export interface VoiceInterpretResponse {
  values: Record<string, string>;
  question: string | null;
  action: "continuar" | "guardar" | "detener";
}

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
  MAPA_DESACTUALIZADO: "MAPA_DESACTUALIZADO",
  ANIMAL_NO_EXISTE: "ANIMAL_NO_EXISTE",
  ANIMAL_INACTIVO: "ANIMAL_INACTIVO",
  EVENTO_NO_APLICA: "EVENTO_NO_APLICA",
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
