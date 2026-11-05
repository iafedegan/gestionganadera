import { createHash, randomBytes } from "node:crypto";
import type {
  InvitationCreate,
  InvitationDto,
  InvitationPreview,
  InviteRole,
  Role,
  TeamDto,
} from "@ganaderia/contracts";
import { appendAudit } from "./audit.js";
import type { AuthUser } from "./auth.js";
import type { Db, Q } from "./db.js";

const INVITE_DAYS = 7;
// Sin 0/O ni 1/I/L: el código se dicta por teléfono o se escribe a mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Normaliza lo que escribe la persona: mayúsculas y sin guiones ni espacios. */
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

function newCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function invitationDto(r: Record<string, unknown>): InvitationDto {
  const accessDays = r.access_days as number | null;
  const created = r.created_at as Date;
  return {
    id: r.id as string,
    role: r.role as InviteRole,
    label: r.label as string,
    farmId: (r.farm_id as string | null) ?? null,
    accessUntil: accessDays
      ? new Date(
          ((r.accepted_at as Date | null) ?? created).getTime() + accessDays * 864e5,
        ).toISOString()
      : null,
    expiresAt: (r.expires_at as Date).toISOString(),
    createdAt: created.toISOString(),
    acceptedAt: r.accepted_at ? (r.accepted_at as Date).toISOString() : null,
    acceptedBy: (r.accepted_name as string | null) ?? null,
  };
}

export async function getTeam(db: Db, orgId: string, me: string): Promise<TeamDto> {
  return db.admin(async (q) => {
    const members = await q<{
      id: string;
      user_id: string;
      display_name: string;
      email: string;
      role: Role;
      farm_id: string | null;
      valid_until: Date | null;
    }>(
      `SELECT m.id, m.user_id, u.display_name, u.email, m.role, m.farm_id, m.valid_until
         FROM membership m JOIN app_user u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND (m.valid_until IS NULL OR m.valid_until > now())
        ORDER BY (m.role = 'propietario') DESC, u.display_name`,
      [orgId],
    );
    const invitations = await q(
      `SELECT i.*, u.display_name AS accepted_name FROM invitation i
         LEFT JOIN app_user u ON u.id = i.accepted_by
        WHERE i.organization_id = $1 AND i.revoked_at IS NULL
          AND (i.accepted_at IS NOT NULL OR i.expires_at > now())
        ORDER BY i.created_at DESC LIMIT 50`,
      [orgId],
    );
    return {
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.user_id,
        displayName: m.display_name,
        email: m.email,
        role: m.role,
        farmId: m.farm_id,
        validUntil: m.valid_until ? m.valid_until.toISOString() : null,
        isMe: m.user_id === me,
      })),
      invitations: invitations.filter((i) => !i.accepted_at).map(invitationDto),
    };
  });
}

export type CreateInvitationResult =
  | { ok: true; code: string; invitation: InvitationDto }
  | { ok: false; reason: "finca" };

export async function createInvitation(
  db: Db,
  user: AuthUser,
  input: InvitationCreate,
): Promise<CreateInvitationResult> {
  const code = newCode();
  const row = await db.admin(async (q) => {
    if (input.farmId) {
      const f = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
        input.farmId,
        input.organizationId,
      ]);
      if (f.length === 0) return null;
    }
    const [r] = await q(
      `INSERT INTO invitation (organization_id, code_hash, role, farm_id, label, access_days, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval, $8) RETURNING *`,
      [
        input.organizationId,
        sha256(normalizeCode(code)),
        input.role,
        input.farmId ?? null,
        input.label,
        input.accessDays ?? null,
        String(INVITE_DAYS),
        user.id,
      ],
    );
    return r ?? null;
  });
  if (!row) return { ok: false, reason: "finca" };
  await db.tenant(
    input.organizationId,
    (q) =>
      appendAudit(q, input.organizationId, {
        userId: user.id,
        action: "team.invite",
        entity: "invitation",
        entityId: row.id as string,
        detail: { role: input.role, label: input.label, accessDays: input.accessDays ?? null },
      }),
    { write: true },
  );
  return { ok: true, code, invitation: invitationDto(row) };
}

export async function revokeInvitation(
  db: Db,
  user: AuthUser,
  orgId: string,
  id: string,
): Promise<boolean> {
  const rows = await db.admin((q) =>
    q(
      "UPDATE invitation SET revoked_at = now() WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
      [id, orgId],
    ),
  );
  if (rows.length === 0) return false;
  await db.tenant(
    orgId,
    (q) =>
      appendAudit(q, orgId, {
        userId: user.id,
        action: "team.invite_revoke",
        entity: "invitation",
        entityId: id,
      }),
    { write: true },
  );
  return true;
}

export type RemoveResult = { ok: true } | { ok: false; reason: "no_existe" | "propietario" | "yo" };

/** Quita el acceso de una persona. Nadie se quita a sí mismo y el propietario no se puede retirar. */
export async function removeMember(
  db: Db,
  user: AuthUser,
  orgId: string,
  membershipId: string,
): Promise<RemoveResult> {
  const res = await db.admin(async (q): Promise<RemoveResult> => {
    const [m] = await q<{ user_id: string; role: Role }>(
      "SELECT user_id, role FROM membership WHERE id = $1 AND organization_id = $2",
      [membershipId, orgId],
    );
    if (!m) return { ok: false, reason: "no_existe" };
    if (m.user_id === user.id) return { ok: false, reason: "yo" };
    if (m.role === "propietario") return { ok: false, reason: "propietario" };
    // La membresía vence ahora: la persona pierde el acceso en su próxima petición.
    await q("UPDATE membership SET valid_until = now() WHERE id = $1", [membershipId]);
    return { ok: true };
  });
  if (res.ok) {
    await db.tenant(
      orgId,
      (q) =>
        appendAudit(q, orgId, {
          userId: user.id,
          action: "team.remove",
          entity: "membership",
          entityId: membershipId,
        }),
      { write: true },
    );
  }
  return res;
}

interface FoundInvitation {
  id: string;
  organization_id: string;
  organization_name: string;
  role: InviteRole;
  farm_id: string | null;
  label: string;
  access_days: number | null;
}

async function findValid(q: Q, code: string): Promise<FoundInvitation | null> {
  const [r] = await q<FoundInvitation>(
    `SELECT i.id, i.organization_id, o.name AS organization_name, i.role, i.farm_id, i.label, i.access_days
       FROM invitation i JOIN organization o ON o.id = i.organization_id
      WHERE i.code_hash = $1 AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at > now()`,
    [sha256(normalizeCode(code))],
  );
  return r ?? null;
}

export async function previewInvitation(db: Db, code: string): Promise<InvitationPreview | null> {
  const r = await db.admin((q) => findValid(q, code));
  if (!r) return null;
  return {
    organizationName: r.organization_name,
    role: r.role,
    label: r.label,
    accessUntil: r.access_days ? new Date(Date.now() + r.access_days * 864e5).toISOString() : null,
  };
}

/**
 * Consume la invitación dentro de la transacción `q`: crea la membresía con su vigencia y la
 * marca como aceptada. Devuelve la organización o null si el código no sirve.
 */
export async function consumeInvitation(
  q: Q,
  code: string,
  userId: string,
): Promise<string | null> {
  const inv = await findValid(q, code);
  if (!inv) return null;
  // Bloquea la fila: dos personas no pueden aceptar el mismo código a la vez.
  const locked = await q(
    "UPDATE invitation SET accepted_by = $2, accepted_at = now() WHERE id = $1 AND accepted_at IS NULL RETURNING id",
    [inv.id, userId],
  );
  if (locked.length === 0) return null;
  const exists = await q(
    "SELECT id FROM membership WHERE user_id = $1 AND organization_id = $2 AND COALESCE(farm_id, '00000000-0000-0000-0000-000000000000') = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')",
    [userId, inv.organization_id, inv.farm_id],
  );
  const validUntil = inv.access_days ? new Date(Date.now() + inv.access_days * 864e5) : null;
  if (exists[0]) {
    await q("UPDATE membership SET role = $2, valid_until = $3 WHERE id = $1", [
      exists[0].id,
      inv.role,
      validUntil,
    ]);
  } else {
    await q(
      "INSERT INTO membership (user_id, organization_id, role, farm_id, valid_until) VALUES ($1,$2,$3,$4,$5)",
      [userId, inv.organization_id, inv.role, inv.farm_id, validUntil],
    );
  }
  return inv.organization_id;
}

export async function acceptInvitation(
  db: Db,
  user: AuthUser,
  code: string,
): Promise<string | null> {
  const orgId = await db.admin((q) => consumeInvitation(q, code, user.id));
  if (orgId) {
    await db.tenant(
      orgId,
      (q) =>
        appendAudit(q, orgId, {
          userId: user.id,
          action: "team.join",
          entity: "user",
          entityId: user.id,
        }),
      { write: true },
    );
  }
  return orgId;
}
