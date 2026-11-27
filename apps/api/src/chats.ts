import type {
  ChatContact,
  Role,
  UrgentMessageCreate,
  UrgentMessageDto,
} from "@ganaderia/contracts";
import type { Membership } from "./auth.js";
import type { Db, Q } from "./db.js";

/**
 * Chats entre personas que comparten una ganadería. El acceso se decide en cada petición: si
 * alguien sale del equipo, la conversación deja de estar disponible.
 */

const PER_DAY = 500;
const MEDIA_PER_DAY = 40;
const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();
const orgsOf = (m: Membership[]) => [...new Set(m.map((x) => x.organizationId))];
const preview = (body: string | null, type: string | null) =>
  body?.slice(0, 80) ?? (type?.startsWith("video/") ? "Video" : "Foto");

/** Quienes tienen acceso vigente a alguna de las ganaderías de la persona. */
const PEOPLE = `SELECT u.id, u.display_name, u.avatar, m.role, o.name AS organization_name
    FROM membership m
    JOIN app_user u ON u.id = m.user_id
    JOIN organization o ON o.id = m.organization_id
   WHERE m.organization_id = ANY($1) AND u.id <> $2 AND u.disabled_at IS NULL
     AND (m.valid_until IS NULL OR m.valid_until > now())`;

export async function listContacts(
  db: Db,
  userId: string,
  memberships: Membership[],
): Promise<ChatContact[]> {
  const orgs = orgsOf(memberships);
  if (orgs.length === 0) return [];
  return db.admin(async (q) => {
    const people = await q<{
      id: string;
      display_name: string;
      avatar: string | null;
      role: Role;
      organization_name: string;
    }>(`${PEOPLE} ORDER BY u.display_name, o.name`, [orgs, userId]);
    const last = await q<{
      id: string;
      other: string;
      mine: boolean;
      body: string | null;
      media_type: string | null;
      created_at: Date | string;
    }>(
      `SELECT DISTINCT ON (other) * FROM (
         SELECT id, CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other,
                sender_id = $1 AS mine, body, media_type, created_at
           FROM direct_message WHERE sender_id = $1 OR recipient_id = $1) t
        ORDER BY other, created_at DESC`,
      [userId],
    );
    const unread = await q<{ sender_id: string; n: string }>(
      `SELECT sender_id, count(*) AS n FROM direct_message
        WHERE recipient_id = $1 AND read_at IS NULL GROUP BY sender_id`,
      [userId],
    );
    const out = new Map<string, ChatContact>();
    for (const p of people) {
      if (out.has(p.id)) continue;
      const m = last.find((x) => x.other === p.id);
      out.set(p.id, {
        userId: p.id,
        name: p.display_name,
        avatar: p.avatar,
        role: p.role,
        organizationName: p.organization_name,
        unread: Number(unread.find((x) => x.sender_id === p.id)?.n ?? 0),
        lastMessage: m
          ? {
              id: m.id,
              mine: m.mine,
              preview: preview(m.body, m.media_type),
              createdAt: iso(m.created_at),
            }
          : null,
      });
    }
    return [...out.values()];
  });
}

async function shares(q: Q, memberships: Membership[], userId: string, other: string) {
  const rows = await q(`SELECT 1 FROM (${PEOPLE}) p WHERE p.id = $3 LIMIT 1`, [
    orgsOf(memberships),
    userId,
    other,
  ]);
  return rows.length > 0;
}

type Fail = { error: "SIN_ACCESO" | "NO_EXISTE" | "LIMITE" };

/** La conversación (los últimos 200 mensajes). Al leerla, lo recibido queda leído. */
export async function listDirect(
  db: Db,
  userId: string,
  memberships: Membership[],
  other: string,
): Promise<UrgentMessageDto[] | Fail> {
  return db.admin(async (q) => {
    if (!(await shares(q, memberships, userId, other))) return { error: "SIN_ACCESO" as const };
    await q(
      `UPDATE direct_message SET read_at = now()
        WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [userId, other],
    );
    const rows = await q<{
      id: string;
      sender_id: string;
      author_name: string;
      body: string | null;
      media_type: string | null;
      created_at: Date | string;
    }>(
      `SELECT m.id, m.sender_id, u.display_name AS author_name, m.body, m.media_type, m.created_at
         FROM direct_message m JOIN app_user u ON u.id = m.sender_id
        WHERE (m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1)
        ORDER BY m.created_at DESC LIMIT 200`,
      [userId, other],
    );
    return rows.reverse().map((m) => ({
      id: m.id,
      authorName: m.author_name,
      mine: m.sender_id === userId,
      body: m.body,
      mediaType: m.media_type,
      createdAt: iso(m.created_at),
    }));
  });
}

export async function sendDirect(
  db: Db,
  userId: string,
  memberships: Membership[],
  other: string,
  input: UrgentMessageCreate,
): Promise<{ ok: true } | Fail> {
  return db.admin(async (q) => {
    if (!(await shares(q, memberships, userId, other))) return { error: "SIN_ACCESO" as const };
    const [n] = await q<{ total: string; media: string }>(
      `SELECT count(*) AS total, count(media_type) AS media FROM direct_message
        WHERE sender_id = $1 AND created_at > now() - interval '1 day'`,
      [userId],
    );
    if (Number(n?.total) >= PER_DAY || (input.media && Number(n?.media) >= MEDIA_PER_DAY))
      return { error: "LIMITE" as const };
    await q(
      `INSERT INTO direct_message (sender_id, recipient_id, body, media_type, media)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        userId,
        other,
        input.body ?? null,
        input.media?.type ?? null,
        input.media ? Buffer.from(input.media.data, "base64") : null,
      ],
    );
    return { ok: true as const };
  });
}

export async function directMedia(
  db: Db,
  userId: string,
  memberships: Membership[],
  other: string,
  messageId: string,
): Promise<{ type: string; data: Buffer } | Fail> {
  return db.admin(async (q) => {
    if (!(await shares(q, memberships, userId, other))) return { error: "SIN_ACCESO" as const };
    const [m] = await q<{ media_type: string | null; media: Uint8Array | null }>(
      `SELECT media_type, media FROM direct_message WHERE id = $1 AND
        ((sender_id = $2 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $2))`,
      [messageId, userId, other],
    );
    if (!m?.media || !m.media_type) return { error: "NO_EXISTE" as const };
    return { type: m.media_type, data: Buffer.from(m.media) };
  });
}
