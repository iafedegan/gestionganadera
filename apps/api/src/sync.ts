import {
  type AnimalDto,
  type AnimalRegisterPayload,
  type Change,
  CommandEnvelope,
  type CommandResult,
  ErrorCodes,
  type FarmCreate,
  type FarmDto,
  type PullResponse,
  type PushResponse,
} from "@ganaderia/contracts";
import { normalizeTag, validateRegistration } from "@ganaderia/domain";
import { appendAudit } from "./audit.js";
import { type AuthUser, type Membership, farmScope, grants, scopeHash } from "./auth.js";
import type { Db, Q } from "./db.js";

const TZ = "America/Bogota";

export const todayIn = (tz = TZ, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);

async function nextVersion(q: Q, orgId: string): Promise<number> {
  const rows = await q<{ version: number | string }>(
    `INSERT INTO org_counter (organization_id, version) VALUES ($1, 1)
     ON CONFLICT (organization_id) DO UPDATE SET version = org_counter.version + 1
     RETURNING version`,
    [orgId],
  );
  return Number(rows[0]?.version);
}

function farmDto(r: Record<string, unknown>): FarmDto {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    code: r.code as string,
    name: r.name as string,
    locationText: (r.location_text as string | null) ?? null,
    speciesPresent: r.species_present as FarmDto["speciesPresent"],
  };
}

export async function createFarm(db: Db, user: AuthUser, input: FarmCreate): Promise<FarmDto> {
  return db.tenant(
    input.organizationId,
    async (q) => {
      const rows = await q(
        `INSERT INTO farm (organization_id, code, name, location_text, species_present)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          input.organizationId,
          input.code,
          input.name,
          input.locationText ?? null,
          input.speciesPresent,
        ],
      );
      const dto = farmDto(rows[0] as Record<string, unknown>);
      const version = await nextVersion(q, input.organizationId);
      await q(
        "INSERT INTO change (organization_id, version, farm_id, entity, entity_id, data) VALUES ($1,$2,$3,'farm',$3,$4)",
        [input.organizationId, version, dto.id, JSON.stringify(dto)],
      );
      await appendAudit(q, input.organizationId, {
        userId: user.id,
        action: "farm.create",
        entity: "farm",
        entityId: dto.id,
        detail: { code: dto.code },
      });
      return dto;
    },
    { write: true },
  );
}

export async function listFarms(
  db: Db,
  orgId: string,
  memberships: Membership[],
): Promise<FarmDto[]> {
  const scope = farmScope(memberships, orgId);
  if (Array.isArray(scope) && scope.length === 0) return [];
  return db.tenant(orgId, async (q) => {
    const rows = await q(
      "SELECT * FROM farm WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY name",
      [scope === "ALL" ? null : scope],
    );
    return rows.map(farmDto);
  });
}

export async function pull(
  db: Db,
  orgId: string,
  memberships: Membership[],
  since: number,
  limit: number,
): Promise<PullResponse> {
  const scope = farmScope(memberships, orgId);
  const hash = scopeHash(scope);
  if (Array.isArray(scope) && scope.length === 0) {
    return {
      changes: [],
      cursor: since,
      hasMore: false,
      serverTime: new Date().toISOString(),
      scope: hash,
    };
  }
  return db.tenant(orgId, async (q) => {
    const rows = await q<{ version: number | string; entity: string; data: unknown }>(
      `SELECT version, entity, data FROM change
        WHERE version > $1 AND ($2::uuid[] IS NULL OR farm_id = ANY($2::uuid[]))
        ORDER BY version LIMIT $3`,
      [since, scope === "ALL" ? null : scope, limit + 1],
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const changes = page.map(
      (r) =>
        ({ version: Number(r.version), entity: r.entity, op: "upsert", data: r.data }) as Change,
    );
    let cursor = since;
    if (hasMore) {
      cursor = changes[changes.length - 1]?.version ?? since;
    } else {
      const c = await q<{ version: number | string }>("SELECT version FROM org_counter");
      cursor = Math.max(since, Number(c[0]?.version ?? 0));
    }
    return { changes, cursor, hasMore, serverTime: new Date().toISOString(), scope: hash };
  });
}

const rejected = (id: string, code: string, message: string): CommandResult => ({
  id,
  status: "rejected",
  code,
  message,
});
const conflict = (id: string, code: string, message: string): CommandResult => ({
  id,
  status: "conflict",
  code,
  message,
});

interface PushCtx {
  db: Db;
  user: AuthUser;
  memberships: Membership[];
  orgId: string;
  deviceId: string;
}

async function applyAnimalRegister(
  q: Q,
  ctx: PushCtx,
  commandId: string,
  p: AnimalRegisterPayload,
): Promise<CommandResult> {
  if (!grants(ctx.memberships, ctx.orgId, "animal.write", p.farmId)) {
    return rejected(
      commandId,
      ErrorCodes.PERMISO_DENEGADO,
      "No tiene permiso para registrar animales en esta finca.",
    );
  }
  const farm = await q("SELECT id FROM farm WHERE id = $1", [p.farmId]);
  if (farm.length === 0) {
    return rejected(
      commandId,
      ErrorCodes.FINCA_NO_AUTORIZADA,
      "La finca no existe o no está autorizada.",
    );
  }
  if ((await q("SELECT 1 FROM animal WHERE id = $1", [p.id])).length > 0) {
    return conflict(
      commandId,
      ErrorCodes.ID_EN_USO,
      "Ya existe un animal con ese identificador interno.",
    );
  }

  const tag = normalizeTag(p.tag);
  const dup = await q<{ id: string }>(
    "SELECT id FROM animal WHERE tag = $1 AND status = 'activo' LIMIT 1",
    [tag],
  );
  if (dup.length > 0) {
    return conflict(
      commandId,
      ErrorCodes.TAG_DUPLICADO,
      `Ya existe un animal activo con el arete ${tag}.`,
    );
  }

  const parentRef = async (id: string | undefined) => {
    if (!id) return undefined;
    const r = await q<{ id: string; species: "bovino" | "bufalino"; sex: "hembra" | "macho" }>(
      "SELECT id, species, sex FROM animal WHERE id = $1",
      [id],
    );
    return r[0];
  };
  const issues = validateRegistration(p, {
    today: todayIn(),
    mother: await parentRef(p.motherId),
    father: await parentRef(p.fatherId),
  });
  const first = issues[0];
  if (first) return rejected(commandId, first.code, first.message);

  await q(
    `INSERT INTO animal (id, organization_id, farm_id, tag, species, sex, category, birth_date,
                         birth_date_precision, mother_id, father_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      p.id,
      ctx.orgId,
      p.farmId,
      tag,
      p.species,
      p.sex,
      p.category,
      p.birthDate?.date ?? null,
      p.birthDate?.precision ?? null,
      p.motherId ?? null,
      p.fatherId ?? null,
      p.notes ?? null,
      ctx.user.id,
    ],
  );
  await q(
    `INSERT INTO animal_event (organization_id, farm_id, animal_id, type, occurred_on, tz, user_id, source, payload)
     VALUES ($1,$2,$3,'entrada',$4,$5,$6,$7,$8)`,
    [
      ctx.orgId,
      p.farmId,
      p.id,
      p.entry.occurredAt,
      TZ,
      ctx.user.id,
      `dispositivo:${ctx.deviceId}`,
      JSON.stringify({ reason: p.entry.reason, origin: p.entry.origin ?? null }),
    ],
  );

  const dto: AnimalDto = {
    id: p.id,
    organizationId: ctx.orgId,
    farmId: p.farmId,
    tag,
    species: p.species,
    sex: p.sex,
    category: p.category,
    status: "activo",
    birthDate: p.birthDate ?? null,
    motherId: p.motherId ?? null,
    fatherId: p.fatherId ?? null,
    notes: p.notes ?? null,
    entry: {
      reason: p.entry.reason,
      occurredAt: p.entry.occurredAt,
      origin: p.entry.origin ?? null,
    },
  };
  const version = await nextVersion(q, ctx.orgId);
  await q(
    "INSERT INTO change (organization_id, version, farm_id, entity, entity_id, data) VALUES ($1,$2,$3,'animal',$4,$5)",
    [ctx.orgId, version, p.farmId, p.id, JSON.stringify(dto)],
  );
  await appendAudit(q, ctx.orgId, {
    userId: ctx.user.id,
    action: "animal.register",
    entity: "animal",
    entityId: p.id,
    detail: { tag, species: p.species, reason: p.entry.reason, commandId },
  });
  return { id: commandId, status: "accepted", serverVersion: version };
}

async function processCommand(ctx: PushCtx, raw: unknown): Promise<CommandResult> {
  const rawId =
    raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
      ? (raw as { id: string }).id
      : "desconocido";
  const parsed = CommandEnvelope.safeParse(raw);
  if (!parsed.success) {
    return rejected(
      rawId,
      ErrorCodes.VALIDACION,
      parsed.error.issues[0]?.message ?? "Comando inválido.",
    );
  }
  const cmd = parsed.data;

  return ctx.db.tenant(
    ctx.orgId,
    async (q) => {
      // Idempotencia: un reenvío devuelve exactamente la respuesta original.
      const seen = await q<{ response: CommandResult }>(
        "SELECT response FROM command_log WHERE command_id = $1",
        [cmd.id],
      );
      if (seen[0]) return seen[0].response;

      const result = await applyAnimalRegister(q, ctx, cmd.id, cmd.payload);
      await q(
        `INSERT INTO command_log (command_id, organization_id, user_id, device_id, type, status, response)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          cmd.id,
          ctx.orgId,
          ctx.user.id,
          ctx.deviceId,
          cmd.type,
          result.status,
          JSON.stringify(result),
        ],
      );
      if (result.status !== "accepted") {
        await appendAudit(q, ctx.orgId, {
          userId: ctx.user.id,
          action: `command.${result.status}`,
          entity: "command",
          entityId: cmd.id,
          detail: { code: result.code, type: cmd.type },
        });
      }
      return result;
    },
    { write: true },
  );
}

export async function push(
  db: Db,
  user: AuthUser,
  memberships: Membership[],
  orgId: string,
  deviceId: string,
  commands: unknown[],
): Promise<PushResponse> {
  const ctx: PushCtx = { db, user, memberships, orgId, deviceId };
  const results: CommandResult[] = [];
  for (const raw of commands) results.push(await processCommand(ctx, raw));
  return { results };
}
