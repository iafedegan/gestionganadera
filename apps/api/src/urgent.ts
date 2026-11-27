import type {
  UrgentAlertCreate,
  UrgentAlertDto,
  UrgentAnimalRecord,
  UrgentRecipient,
} from "@ganaderia/contracts";
import { type Membership, farmScope } from "./auth.js";
import type { Db, Q } from "./db.js";

/**
 * Avisos urgentes: quien reporta una emergencia avisa al veterinario y al asesor técnico de su
 * equipo. Lo ven al abrir la aplicación; cualquiera de ellos (o el dueño) confirma que atiende.
 */

const PER_DAY = 20;
const VET = ["veterinario", "tecnico"];
const ACK = [...VET, "propietario", "admin_entidad"];
const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();

async function recipients(q: Q, orgId: string, farmId: string | null): Promise<UrgentRecipient[]> {
  return q<UrgentRecipient>(
    `SELECT DISTINCT u.display_name AS name, u.phone, m.role
       FROM membership m JOIN app_user u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND m.role = ANY($2) AND u.disabled_at IS NULL
        AND (m.valid_until IS NULL OR m.valid_until > now())
        AND (m.farm_id IS NULL OR $3::uuid IS NULL OR m.farm_id = $3)
      ORDER BY m.role DESC, name`,
    [orgId, VET, farmId],
  );
}

const day = (v: Date | string | null) => (v ? iso(v).slice(0, 10) : null);

async function animalRecord(q: Q, animalId: string): Promise<UrgentAnimalRecord | null> {
  const [a] = await q<{
    tag: string;
    species: string;
    sex: string;
    category: string;
    status: string;
    birth_date: Date | string | null;
    farm_id: string;
    farm_name: string;
    mother: string | null;
    father: string | null;
  }>(
    `SELECT a.tag, a.species, a.sex, a.category, a.status, a.birth_date, a.farm_id,
            f.name AS farm_name, m.tag AS mother, p.tag AS father
       FROM animal a JOIN farm f ON f.id = a.farm_id
       LEFT JOIN animal m ON m.id = a.mother_id
       LEFT JOIN animal p ON p.id = a.father_id
      WHERE a.id = $1`,
    [animalId],
  );
  if (!a) return null;
  const events = await q<{
    type: string;
    occurred_on: Date | string;
    payload: Record<string, unknown>;
  }>(
    `SELECT type, occurred_on, payload FROM animal_event WHERE animal_id = $1
      ORDER BY occurred_on DESC, recorded_at DESC LIMIT 500`,
    [animalId],
  );
  const [forest] = await q<{ checked_at: Date | string; loss_after_cutoff_ha: number }>(
    `SELECT checked_at, loss_after_cutoff_ha FROM forest_check WHERE farm_id = $1
      ORDER BY checked_at DESC LIMIT 1`,
    [a.farm_id],
  );
  const entry = events.find((e) => e.type === "entrada");
  return {
    tag: a.tag,
    species: a.species,
    sex: a.sex,
    category: a.category,
    status: a.status,
    birthDate: day(a.birth_date),
    farmName: a.farm_name,
    motherTag: a.mother,
    fatherTag: a.father,
    entry: entry
      ? { reason: String(entry.payload.reason ?? ""), occurredAt: day(entry.occurred_on) ?? "" }
      : null,
    forest: forest
      ? { checkedAt: iso(forest.checked_at), lossAfterCutoffHa: forest.loss_after_cutoff_ha }
      : null,
    events: events.map((e) => ({
      type: e.type,
      occurredOn: day(e.occurred_on) as string,
      data: e.payload,
    })),
  };
}

interface Row {
  id: string;
  animal_id: string | null;
  farm_id: string | null;
  farm_name: string | null;
  created_by: string;
  author_name: string;
  reason: string;
  message: string;
  created_at: Date | string;
  ack_name: string | null;
  ack_at: Date | string | null;
}

const SQL = `SELECT a.id, a.farm_id, f.name AS farm_name, a.created_by, u.display_name AS author_name,
       a.animal_id, a.reason, a.message, a.created_at, k.display_name AS ack_name, a.ack_at
  FROM urgent_alert a
  JOIN app_user u ON u.id = a.created_by
  LEFT JOIN farm f ON f.id = a.farm_id
  LEFT JOIN app_user k ON k.id = a.ack_by`;

const canAck = (m: Membership[], orgId: string) =>
  m.some((x) => x.organizationId === orgId && ACK.includes(x.role));

async function toDto(
  q: Q,
  r: Row,
  orgId: string,
  userId: string,
  memberships: Membership[],
): Promise<UrgentAlertDto> {
  return {
    id: r.id,
    animal: r.animal_id ? await animalRecord(q, r.animal_id) : null,
    farmName: r.farm_name,
    authorName: r.author_name,
    reason: r.reason,
    message: r.message,
    createdAt: iso(r.created_at),
    ackBy: r.ack_name,
    ackAt: r.ack_at ? iso(r.ack_at) : null,
    recipients: await recipients(q, orgId, r.farm_id),
    mine: r.created_by === userId,
    canAck: canAck(memberships, orgId),
  };
}

export async function createUrgent(
  db: Db,
  userId: string,
  memberships: Membership[],
  input: UrgentAlertCreate,
): Promise<UrgentAlertDto | { error: "LIMITE" | "NO_EXISTE" }> {
  const orgId = input.organizationId;
  const scope = farmScope(memberships, orgId);
  const animalId = input.animalId ?? null;
  let farmId = input.farmId ?? null;
  if (animalId) {
    const [a] = await db.admin((q) =>
      q<{ farm_id: string }>("SELECT farm_id FROM animal WHERE id = $1 AND organization_id = $2", [
        animalId,
        orgId,
      ]),
    );
    if (!a) return { error: "NO_EXISTE" };
    farmId = a.farm_id;
  }
  if (farmId && scope !== "ALL" && !scope.includes(farmId)) return { error: "NO_EXISTE" };
  return db.admin(async (q) => {
    if (farmId) {
      const [f] = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
        farmId,
        orgId,
      ]);
      if (!f) return { error: "NO_EXISTE" as const };
    }
    // Repetir la misma urgencia en pocos minutos no crea otro aviso.
    let [row] = await q<{ id: string }>(
      `SELECT id FROM urgent_alert WHERE organization_id = $1 AND created_by = $2 AND reason = $3
         AND animal_id IS NOT DISTINCT FROM $4::uuid
         AND ack_at IS NULL AND created_at > now() - interval '10 minutes'`,
      [orgId, userId, input.reason, animalId],
    );
    if (!row) {
      const [n] = await q<{ n: string }>(
        "SELECT count(*) AS n FROM urgent_alert WHERE organization_id = $1 AND created_at > now() - interval '1 day'",
        [orgId],
      );
      if (Number(n?.n ?? 0) >= PER_DAY) return { error: "LIMITE" as const };
      [row] = await q<{ id: string }>(
        `INSERT INTO urgent_alert (organization_id, farm_id, created_by, reason, message, animal_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [orgId, farmId, userId, input.reason, input.message, animalId],
      );
    }
    const [full] = await q<Row>(`${SQL} WHERE a.id = $1`, [row?.id]);
    return toDto(q, full as Row, orgId, userId, memberships);
  });
}

/** Avisos de las últimas 48 horas que la persona puede ver: los suyos o los que puede atender. */
export async function listUrgent(
  db: Db,
  userId: string,
  memberships: Membership[],
  orgId: string,
): Promise<UrgentAlertDto[]> {
  const scope = farmScope(memberships, orgId);
  const attends = canAck(memberships, orgId);
  return db.admin(async (q) => {
    const rows = await q<Row>(
      `${SQL} WHERE a.organization_id = $1 AND a.created_at > now() - interval '2 days'
        ORDER BY a.created_at DESC LIMIT 20`,
      [orgId],
    );
    const mine = rows.filter(
      (r) =>
        r.created_by === userId ||
        (attends && (scope === "ALL" || !r.farm_id || scope.includes(r.farm_id))),
    );
    const out: UrgentAlertDto[] = [];
    for (const r of mine) out.push(await toDto(q, r, orgId, userId, memberships));
    return out;
  });
}

export async function ackUrgent(
  db: Db,
  id: string,
  userId: string,
  memberships: Membership[],
): Promise<{ ok: true } | { error: "NO_EXISTE" | "SIN_ACCESO" }> {
  return db.admin(async (q) => {
    const [r] = await q<{ organization_id: string; farm_id: string | null }>(
      "SELECT organization_id, farm_id FROM urgent_alert WHERE id = $1",
      [id],
    );
    if (!r) return { error: "NO_EXISTE" as const };
    const scope = farmScope(memberships, r.organization_id);
    if (
      !canAck(memberships, r.organization_id) ||
      (r.farm_id && scope !== "ALL" && !scope.includes(r.farm_id))
    )
      return { error: "SIN_ACCESO" as const };
    await q(
      "UPDATE urgent_alert SET ack_by = $2, ack_at = now() WHERE id = $1 AND ack_at IS NULL",
      [id, userId],
    );
    return { ok: true as const };
  });
}
