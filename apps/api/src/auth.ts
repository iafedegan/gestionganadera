import { createHash, randomBytes } from "node:crypto";
import type { MembershipDto, Role, SessionDto } from "@ganaderia/contracts";
import { type Permission, can } from "@ganaderia/domain";
import { type Algorithm, hash, verify } from "@node-rs/argon2";
import { appendAudit } from "./audit.js";
import type { Db, Q } from "./db.js";

const SESSION_HOURS = 12;
export const OFFLINE_LEASE_HOURS = 72;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Parámetros recomendados por OWASP para Argon2id (19 MiB, 2 iteraciones, 1 hilo).
// `Algorithm` es un const enum ambiente: con verbatimModuleSyntax se usa su valor (2 = Argon2id).
const ARGON = { algorithm: 2 as Algorithm, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, ARGON);

let dummyHash: Promise<string> | undefined;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface Membership extends MembershipDto {
  validUntil: string | null;
}

/** Bloqueo por intentos fallidos. En memoria: con varias instancias debe pasar a almacén compartido. */
export class LoginThrottle {
  private readonly state = new Map<string, { fails: number; lockedUntil: number }>();
  isLocked(key: string, now = Date.now()): boolean {
    return (this.state.get(key)?.lockedUntil ?? 0) > now;
  }
  fail(key: string, now = Date.now()): void {
    const s = this.state.get(key) ?? { fails: 0, lockedUntil: 0 };
    s.fails += 1;
    if (s.fails >= MAX_FAILS) {
      s.lockedUntil = now + LOCK_MS;
      s.fails = 0;
    }
    this.state.set(key, s);
  }
  reset(key: string): void {
    this.state.delete(key);
  }
}

async function loadMemberships(q: Q, userId: string): Promise<Membership[]> {
  const rows = await q<{
    organization_id: string;
    name: string;
    role: Role;
    farm_id: string | null;
    valid_until: Date | null;
  }>(
    `SELECT m.organization_id, o.name, m.role, m.farm_id, m.valid_until
       FROM membership m JOIN organization o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND (m.valid_until IS NULL OR m.valid_until > now())
      ORDER BY o.name`,
    [userId],
  );
  return rows.map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.name,
    role: r.role,
    farmId: r.farm_id,
    validUntil: r.valid_until ? r.valid_until.toISOString() : null,
  }));
}

export function toSessionDto(user: AuthUser, memberships: Membership[]): SessionDto {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    memberships: memberships.map(({ validUntil: _v, ...m }) => m),
    offlineLeaseUntil: new Date(Date.now() + OFFLINE_LEASE_HOURS * 3_600_000).toISOString(),
  };
}

export type LoginResult =
  | { ok: true; token: string; user: AuthUser; memberships: Membership[] }
  | { ok: false; reason: "credenciales" | "bloqueado" };

export async function login(
  db: Db,
  throttle: LoginThrottle,
  email: string,
  password: string,
  userAgent: string | undefined,
): Promise<LoginResult> {
  if (throttle.isLocked(email)) return { ok: false, reason: "bloqueado" };

  const found = await db.admin((q) =>
    q<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      disabled_at: Date | null;
    }>(
      "SELECT id, email, display_name, password_hash, disabled_at FROM app_user WHERE email = $1",
      [email],
    ),
  );
  const row = found[0];
  // Se verifica siempre contra un hash para no revelar por tiempo si el usuario existe.
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const valid = await verify(row?.password_hash ?? (await dummyHash), password).catch(() => false);
  if (!row || !valid || row.disabled_at) {
    throttle.fail(email);
    return { ok: false, reason: "credenciales" };
  }
  throttle.reset(email);

  const token = randomBytes(32).toString("base64url");
  const memberships = await db.admin(async (q) => {
    await q(
      "INSERT INTO session (token_hash, user_id, expires_at, user_agent) VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4)",
      [sha256(token), row.id, String(SESSION_HOURS), userAgent?.slice(0, 300) ?? null],
    );
    return loadMemberships(q, row.id);
  });
  for (const m of memberships) {
    await db.tenant(
      m.organizationId,
      (q) => appendAudit(q, m.organizationId, { userId: row.id, action: "auth.login" }),
      { write: true },
    );
  }
  return {
    ok: true,
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name },
    memberships,
  };
}

export async function resolveSession(
  db: Db,
  token: string | undefined,
): Promise<{ user: AuthUser; memberships: Membership[] } | null> {
  if (!token) return null;
  return db.admin(async (q) => {
    const rows = await q<{ id: string; email: string; display_name: string }>(
      `SELECT u.id, u.email, u.display_name
         FROM session s JOIN app_user u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.disabled_at IS NULL`,
      [sha256(token)],
    );
    const u = rows[0];
    if (!u) return null;
    return {
      user: { id: u.id, email: u.email, displayName: u.display_name },
      memberships: await loadMemberships(q, u.id),
    };
  });
}

export async function logout(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.admin((q) =>
    q("UPDATE session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [
      sha256(token),
    ]),
  );
}

/** Revoca todas las sesiones de un usuario (p. ej., al retirar su acceso). */
export async function revokeUserSessions(db: Db, userId: string): Promise<void> {
  await db.admin((q) =>
    q("UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]),
  );
}

/** Membresías que otorgan `permission` en la organización; `farmId` null = alcance de toda la organización. */
export function grants(
  memberships: Membership[],
  orgId: string,
  permission: Permission,
  farmId: string | null,
): boolean {
  return memberships.some(
    (m) =>
      m.organizationId === orgId &&
      can(m.role, permission) &&
      (m.farmId === null || (farmId !== null && m.farmId === farmId)),
  );
}

/** Fincas visibles para el usuario en una organización: "ALL" o la lista explícita. */
export function farmScope(memberships: Membership[], orgId: string): "ALL" | string[] {
  const mine = memberships.filter((m) => m.organizationId === orgId && can(m.role, "farm.read"));
  if (mine.some((m) => m.farmId === null)) return "ALL";
  return [...new Set(mine.flatMap((m) => (m.farmId ? [m.farmId] : [])))].sort();
}

export const scopeHash = (scope: "ALL" | string[]) =>
  sha256(scope === "ALL" ? "ALL" : scope.join(",")).slice(0, 16);
