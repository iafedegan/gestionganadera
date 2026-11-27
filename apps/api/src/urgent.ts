import {
  type UrgentAlertCreate,
  type UrgentAlertDto,
  type UrgentAnimalRecord,
  type UrgentMessageCreate,
  type UrgentMessageDto,
  type UrgentRecipient,
  mediaPreview,
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
  author_phone: string | null;
  reason: string;
  message: string;
  created_at: Date | string;
  ack_name: string | null;
  ack_by: string | null;
  ack_at: Date | string | null;
}

const SQL = `SELECT a.id, a.farm_id, f.name AS farm_name, a.created_by, u.display_name AS author_name, u.phone AS author_phone,
       a.animal_id, a.reason, a.message, a.created_at, k.display_name AS ack_name, a.ack_by, a.ack_at
  FROM urgent_alert a
  JOIN app_user u ON u.id = a.created_by
  LEFT JOIN farm f ON f.id = a.farm_id
  LEFT JOIN app_user k ON k.id = a.ack_by`;

const canAck = (m: Membership[], orgId: string) =>
  m.some((x) => x.organizationId === orgId && ACK.includes(x.role));

async function lastMessage(q: Q, alertId: string, userId: string) {
  const [m] = await q<{
    id: string;
    author_id: string;
    author_name: string;
    body: string | null;
    media_type: string | null;
    created_at: Date | string;
  }>(
    `SELECT m.id, m.author_id, u.display_name AS author_name, m.body, m.media_type, m.created_at
       FROM urgent_message m JOIN app_user u ON u.id = m.author_id
      WHERE m.alert_id = $1 ORDER BY m.created_at DESC LIMIT 1`,
    [alertId],
  );
  if (!m) return null;
  return {
    id: m.id,
    authorName: m.author_name,
    mine: m.author_id === userId,
    preview: m.body?.slice(0, 80) ?? mediaPreview(m.media_type),
    createdAt: iso(m.created_at),
  };
}

async function messageCount(q: Q, alertId: string): Promise<number> {
  const [n] = await q<{ n: string }>(
    "SELECT count(*) AS n FROM urgent_message WHERE alert_id = $1",
    [alertId],
  );
  return Number(n?.n ?? 0);
}

async function hasWritten(q: Q, alertId: string, userId: string): Promise<boolean> {
  const rows = await q("SELECT 1 FROM urgent_message WHERE alert_id = $1 AND author_id = $2", [
    alertId,
    userId,
  ]);
  return rows.length > 0;
}

async function toDto(
  q: Q,
  r: Row,
  orgId: string,
  userId: string,
  memberships: Membership[],
): Promise<UrgentAlertDto> {
  return {
    id: r.id,
    organizationId: orgId,
    authorId: r.created_by,
    ackById: r.ack_by,
    organizationName: memberships.find((m) => m.organizationId === orgId)?.organizationName ?? "",
    messageCount: await messageCount(q, r.id),
    lastMessage: await lastMessage(q, r.id, userId),
    animal: r.animal_id ? await animalRecord(q, r.animal_id) : null,
    farmName: r.farm_name,
    authorName: r.author_name,
    authorPhone: r.author_phone,
    reason: r.reason,
    message: r.message,
    createdAt: iso(r.created_at),
    ackBy: r.ack_name,
    attending: r.ack_by === userId,
    ackAt: r.ack_at ? iso(r.ack_at) : null,
    recipients: await recipients(q, orgId, r.farm_id),
    // Quien se sumó a un aviso ajeno lo ve como propio, salvo que sea quien lo atiende.
    mine:
      r.created_by === userId ||
      (!canAck(memberships, orgId) && (await hasWritten(q, r.id, userId))),
    canAck: canAck(memberships, orgId),
  };
}

/** Veterinarios y asesores del equipo, para tener a quién llamar aun sin señal. */
export const urgentTeam = (db: Db, orgId: string) => db.admin((q) => recipients(q, orgId, null));

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
    // Un animal tiene una sola urgencia abierta: si alguien vuelve a avisar, se suma a esa
    // (y lo que escribió queda en el chat). Sin animal, se agrupa lo de la misma persona.
    let [row] = await q<{ id: string; message: string }>(
      animalId
        ? `SELECT id, message FROM urgent_alert WHERE organization_id = $1 AND animal_id = $2
             AND ack_at IS NULL AND created_at > now() - interval '6 hours'
           ORDER BY created_at DESC LIMIT 1`
        : `SELECT id, message FROM urgent_alert WHERE organization_id = $1 AND animal_id IS NULL
             AND created_by = $2 AND farm_id IS NOT DISTINCT FROM $3::uuid
             AND ack_at IS NULL AND created_at > now() - interval '30 minutes'
           ORDER BY created_at DESC LIMIT 1`,
      animalId ? [orgId, animalId] : [orgId, userId, farmId],
    );
    if (row && input.message.trim() && input.message.trim() !== row.message.trim())
      await q("INSERT INTO urgent_message (alert_id, author_id, body) VALUES ($1,$2,$3)", [
        row.id,
        userId,
        input.message.trim().slice(0, 2000),
      ]);
    if (!row) {
      const [n] = await q<{ n: string }>(
        "SELECT count(*) AS n FROM urgent_alert WHERE organization_id = $1 AND created_at > now() - interval '1 day'",
        [orgId],
      );
      if (Number(n?.n ?? 0) >= PER_DAY) return { error: "LIMITE" as const };
      [row] = await q<{ id: string; message: string }>(
        `INSERT INTO urgent_alert (organization_id, farm_id, created_by, reason, message, animal_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, message`,
        [orgId, farmId, userId, input.reason, input.message, animalId],
      );
    }
    const [full] = await q<Row>(`${SQL} WHERE a.id = $1`, [row?.id]);
    return toDto(q, full as Row, orgId, userId, memberships);
  });
}

/** Los avisos de todas las ganaderías de la persona, según sus accesos de hoy en el servidor. */
export async function listMyUrgent(
  db: Db,
  userId: string,
  memberships: Membership[],
): Promise<UrgentAlertDto[]> {
  const orgs = [...new Set(memberships.map((m) => m.organizationId))];
  const all = await Promise.all(orgs.map((o) => listUrgent(db, userId, memberships, o)));
  return all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    // También participa quien sumó un mensaje (p. ej. al repetir el aviso de un animal).
    const wrote = new Set(
      (
        await q<{ alert_id: string }>(
          "SELECT DISTINCT alert_id FROM urgent_message WHERE author_id = $1",
          [userId],
        )
      ).map((w) => w.alert_id),
    );
    const mine = rows.filter(
      (r) =>
        r.created_by === userId ||
        wrote.has(r.id) ||
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
    // También se confirman los avisos repetidos del mismo animal.
    await q(
      `UPDATE urgent_alert SET ack_by = $2, ack_at = now()
        WHERE ack_at IS NULL AND (id = $1 OR (animal_id IS NOT NULL AND (organization_id, animal_id) =
          (SELECT organization_id, animal_id FROM urgent_alert WHERE id = $1)
          AND created_at > now() - interval '6 hours'))`,
      [id, userId],
    );
    return { ok: true as const };
  });
}

/* ───────────── Chat de la urgencia ───────────── */

type ChatFail = { error: "NO_EXISTE" | "SIN_ACCESO" | "SIN_CONFIRMAR" | "LIMITE" };
const MAX_MESSAGES = 200;
const MAX_MEDIA = 30;

/** Participan quien reportó y quienes pueden atender esa finca. */
async function chatAccess(
  q: Q,
  alertId: string,
  userId: string,
  memberships: Membership[],
): Promise<{ confirmed: boolean } | ChatFail> {
  const [r] = await q<{
    organization_id: string;
    farm_id: string | null;
    created_by: string;
    ack_by: string | null;
  }>("SELECT organization_id, farm_id, created_by, ack_by FROM urgent_alert WHERE id = $1", [
    alertId,
  ]);
  if (!r) return { error: "NO_EXISTE" };
  const member = memberships.some((m) => m.organizationId === r.organization_id);
  const scope = farmScope(memberships, r.organization_id);
  const attends =
    canAck(memberships, r.organization_id) &&
    (scope === "ALL" || !r.farm_id || scope.includes(r.farm_id));
  if (!member || !(r.created_by === userId || attends || (await hasWritten(q, alertId, userId))))
    return { error: "SIN_ACCESO" };
  return { confirmed: r.ack_by !== null };
}

export async function listMessages(
  db: Db,
  alertId: string,
  userId: string,
  memberships: Membership[],
): Promise<UrgentMessageDto[] | ChatFail> {
  return db.admin(async (q) => {
    const access = await chatAccess(q, alertId, userId, memberships);
    if ("error" in access) return access;
    const rows = await q<{
      id: string;
      author_id: string;
      author_name: string;
      body: string | null;
      media_type: string | null;
      created_at: Date | string;
    }>(
      `SELECT m.id, m.author_id, u.display_name AS author_name, m.body, m.media_type, m.created_at
         FROM urgent_message m JOIN app_user u ON u.id = m.author_id
        WHERE m.alert_id = $1 ORDER BY m.created_at`,
      [alertId],
    );
    return rows.map((m) => ({
      id: m.id,
      authorName: m.author_name,
      mine: m.author_id === userId,
      body: m.body,
      mediaType: m.media_type,
      createdAt: iso(m.created_at),
    }));
  });
}

export async function addUrgentMessage(
  db: Db,
  alertId: string,
  userId: string,
  memberships: Membership[],
  input: UrgentMessageCreate,
): Promise<{ ok: true } | ChatFail> {
  return db.admin(async (q) => {
    const access = await chatAccess(q, alertId, userId, memberships);
    // El chat existe desde el aviso: quien reporta puede mandar fotos mientras confirman.
    if ("error" in access) return access;
    const [n] = await q<{ total: string; media: string }>(
      "SELECT count(*) AS total, count(media_type) AS media FROM urgent_message WHERE alert_id = $1",
      [alertId],
    );
    if (Number(n?.total) >= MAX_MESSAGES || (input.media && Number(n?.media) >= MAX_MEDIA))
      return { error: "LIMITE" as const };
    await q(
      `INSERT INTO urgent_message (alert_id, author_id, body, media_type, media)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        alertId,
        userId,
        input.body ?? null,
        input.media?.type ?? null,
        input.media ? Buffer.from(input.media.data, "base64") : null,
      ],
    );
    return { ok: true as const };
  });
}

export async function urgentMedia(
  db: Db,
  alertId: string,
  messageId: string,
  userId: string,
  memberships: Membership[],
): Promise<{ type: string; data: Buffer } | ChatFail> {
  return db.admin(async (q) => {
    const access = await chatAccess(q, alertId, userId, memberships);
    if ("error" in access) return access;
    const [m] = await q<{ media_type: string | null; media: Uint8Array | null }>(
      "SELECT media_type, media FROM urgent_message WHERE id = $1 AND alert_id = $2",
      [messageId, alertId],
    );
    if (!m?.media || !m.media_type) return { error: "NO_EXISTE" as const };
    return { type: m.media_type, data: Buffer.from(m.media) };
  });
}
