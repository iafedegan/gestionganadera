import { createHash } from "node:crypto";
import type { Q } from "./db.js";

/** JSON con llaves ordenadas: jsonb no conserva el orden y el hash debe ser reproducible. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function digest(parts: unknown[]): string {
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
}

/** Agrega un registro encadenado por hash. Debe llamarse dentro de `tenant(..., { write: true })`. */
export async function appendAudit(q: Q, orgId: string, e: AuditEntry): Promise<void> {
  const last = await q<{ hash: string }>(
    "SELECT hash FROM audit_log WHERE organization_id = $1 ORDER BY id DESC LIMIT 1",
    [orgId],
  );
  const prev = last[0]?.hash ?? "GENESIS";
  const at = new Date().toISOString();
  const detail = e.detail ?? {};
  const hash = digest([
    prev,
    orgId,
    at,
    e.userId ?? null,
    e.action,
    e.entity ?? null,
    e.entityId ?? null,
    detail,
  ]);
  await q(
    `INSERT INTO audit_log (organization_id, at, user_id, action, entity, entity_id, detail, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      orgId,
      at,
      e.userId ?? null,
      e.action,
      e.entity ?? null,
      e.entityId ?? null,
      JSON.stringify(detail),
      prev,
      hash,
    ],
  );
}

/** Recalcula la cadena y devuelve el primer registro alterado, si existe. */
export async function verifyAuditChain(
  q: Q,
  orgId: string,
): Promise<{ ok: boolean; count: number; brokenAtId?: number }> {
  const rows = await q<{
    id: number | string;
    at: Date | string;
    user_id: string | null;
    action: string;
    entity: string | null;
    entity_id: string | null;
    detail: unknown;
    prev_hash: string;
    hash: string;
  }>("SELECT * FROM audit_log WHERE organization_id = $1 ORDER BY id", [orgId]);
  let prev = "GENESIS";
  for (const r of rows) {
    const at = r.at instanceof Date ? r.at.toISOString() : new Date(r.at).toISOString();
    const expected = digest([
      prev,
      orgId,
      at,
      r.user_id,
      r.action,
      r.entity,
      r.entity_id,
      r.detail,
    ]);
    if (r.prev_hash !== prev || r.hash !== expected) {
      return { ok: false, count: rows.length, brokenAtId: Number(r.id) };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
