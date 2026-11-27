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

export const Role = z.enum([
  "admin_entidad",
  "propietario",
  "mayordomo",
  "operario",
  "veterinario",
  "tecnico",
]);
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
  /** App instalada en el celular: la sesión dura 30 días en vez de 12 horas. */
  remember: z.boolean().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Contraseñas demasiado comunes que se rechazan siempre. */
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "contraseña",
  "qwerty123",
  "11111111",
  "00000000",
  "abcdefgh",
  "ganaderia",
  "finca123",
  "colombia",
]);

/** Alta de una cuenta nueva: crea la organización con el usuario como propietario. */
export const RegisterRequest = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(200)
    .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "Esa contraseña es demasiado común.")
    .refine((p) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(p) && /\d/.test(p), "Use letras y números."),
  organizationName: z.string().trim().min(2).max(120),
  acceptTerms: z.literal(true),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

/** Registro de alguien invitado: entra a la organización que lo invitó, sin crear una propia. */
export const RegisterInvitedRequest = z.object({
  displayName: RegisterRequest.shape.displayName,
  email: RegisterRequest.shape.email,
  password: RegisterRequest.shape.password,
  invitationCode: z.string().trim().min(6).max(20),
  acceptTerms: z.literal(true),
});
export type RegisterInvitedRequest = z.infer<typeof RegisterInvitedRequest>;

/** Quién puede ser invitado. El propietario no se invita: es quien crea la cuenta. */
export const InviteRole = z.enum([
  "operario",
  "mayordomo",
  "veterinario",
  "tecnico",
  "admin_entidad",
]);
export type InviteRole = z.infer<typeof InviteRole>;

export const InvitationCreate = z.object({
  organizationId: z.string().uuid(),
  role: InviteRole,
  label: z.string().trim().min(2).max(120),
  farmId: z.string().uuid().optional(),
  /** Días de acceso (veterinarios y asesores). Sin valor, el acceso no vence. */
  accessDays: z.number().int().min(1).max(730).optional(),
});
export type InvitationCreate = z.infer<typeof InvitationCreate>;

/** Veterinario ya registrado, para escogerlo al armar el equipo. Solo el nombre: sin correo. */
export interface VetOption {
  userId: string;
  displayName: string;
  inTeam: boolean;
}

export const VetAdd = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  accessDays: z.number().int().min(1).max(730).optional(),
});
export type VetAdd = z.infer<typeof VetAdd>;

export interface InvitationDto {
  id: string;
  role: InviteRole;
  label: string;
  farmId: string | null;
  accessUntil: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
}

export interface TeamMemberDto {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  role: Role;
  farmId: string | null;
  validUntil: string | null;
  isMe: boolean;
  avatar?: string | null;
}

export interface TeamDto {
  members: TeamMemberDto[];
  invitations: InvitationDto[];
}

export interface InvitationPreview {
  organizationName: string;
  role: InviteRole;
  label: string;
  accessUntil: string | null;
}

export const JobRole = z.enum([
  "propietario",
  "administrador",
  "mayordomo",
  "veterinario",
  "zootecnista",
  "asesor",
  "otro",
]);
export type JobRole = z.infer<typeof JobRole>;

export const OrgKind = z.enum(["persona_natural", "empresa", "asociacion", "cooperativa"]);
export type OrgKind = z.infer<typeof OrgKind>;

export const Goal = z.enum([
  "reproduccion",
  "leche",
  "peso",
  "sanidad",
  "costos",
  "trazabilidad",
  "pasturas",
  "personal",
  "exportar",
]);
export type Goal = z.infer<typeof Goal>;

const herdCount = z.number().int().min(0).max(100_000);
/** Estimado inicial del hato por especie y categoría: orienta los tableros mientras se registra cada animal. */
export const HerdEstimate = z
  .object({
    bovino: z
      .object({ vacas: herdCount, novillas: herdCount, crias: herdCount, machos: herdCount })
      .partial(),
    bufalino: z
      .object({ vacas: herdCount, novillas: herdCount, crias: herdCount, machos: herdCount })
      .partial(),
  })
  .partial();
export type HerdEstimate = z.infer<typeof HerdEstimate>;

/** Respuestas del asistente inicial. Al guardarlas, la cuenta deja de estar pendiente de configurar. */
export const OnboardingRequest = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  jobRole: JobRole,
  experienceYears: z.number().int().min(0).max(80).optional(),
  orgKind: OrgKind,
  taxId: z.string().trim().max(30).optional(),
  department: z.string().trim().max(80).optional(),
  municipality: z.string().trim().max(80).optional(),
  goals: z.array(Goal).max(8).default([]),
  herdEstimate: HerdEstimate.default({}),
});
export type OnboardingRequest = z.input<typeof OnboardingRequest>;

/* ───────────── Perfil y diagnóstico inicial de la finca ───────────── */

export const ProfileLevel = z.enum(["rapido", "completo"]);
export const ProfileSystem = z.enum(["extensivo", "rotacional", "semiestabulado", "estabulado"]);
export const ProfileRecords = z.enum(["ninguno", "cuaderno", "excel", "software"]);
export const ProfileBreeding = z.enum(["monta", "ia", "mixta"]);
export const ProfileFrequency = z.enum(["nunca", "a_veces", "regular"]);
export const ProfileVet = z.enum(["no", "problemas", "periodico"]);
export const ProfileKnows = z.enum(["si", "aprox", "no"]);
export const ProfileSupplement = z.enum(["sal_mineral", "concentrado", "ensilaje", "ninguno"]);
export const ProfileCert = z.enum(["bpg", "libre_brucelosis", "libre_tuberculosis"]);

const heads = z.number().int().min(0).max(200_000);

/**
 * Respuestas del perfil de la finca. Los básicos son obligatorios para cualquier tamaño;
 * el nivel «completo» agrega detalle para un diagnóstico más preciso.
 */
export const ExportProduct = z.enum(["ganado_pie", "carne", "genetica"]);
export type ExportProduct = z.infer<typeof ExportProduct>;

/** Plan de exportación: qué, a qué país y cuáles documentos ya tiene. */
export const ExportAnswers = z.object({
  products: z.array(ExportProduct).min(1, "Elija qué quiere exportar.").max(3),
  country: z.string().trim().min(2, "Indique el país de destino.").max(80),
  docs: z.record(z.string().max(60), z.enum(["si", "tramite", "no"])),
});
export type ExportAnswers = z.infer<typeof ExportAnswers>;

export const FarmProfile = z
  .object({
    version: z.literal(1).default(1),
    level: ProfileLevel,
    // Básicos
    goals: z.array(Goal).min(1, "Elija al menos un objetivo.").max(3),
    focus: z.enum(["leche", "carne", "doble_proposito"]),
    heads: heads.min(1, "Indique cuántos animales tiene."),
    cows: heads,
    areaHa: z.number().positive("Indique el área en ganadería.").max(1_000_000),
    system: ProfileSystem,
    records: ProfileRecords,
    breeding: ProfileBreeding,
    pregCheck: ProfileFrequency,
    vet: ProfileVet,
    knowsCost: ProfileKnows,
    milking: heads.optional(),
    milkLitersDay: z.number().min(0).max(1_000_000).optional(),
    // Completo
    workers: z.number().int().min(0).max(5000).optional(),
    calvingIntervalMonths: z.number().min(9).max(36).optional(),
    supplements: z.array(ProfileSupplement).max(4).optional(),
    paddocks: z.number().int().min(0).max(10_000).optional(),
    restDays: z.number().int().min(0).max(365).optional(),
    saleWeightKg: z.number().min(0).max(1500).optional(),
    saleAgeMonths: z.number().min(0).max(120).optional(),
    qualityPay: z.enum(["si", "no"]).optional(),
    certifications: z.array(ProfileCert).max(3).optional(),
    mainProblem: z.string().trim().max(300).optional(),
    exportPlan: ExportAnswers.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.goals.includes("exportar") && !p.exportPlan)
      ctx.addIssue({
        code: "custom",
        path: ["exportPlan"],
        message: "Cuéntenos qué quiere exportar y a qué país.",
      });
    if (p.cows > p.heads)
      ctx.addIssue({
        code: "custom",
        path: ["cows"],
        message: "Las vacas no pueden ser más que el total.",
      });
    if (p.focus !== "carne") {
      if (p.milking === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["milking"],
          message: "Indique cuántas vacas ordeña.",
        });
      if (p.milkLitersDay === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["milkLitersDay"],
          message: "Indique los litros por día.",
        });
      if (p.milking !== undefined && p.milking > p.cows)
        ctx.addIssue({
          code: "custom",
          path: ["milking"],
          message: "No puede ordeñar más vacas de las que tiene.",
        });
    }
  });
export type FarmProfile = z.infer<typeof FarmProfile>;
export type FarmProfileInput = z.input<typeof FarmProfile>;

export interface FarmProfileDto {
  profile: FarmProfile | null;
  updatedAt: string | null;
}

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
  /** Cuenta recién creada que aún no completa el asistente inicial. */
  onboardingPending?: boolean;
  /** Foto de perfil (data URL pequeña). */
  avatar?: string;
}

export const UrgentAlertCreate = z.object({
  organizationId: z.string().uuid(),
  farmId: z.string().uuid().nullable().optional(),
  /** Animal afectado: con él viaja su hoja de vida completa. */
  animalId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(2).max(60),
  message: z.string().trim().min(2).max(1500),
});
export type UrgentAlertCreate = z.infer<typeof UrgentAlertCreate>;

export interface UrgentRecipient {
  name: string;
  phone: string | null;
  role: string;
}

/** Hoja de vida y trazabilidad del animal del aviso, leída en el momento. */
export interface UrgentAnimalRecord {
  tag: string;
  species: string;
  sex: string;
  category: string;
  status: string;
  birthDate: string | null;
  farmName: string;
  motherTag: string | null;
  fatherTag: string | null;
  entry: { reason: string; occurredAt: string } | null;
  forest: { checkedAt: string; lossAfterCutoffHa: number } | null;
  events: { type: string; occurredOn: string; data: Record<string, unknown> }[];
}

export const URGENT_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
/** Tamaño máximo de una foto o video en el chat de la urgencia (3 MB). */
export const URGENT_MEDIA_MAX = 3_000_000;

export const UrgentMessageCreate = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    media: z
      .object({
        type: z.enum(URGENT_MEDIA_TYPES),
        data: z
          .string()
          .max(Math.ceil(URGENT_MEDIA_MAX / 3) * 4)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      })
      .optional(),
  })
  .refine((m) => m.body || m.media, { message: "Escriba un mensaje o adjunte una foto." });
export type UrgentMessageCreate = z.infer<typeof UrgentMessageCreate>;

export interface UrgentMessageDto {
  id: string;
  authorName: string;
  mine: boolean;
  body: string | null;
  mediaType: string | null;
  createdAt: string;
}

/** Persona del equipo con quien se puede conversar. */
export interface ChatContact {
  userId: string;
  name: string;
  avatar: string | null;
  role: Role;
  organizationName: string;
  unread: number;
  lastMessage: { id: string; mine: boolean; preview: string; createdAt: string } | null;
}

export interface UrgentAlertDto {
  /** Quien confirmó que atiende. */
  ackById: string | null;
  organizationId: string;
  organizationName: string;
  /** Mensajes del chat, incluidas fotos y videos. */
  messageCount: number;
  /** Último mensaje del chat, para avisar que llegó algo nuevo. */
  lastMessage: {
    id: string;
    authorName: string;
    mine: boolean;
    preview: string;
    createdAt: string;
  } | null;
  /** Quien reportó: las conversaciones se agrupan por persona. */
  authorId: string;
  /** La persona de la sesión es quien confirmó que atiende. */
  attending: boolean;
  animal: UrgentAnimalRecord | null;
  id: string;
  farmName: string | null;
  authorName: string;
  authorPhone: string | null;
  reason: string;
  message: string;
  createdAt: string;
  ackBy: string | null;
  ackAt: string | null;
  /** Veterinarios y asesores del equipo que reciben el aviso. */
  recipients: UrgentRecipient[];
  mine: boolean;
  canAck: boolean;
}

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** Clave propia de Gemini de la ganadería; apiKey null la quita. */
export const AiConfigInput = z.object({
  organizationId: z.string().uuid(),
  apiKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{20,200}$/)
    .nullable(),
  model: z
    .string()
    .trim()
    .regex(/^gemini-[a-z0-9.-]{1,60}$/)
    .default(DEFAULT_GEMINI_MODEL),
});
export type AiConfigInput = z.input<typeof AiConfigInput>;

export interface AiConfigDto {
  configured: boolean;
  /** Últimos 4 caracteres de la clave guardada; la clave nunca vuelve a la aplicación. */
  last4: string | null;
  model: string;
  /** El servidor ya trae un asistente propio. */
  serverAssistant: boolean;
  canEdit: boolean;
}

/** Foto de perfil ya recortada en el dispositivo; null la quita. */
export const AvatarInput = z.object({
  image: z
    .string()
    .max(200_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable(),
});
export type AvatarInput = z.infer<typeof AvatarInput>;

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

/** Cuenta de muestra que se puede elegir en la pantalla de ingreso (solo si el servidor lo permite). */
export interface DemoUserDto {
  /** Encabezado bajo el que se muestra en el ingreso. */
  group?: string;
  key: string;
  label: string;
  description: string;
}
export const DemoLoginRequest = z.object({ key: z.string().min(1).max(40) });
export type DemoLoginRequest = z.infer<typeof DemoLoginRequest>;

/* ───── Protocolo de datos del productor (Plan CTeI 2026–2030, §6.2.6) ───── */

/** Versión vigente del texto de consentimiento. Si cambia, se vuelve a pedir. */
export const DATA_CONSENT_VERSION = "2026-11";
export const DATA_POLICY_URLS = {
  fedegan:
    "https://storage.googleapis.com/static-fedegan/publicaciones/Politica-Tratamiento-Proteccion-Datos-FEDEGAN.pdf",
  fng: "https://storage.googleapis.com/static-fedegan/publicaciones/Politica-Tratamiento-de-proteccion-de-datos-personales-FNG.pdf",
} as const;

export const DataConsentInput = z.object({
  version: z.string().min(1).max(20),
  /** Uso agregado y anónimo para análisis sectorial (opcional). */
  sectorAnalysis: z.boolean(),
  /** Compartir el expediente con el equipo técnico del gremio (opcional). */
  shareTechnical: z.boolean(),
});
export type DataConsentInput = z.infer<typeof DataConsentInput>;

export interface DataConsentDto {
  version: string;
  sectorAnalysis: boolean;
  shareTechnical: boolean;
  acceptedAt: string;
}

export interface DataConsentState {
  /** Versión que la app debe mostrar. */
  currentVersion: string;
  /** Último consentimiento dado; null si nunca lo ha dado. */
  consent: DataConsentDto | null;
  /** Hay que pedirlo (nunca lo dio o cambió la versión). */
  required: boolean;
}

export const DataRequestKind = z.enum(["rectificacion", "supresion", "consulta"]);
export type DataRequestKind = z.infer<typeof DataRequestKind>;
export const DataRequestInput = z.object({
  kind: DataRequestKind,
  message: z.string().trim().min(10, "Cuéntenos qué dato y cómo debe quedar.").max(2000),
});
export type DataRequestInput = z.infer<typeof DataRequestInput>;

export interface DataRequestDto {
  id: string;
  kind: DataRequestKind;
  message: string;
  status: "recibida" | "en_tramite" | "resuelta";
  createdAt: string;
}

/* ───── Extensión híbrida con adopción verificada (Plan CTeI 2026–2030, §6.1.1) ───── */

export const ExtensionTopic = z.enum([
  "reproduccion",
  "nutricion",
  "sanidad",
  "praderas",
  "leche",
  "gestion",
  "ambiental",
  "otro",
]);
export type ExtensionTopic = z.infer<typeof ExtensionTopic>;

/** Indicador sectorial al que contribuye una recomendación (mismas claves del expediente). */
export const SectorIndicator = z.enum([
  "edadPrimerParto",
  "intervaloPartos",
  "natalidad",
  "litrosVacaDia",
  "gananciaDiaria",
  "carga",
]);
export type SectorIndicator = z.infer<typeof SectorIndicator>;

export const TechCaseCreate = z.object({
  organizationId: z.string().uuid(),
  farmId: z.string().uuid().nullable().optional(),
  topic: ExtensionTopic,
  question: z.string().trim().min(10, "Cuente su consulta con un poco más de detalle.").max(2000),
  /** Respuesta que dio el asistente con IA (primer nivel), si la hubo. */
  aiAnswer: z.string().trim().max(6000).optional(),
});
export type TechCaseCreate = z.infer<typeof TechCaseCreate>;

export const TechMessageCreate = z.object({
  body: z.string().trim().min(2, "Escriba su mensaje.").max(3000),
});
export type TechMessageCreate = z.infer<typeof TechMessageCreate>;

export const RecommendationCreate = z.object({
  organizationId: z.string().uuid(),
  farmId: z.string().uuid().nullable().optional(),
  caseId: z.string().uuid().nullable().optional(),
  topic: ExtensionTopic,
  title: z.string().trim().min(5, "Escriba la recomendación en una frase.").max(140),
  detail: z.string().trim().max(2000).default(""),
  indicator: SectorIndicator.nullable().optional(),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export type RecommendationCreate = z.infer<typeof RecommendationCreate>;

export const RecommendationStatus = z.enum(["pendiente", "en_curso", "adoptada", "descartada"]);
export type RecommendationStatus = z.infer<typeof RecommendationStatus>;
export const RecommendationUpdate = z.object({ status: RecommendationStatus });

export const RecommendationVerify = z.object({
  note: z.string().trim().max(1000).default(""),
});

export const FieldVerificationCreate = z.object({
  organizationId: z.string().uuid(),
  farmId: z.string().uuid(),
  visitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(2000).default(""),
});
export type FieldVerificationCreate = z.infer<typeof FieldVerificationCreate>;

export interface TechMessageDto {
  id: string;
  fromStaff: boolean;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TechCaseDto {
  id: string;
  organizationId: string;
  organizationName: string;
  farmId: string | null;
  topic: ExtensionTopic;
  question: string;
  aiAnswer: string | null;
  status: "abierta" | "respondida" | "cerrada";
  authorName: string;
  messages: number;
  createdAt: string;
  updatedAt: string;
}

export interface TechCaseThreadDto {
  case: TechCaseDto;
  messages: TechMessageDto[];
}

export interface RecommendationDto {
  id: string;
  organizationId: string;
  organizationName: string;
  farmId: string | null;
  caseId: string | null;
  fromStaff: boolean;
  authorName: string;
  topic: ExtensionTopic;
  title: string;
  detail: string;
  indicator: SectorIndicator | null;
  dueOn: string | null;
  status: RecommendationStatus;
  adoptedAt: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  createdAt: string;
}

export interface FieldVerificationDto {
  id: string;
  organizationId: string;
  farmId: string;
  visitedOn: string;
  note: string;
  verifierName: string;
}

/** Indicadores de la extensión (Plan CTeI, Tablas 16 y 22). */
export interface ExtensionIndicators {
  recommendations: number;
  adopted: number;
  verified: number;
  /** Adoptadas y verificadas en finca sobre entregadas (meta del plan: 40 % o más). */
  verifiedAdoptionRate: number | null;
  /** Preguntas al asistente con IA en los últimos 12 meses. */
  aiQuestions: number;
  /** Consultas escaladas al segundo nivel en los últimos 12 meses. */
  escalated: number;
  /** Consultas resueltas en primer nivel, sin escalar (meta del plan: 80 % o más). */
  firstLevelRate: number | null;
  /** Respuestas del Secretario Técnico en los últimos 12 meses. */
  secondLevelAttentions: number;
}

export interface ExtensionSummaryDto {
  /** El dueño autorizó compartir el expediente con el Secretario Técnico. */
  shares: boolean;
  /** TECNIG@N que atiende su departamento, si lo hay en la plataforma. */
  tecnigan: string | null;
  cases: TechCaseDto[];
  recommendations: RecommendationDto[];
  verifications: FieldVerificationDto[];
  indicators: ExtensionIndicators;
}

export interface StaffDto {
  role: "secretario_tecnico";
  tecnigan: string;
  departments: string[];
}

export interface StaffFarmDto {
  id: string;
  name: string;
  location: string | null;
  areaHa: number | null;
  focus: string | null;
  animals: number;
  verifiedOn: string | null;
}

export interface StaffOrgDto {
  organizationId: string;
  organizationName: string;
  department: string | null;
  municipality: string | null;
  farms: StaffFarmDto[];
}

export interface StaffInboxDto {
  staff: StaffDto;
  cases: TechCaseDto[];
  organizations: StaffOrgDto[];
  recommendations: RecommendationDto[];
  indicators: ExtensionIndicators;
}

/* ───── Trazabilidad libre de deforestación (Ley 2585 de 2026; Reglamento (UE) 2023/1115) ───── */

export const ForestCheckRequest = z.object({
  organizationId: z.string().uuid(),
  farmId: z.string().uuid(),
  /** Lindero [latitud, longitud]; se limita a Colombia y a fincas de hasta 200.000 ha. */
  boundary: z
    .array(z.tuple([z.number().min(-5).max(16), z.number().min(-82).max(-66)]))
    .min(3)
    .max(5000),
});
export type ForestCheckRequest = z.infer<typeof ForestCheckRequest>;

export interface ForestCheckDto {
  id: string;
  farmId: string;
  checkedAt: string;
  checkedBy: string;
  areaHa: number;
  /** Pérdida de cobertura arbórea dentro del lindero después del 31-dic-2020. */
  lossAfterCutoffHa: number;
  lossBeforeCutoffHa: number;
  /** Hectáreas por año desde 2021. */
  byYear: Record<string, number>;
  source: string;
  version: string;
  pixelHa: number;
  /** Lindero usado en la revisión [latitud, longitud]. */
  boundary: [number, number][];
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
  CORREO_EN_USO: "CORREO_EN_USO",
  INVITACION_INVALIDA: "INVITACION_INVALIDA",
  ANIMAL_NO_EXISTE: "ANIMAL_NO_EXISTE",
  ANIMAL_INACTIVO: "ANIMAL_INACTIVO",
  EVENTO_NO_APLICA: "EVENTO_NO_APLICA",
  ASISTENTE_NO_CONFIGURADO: "ASISTENTE_NO_CONFIGURADO",
  LIMITE_DIARIO: "LIMITE_DIARIO",
  ASISTENTE_ERROR: "ASISTENTE_ERROR",
  SERVICIO_EXTERNO: "SERVICIO_EXTERNO",
  PUBLICACION_NO_EXISTE: "PUBLICACION_NO_EXISTE",
  AULA_NO_EXISTE: "AULA_NO_EXISTE",
  AULA_SIN_INSCRIPCION: "AULA_SIN_INSCRIPCION",
  COMPARTIR_REQUERIDO: "COMPARTIR_REQUERIDO",
  SIN_ACCESO: "SIN_ACCESO",
  NO_ENCONTRADO: "NO_ENCONTRADO",
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/* ───────────── Asistente con IA ───────────── */

/** Clave de Gemini que el dispositivo guarda y envía solo para esa pregunta; el servidor no la guarda. */
export const OwnAi = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{20,200}$/),
  model: z
    .string()
    .trim()
    .regex(/^gemini-[a-z0-9.-]{1,60}$/),
});
export type OwnAi = z.infer<typeof OwnAi>;

export const AssistantRequest = z.object({
  ownAi: OwnAi.optional(),
  organizationId: uuid,
  question: z.string().trim().min(2).max(1500),
  /** Últimos turnos de la conversación, solo texto. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
    .max(20)
    .default([]),
  /** Resumen del clima que la app ya consultó (Open-Meteo). */
  weather: z
    .object({
      tempC: z.number().min(-30).max(60),
      maxC: z.number().min(-30).max(60),
      thi: z.number().min(0).max(130),
      heatDays: z.number().int().min(0).max(16),
      rain7d: z.number().min(0).max(3000),
    })
    .optional(),
  soil: z
    .object({
      texture: z.string().trim().max(40),
      ph: z.number().min(0).max(14).nullable(),
      socGkg: z.number().min(0).max(1000).nullable(),
    })
    .optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;

/** Fuente del conocimiento del gremio (CONtexto Ganadero) que el asistente pudo citar. */
export interface KnowledgeSourceDto {
  n: number;
  title: string;
  url: string;
  kind: "articulo" | "archivo";
}

export interface AssistantReply {
  answer: string;
  /** El asistente decidió que es una urgencia: no responde y se avisa al veterinario. */
  urgent?: string;
  /** Preguntas que le quedan hoy a la ganadería. */
  remaining: number;
  /** Notas de CONtexto Ganadero entregadas al asistente; la respuesta las cita como [n]. */
  sources?: KnowledgeSourceDto[];
}

/* ───────────── Ecosistema FEDEGÁN 5.0 ───────────── */
// Contenido que ya existe en otras plataformas del gremio y la app solo conecta:
// noticias de CONtexto Ganadero, cursos de la Escuela Virtual y productos de la tienda TvGan.

export interface NewsItemDto {
  title: string;
  url: string;
  summary: string;
  image: string | null;
  publishedAt: string | null;
  category: string | null;
}

export interface CourseLessonDto {
  title: string;
  /** Duración tal como la publica la Escuela, p. ej. «8 min». */
  duration: string | null;
  preview: boolean;
}

export interface CourseModuleDto {
  title: string;
  lessons: CourseLessonDto[];
}

export interface CourseDto {
  slug: string;
  title: string;
  summary: string;
  url: string;
  /** Lo siguiente lo lee el servidor de la ficha del curso; falta si la Escuela no respondió. */
  image?: string | null;
  level?: string | null;
  lessonCount?: number | null;
  duration?: string | null;
  instructor?: string | null;
  description?: string;
  outcomes?: string[];
  modules?: CourseModuleDto[];
  /** El servidor está conectado a la API de la Escuela: se puede inscribir y estudiar dentro de la app. */
  enrollable?: boolean;
}

/* ───── Aula: estudiar un curso de la Escuela Virtual dentro de la app ───── */

export interface AulaLessonDto {
  id: string;
  title: string;
  kind: "video" | "lectura" | "quiz";
  minutes: number;
  /** Vista previa gratuita: se abre sin estar inscrito. */
  preview: boolean;
  /** Se puede abrir: la persona está inscrita o es vista previa. */
  available: boolean;
  done: boolean;
  score: number | null;
  /** Nota mínima para aprobar (solo evaluaciones). */
  passScore?: number;
  // Solo si está disponible:
  video?: { type: "iframe" | "file"; src: string };
  content?: string;
  resource?: { url: string; label: string };
}

export interface AulaModuleDto {
  id: string;
  title: string;
  lessons: AulaLessonDto[];
}

export interface AulaCertificateDto {
  code: string;
  date: string;
  /** Página pública donde cualquiera puede comprobar el certificado. */
  verifyUrl: string;
}

export interface AulaEnrollmentDto {
  since: string;
  done: number;
  total: number;
  percent: number;
  completedAt: string | null;
  certificate: AulaCertificateDto | null;
}

export interface AulaCourseDto {
  slug: string;
  title: string;
  subtitle: string;
  image: string | null;
  level: string;
  instructor: string;
  minutes: number;
  hasCertificate: boolean;
  description: string;
  outcomes: string[];
  modules: AulaModuleDto[];
  enrollment: AulaEnrollmentDto | null;
}

export interface AulaQuizDto {
  passScore: number;
  questions: { id: string; question: string; options: string[] }[];
}

export interface AulaQuizResultDto {
  score: number;
  passed: boolean;
  wrong: { question: string; explanation: string }[];
  completedAt: string | null;
  certificate: string | null;
}

export interface AulaProgressDto {
  completedAt: string | null;
  certificate: string | null;
}

export interface MyCourseDto {
  slug: string;
  title: string;
  image: string | null;
  done: number;
  percent: number;
  completedAt: string | null;
  certificate: string | null;
}

/** Respuestas de una evaluación: índice de la opción elegida por pregunta. */
export const AulaQuizAnswers = z.object({
  answers: z.record(z.string().min(1).max(60), z.number().int().min(0).max(20)),
});
export type AulaQuizAnswers = z.infer<typeof AulaQuizAnswers>;

export interface StoreProductDto {
  name: string;
  url: string;
  image: string | null;
  /** Precio tal como lo publica la tienda (texto, en pesos). */
  price: string | null;
  category: string | null;
  /** Cinta de la tienda sobre el producto, p. ej. «PROMOCIÓN». */
  badge?: string | null;
}

export interface StoreCategoryDto {
  key: string;
  label: string;
  url: string;
  /** Productos publicados hoy en la categoría. */
  count: number;
}

/** Catálogo completo publicado en TvGan (o el de una categoría). */
export interface StoreCatalogDto {
  items: StoreProductDto[];
  category: string | null;
  /** Página de la tienda con ese mismo listado. */
  url: string;
  updatedAt: string;
}

export interface StoreSearchDto {
  items: StoreProductDto[];
  total: number;
  /** Página de la tienda con la misma búsqueda, para ver todos los resultados. */
  moreUrl: string;
}

/* ───────────── Comunidad de productores ───────────── */

export const CommunityTopic = z.enum([
  "experiencias",
  "sanidad",
  "reproduccion",
  "pasturas",
  "leche",
  "carne",
  "bufalos",
  "mercado",
  "tecnologia",
]);
export type CommunityTopic = z.infer<typeof CommunityTopic>;

export const CommunityPostCreate = z.object({
  topic: CommunityTopic,
  title: z.string().trim().min(5).max(140),
  body: z.string().trim().min(10).max(4000),
});
export type CommunityPostCreate = z.infer<typeof CommunityPostCreate>;

export const CommunityReplyCreate = z.object({
  body: z.string().trim().min(2).max(3000),
});
export type CommunityReplyCreate = z.infer<typeof CommunityReplyCreate>;

export interface CommunityPostDto {
  id: string;
  topic: CommunityTopic;
  title: string;
  body: string;
  authorName: string;
  /** Departamento o región que el autor eligió mostrar; nunca la finca. */
  region: string | null;
  mine: boolean;
  createdAt: string;
  replies: number;
}

export interface CommunityReplyDto {
  id: string;
  body: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
}

export interface CommunityThreadDto {
  post: CommunityPostDto;
  replies: CommunityReplyDto[];
}
