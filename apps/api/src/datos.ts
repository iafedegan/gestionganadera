import {
  DATA_CONSENT_VERSION,
  type DataConsentDto,
  type DataConsentInput,
  type DataConsentState,
  type DataRequestDto,
  type DataRequestInput,
  type MembershipDto,
} from "@ganaderia/contracts";
import type { Db } from "./db.js";

/**
 * Protocolo de datos del productor (Plan CTeI 2026–2030, §6.2.6): consentimiento informado,
 * acceso a los datos propios y solicitudes de rectificación o supresión (Ley 1581 de 2012).
 */

const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();

interface ConsentRow {
  version: string;
  sector_analysis: boolean;
  share_technical: boolean;
  accepted_at: Date | string;
}

export async function getConsent(db: Db, userId: string): Promise<DataConsentState> {
  const [row] = await db.admin((q) =>
    q<ConsentRow>(
      `SELECT version, sector_analysis, share_technical, accepted_at FROM data_consent
        WHERE user_id = $1 ORDER BY accepted_at DESC, id DESC LIMIT 1`,
      [userId],
    ),
  );
  const consent: DataConsentDto | null = row
    ? {
        version: row.version,
        sectorAnalysis: row.sector_analysis,
        shareTechnical: row.share_technical,
        acceptedAt: iso(row.accepted_at),
      }
    : null;
  return {
    currentVersion: DATA_CONSENT_VERSION,
    consent,
    required: !consent || consent.version !== DATA_CONSENT_VERSION,
  };
}

/** Guarda el consentimiento (cada cambio queda en el historial). Solo acepta la versión vigente. */
export async function saveConsent(
  db: Db,
  userId: string,
  input: DataConsentInput,
): Promise<DataConsentState | { error: "VERSION" }> {
  if (input.version !== DATA_CONSENT_VERSION) return { error: "VERSION" };
  await db.admin((q) =>
    q(
      "INSERT INTO data_consent (user_id, version, sector_analysis, share_technical) VALUES ($1,$2,$3,$4)",
      [userId, input.version, input.sectorAnalysis, input.shareTechnical],
    ),
  );
  return getConsent(db, userId);
}

interface RequestRow {
  id: string;
  kind: DataRequestDto["kind"];
  message: string;
  status: DataRequestDto["status"];
  created_at: Date | string;
}

const toRequest = (r: RequestRow): DataRequestDto => ({
  id: r.id,
  kind: r.kind,
  message: r.message,
  status: r.status,
  createdAt: iso(r.created_at),
});

export async function listRequests(db: Db, userId: string): Promise<DataRequestDto[]> {
  const rows = await db.admin((q) =>
    q<RequestRow>(
      "SELECT id, kind, message, status, created_at FROM data_request WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId],
    ),
  );
  return rows.map(toRequest);
}

/** Máximo de solicitudes por persona en 24 horas (evita abuso del canal). */
export const REQUESTS_PER_DAY = 5;

export async function addRequest(
  db: Db,
  userId: string,
  input: DataRequestInput,
): Promise<DataRequestDto | { error: "LIMITE" }> {
  return db.admin(async (q) => {
    const [c] = await q<{ n: number | string }>(
      "SELECT count(*) AS n FROM data_request WHERE user_id = $1 AND created_at > now() - interval '1 day'",
      [userId],
    );
    if (Number(c?.n ?? 0) >= REQUESTS_PER_DAY) return { error: "LIMITE" as const };
    const [row] = await q<RequestRow>(
      "INSERT INTO data_request (user_id, kind, message) VALUES ($1,$2,$3) RETURNING id, kind, message, status, created_at",
      [userId, input.kind, input.message],
    );
    return toRequest(row as RequestRow);
  });
}

/** Tablas de la organización que se entregan cuando la persona es dueña o administradora. */
const ORG_TABLES = [
  "farm",
  "animal",
  "animal_event",
  "supply",
  "stock_movement",
  "farm_map",
] as const;
const OWNER_ROLES = new Set(["propietario", "admin_entidad"]);

/**
 * Todo lo que el sistema guarda de la persona: su cuenta, sus consentimientos y solicitudes, sus
 * publicaciones en la comunidad y, de las ganaderías que administra, la finca, el hato, los
 * eventos, los insumos y el mapa. Nunca incluye contraseñas ni sesiones.
 */
export async function exportData(
  db: Db,
  user: { id: string; email: string; displayName: string },
  memberships: MembershipDto[],
) {
  const personal = await db.admin(async (q) => ({
    consentimientos: await q(
      "SELECT version, sector_analysis, share_technical, accepted_at FROM data_consent WHERE user_id = $1 ORDER BY accepted_at",
      [user.id],
    ),
    solicitudes: await q(
      "SELECT kind, message, status, created_at FROM data_request WHERE user_id = $1 ORDER BY created_at",
      [user.id],
    ),
    comunidad: {
      publicaciones: await q(
        "SELECT topic, title, body, created_at FROM community_post WHERE author_id = $1 ORDER BY created_at",
        [user.id],
      ),
      respuestas: await q(
        "SELECT post_id, body, created_at FROM community_reply WHERE author_id = $1 ORDER BY created_at",
        [user.id],
      ),
    },
  }));

  const ganaderias = [];
  for (const m of memberships) {
    if (!OWNER_ROLES.has(m.role)) {
      ganaderias.push({ organizacion: m.organizationName, rol: m.role, datos: null });
      continue;
    }
    const [org] = await db.admin((q) =>
      q("SELECT name, department, profile, profile_updated_at FROM organization WHERE id = $1", [
        m.organizationId,
      ]),
    );
    const datos: Record<string, unknown[]> = {};
    await db.tenant(m.organizationId, async (q) => {
      for (const t of ORG_TABLES)
        datos[t] = await q(`SELECT * FROM ${t} WHERE organization_id = $1`, [m.organizationId]);
    });
    ganaderias.push({ organizacion: org ?? { name: m.organizationName }, rol: m.role, datos });
  }

  return {
    generado: new Date().toISOString(),
    nota: "Copia de sus datos en GanSmart (Ley 1581 de 2012). Guárdela en un lugar seguro: contiene información de su finca.",
    cuenta: { correo: user.email, nombre: user.displayName },
    ...personal,
    ganaderias,
  };
}
