import type {
  ExtensionIndicators,
  ExtensionSummaryDto,
  FieldVerificationCreate,
  FieldVerificationDto,
  MembershipDto,
  RecommendationCreate,
  RecommendationDto,
  RecommendationStatus,
  StaffDto,
  StaffInboxDto,
  StaffOrgDto,
  TechCaseCreate,
  TechCaseDto,
  TechCaseThreadDto,
  TechMessageDto,
} from "@ganaderia/contracts";
import type { Db, Q } from "./db.js";

/**
 * Extensión híbrida con adopción verificada (Plan CTeI 2026–2030, §6.1.1 y apuesta 2).
 *
 * Quién ve qué:
 * - Los miembros de una ganadería ven sus consultas, recomendaciones y verificaciones.
 * - El Secretario Técnico ve las de las ganaderías de los departamentos de su TECNIG@N, solo si
 *   el dueño (o un administrador) autorizó compartir el expediente en «Mis datos».
 * Todo se decide aquí: las tablas no tienen acceso por API pública.
 */

export type Access = { kind: "member" } | { kind: "staff"; staff: StaffDto };
export type Fail = { error: "SIN_ACCESO" | "NO_EXISTE" | "COMPARTIR_REQUERIDO" | "ESTADO" };

const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();
const isoOrNull = (v: Date | string | null) => (v ? iso(v) : null);
const day = (v: Date | string | null) => (v ? iso(v).slice(0, 10) : null);
const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/* ───────────── Personal del gremio y autorización del dueño ───────────── */

export async function getStaff(db: Db, userId: string): Promise<StaffDto | null> {
  const [r] = await db.admin((q) =>
    q<{ role: "secretario_tecnico"; tecnigan: string; departments: string[] }>(
      "SELECT role, tecnigan, departments FROM gremio_staff WHERE user_id = $1 AND active",
      [userId],
    ),
  );
  return r ? { role: r.role, tecnigan: r.tecnigan, departments: r.departments } : null;
}

/** El dueño o un administrador de la ganadería tiene vigente «compartir con el técnico». */
async function orgShares(q: Q, orgId: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM membership m
       JOIN LATERAL (
         SELECT share_technical FROM data_consent c
          WHERE c.user_id = m.user_id ORDER BY c.accepted_at DESC, c.id DESC LIMIT 1
       ) c ON true
      WHERE m.organization_id = $1 AND m.role IN ('propietario','admin_entidad') AND c.share_technical
     ) AS ok`,
    [orgId],
  );
  return r?.ok === true;
}

async function orgRow(q: Q, orgId: string) {
  const [o] = await q<{ name: string; department: string | null; municipality: string | null }>(
    "SELECT name, department, municipality FROM organization WHERE id = $1",
    [orgId],
  );
  return o ?? null;
}

const inRegion = (staff: StaffDto, department: string | null) =>
  staff.departments.some((d) => norm(d) === norm(department));

/** Acceso de la persona a una ganadería: miembro, o Secretario Técnico autorizado de su región. */
export async function accessTo(
  db: Db,
  user: { id: string },
  memberships: MembershipDto[],
  orgId: string,
): Promise<Access | Fail> {
  if (memberships.some((m) => m.organizationId === orgId)) return { kind: "member" };
  const staff = await getStaff(db, user.id);
  if (!staff) return { error: "SIN_ACCESO" };
  return db.admin(async (q) => {
    const o = await orgRow(q, orgId);
    if (!o || !inRegion(staff, o.department)) return { error: "SIN_ACCESO" as const };
    if (!(await orgShares(q, orgId))) return { error: "SIN_ACCESO" as const };
    return { kind: "staff" as const, staff };
  });
}

/** TECNIG@N que atiende el departamento de la ganadería, si está en la plataforma. */
async function tecniganFor(q: Q, department: string | null): Promise<string | null> {
  if (!department) return null;
  const rows = await q<{ tecnigan: string; departments: string[] }>(
    "SELECT tecnigan, departments FROM gremio_staff WHERE active",
  );
  return (
    rows.find((r) => r.departments.some((d) => norm(d) === norm(department)))?.tecnigan ?? null
  );
}

/* ───────────── Lectura ───────────── */

interface CaseRow {
  id: string;
  organization_id: string;
  organization_name: string;
  farm_id: string | null;
  topic: TechCaseDto["topic"];
  question: string;
  ai_answer: string | null;
  status: TechCaseDto["status"];
  author_name: string;
  messages: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}
const CASE_SQL = `SELECT c.id, c.organization_id, o.name AS organization_name, c.farm_id, c.topic, c.question,
       c.ai_answer, c.status, u.display_name AS author_name, c.created_at, c.updated_at,
       (SELECT count(*) FROM tech_message m WHERE m.case_id = c.id) AS messages
  FROM tech_case c JOIN organization o ON o.id = c.organization_id JOIN app_user u ON u.id = c.created_by`;
const toCase = (r: CaseRow): TechCaseDto => ({
  id: r.id,
  organizationId: r.organization_id,
  organizationName: r.organization_name,
  farmId: r.farm_id,
  topic: r.topic,
  question: r.question,
  aiAnswer: r.ai_answer,
  status: r.status,
  authorName: r.author_name,
  messages: Number(r.messages),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

interface RecoRow {
  id: string;
  organization_id: string;
  organization_name: string;
  farm_id: string | null;
  case_id: string | null;
  from_staff: boolean;
  author_name: string;
  topic: RecommendationDto["topic"];
  title: string;
  detail: string;
  indicator: RecommendationDto["indicator"];
  due_on: Date | string | null;
  status: RecommendationStatus;
  adopted_at: Date | string | null;
  verified_at: Date | string | null;
  verification_note: string | null;
  created_at: Date | string;
}
const RECO_SQL = `SELECT r.id, r.organization_id, o.name AS organization_name, r.farm_id, r.case_id, r.from_staff,
       u.display_name AS author_name, r.topic, r.title, r.detail, r.indicator, r.due_on, r.status,
       r.adopted_at, r.verified_at, r.verification_note, r.created_at
  FROM recommendation r JOIN organization o ON o.id = r.organization_id JOIN app_user u ON u.id = r.author_id`;
const toReco = (r: RecoRow): RecommendationDto => ({
  id: r.id,
  organizationId: r.organization_id,
  organizationName: r.organization_name,
  farmId: r.farm_id,
  caseId: r.case_id,
  fromStaff: r.from_staff,
  authorName: r.author_name,
  topic: r.topic,
  title: r.title,
  detail: r.detail,
  indicator: r.indicator,
  dueOn: day(r.due_on),
  status: r.status,
  adoptedAt: isoOrNull(r.adopted_at),
  verifiedAt: isoOrNull(r.verified_at),
  verificationNote: r.verification_note,
  createdAt: iso(r.created_at),
});

interface VerifRow {
  id: string;
  organization_id: string;
  farm_id: string;
  visited_on: Date | string;
  note: string;
  verifier_name: string;
}
const toVerif = (r: VerifRow): FieldVerificationDto => ({
  id: r.id,
  organizationId: r.organization_id,
  farmId: r.farm_id,
  visitedOn: day(r.visited_on) as string,
  note: r.note,
  verifierName: r.verifier_name,
});

/** Indicadores de la extensión para un conjunto de ganaderías (últimos 12 meses en consultas). */
async function indicatorsFor(q: Q, orgIds: string[]): Promise<ExtensionIndicators> {
  if (orgIds.length === 0)
    return {
      recommendations: 0,
      adopted: 0,
      verified: 0,
      verifiedAdoptionRate: null,
      aiQuestions: 0,
      escalated: 0,
      firstLevelRate: null,
      secondLevelAttentions: 0,
    };
  const [r] = await q<{ total: string; adopted: string; verified: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE status = 'adoptada') AS adopted,
            count(*) FILTER (WHERE verified_at IS NOT NULL) AS verified
       FROM recommendation WHERE organization_id = ANY($1::uuid[])`,
    [orgIds],
  );
  const [ai] = await q<{ n: string | null }>(
    "SELECT sum(questions) AS n FROM assistant_usage WHERE organization_id = ANY($1::uuid[]) AND day > current_date - 365",
    [orgIds],
  );
  const [c] = await q<{ n: string }>(
    "SELECT count(*) AS n FROM tech_case WHERE organization_id = ANY($1::uuid[]) AND created_at > now() - interval '365 days'",
    [orgIds],
  );
  const [m] = await q<{ n: string }>(
    `SELECT count(*) AS n FROM tech_message m JOIN tech_case c ON c.id = m.case_id
      WHERE c.organization_id = ANY($1::uuid[]) AND m.from_staff AND m.created_at > now() - interval '365 days'`,
    [orgIds],
  );
  const total = Number(r?.total ?? 0);
  const verified = Number(r?.verified ?? 0);
  const aiQuestions = Number(ai?.n ?? 0);
  const escalated = Number(c?.n ?? 0);
  return {
    recommendations: total,
    adopted: Number(r?.adopted ?? 0),
    verified,
    verifiedAdoptionRate: total ? Math.round((verified / total) * 100) : null,
    aiQuestions,
    escalated,
    firstLevelRate: aiQuestions
      ? Math.max(0, Math.min(100, Math.round((1 - escalated / aiQuestions) * 100)))
      : null,
    secondLevelAttentions: Number(m?.n ?? 0),
  };
}

/** Lo que ve una ganadería: autorización, consultas, recomendaciones, verificaciones e indicadores. */
export async function orgSummary(db: Db, orgId: string): Promise<ExtensionSummaryDto> {
  return db.admin(async (q) => {
    const o = await orgRow(q, orgId);
    const cases = await q<CaseRow>(
      `${CASE_SQL} WHERE c.organization_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
      [orgId],
    );
    const recos = await q<RecoRow>(
      `${RECO_SQL} WHERE r.organization_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
      [orgId],
    );
    const verifs = await q<VerifRow>(
      `SELECT v.id, v.organization_id, v.farm_id, v.visited_on, v.note, u.display_name AS verifier_name
         FROM field_verification v JOIN app_user u ON u.id = v.verified_by
        WHERE v.organization_id = $1 ORDER BY v.visited_on DESC`,
      [orgId],
    );
    return {
      shares: await orgShares(q, orgId),
      tecnigan: await tecniganFor(q, o?.department ?? null),
      cases: cases.map(toCase),
      recommendations: recos.map(toReco),
      verifications: verifs.map(toVerif),
      indicators: await indicatorsFor(q, [orgId]),
    };
  });
}

/** Ganaderías de la región del Secretario Técnico que autorizaron compartir. */
async function regionOrgs(q: Q, staff: StaffDto) {
  const all = await q<{
    id: string;
    name: string;
    department: string | null;
    municipality: string | null;
  }>("SELECT id, name, department, municipality FROM organization WHERE department IS NOT NULL");
  const out = [];
  for (const o of all) if (inRegion(staff, o.department) && (await orgShares(q, o.id))) out.push(o);
  return out;
}

export async function staffInbox(db: Db, staff: StaffDto): Promise<StaffInboxDto> {
  const orgs = await db.admin((q) => regionOrgs(q, staff));
  const ids = orgs.map((o) => o.id);
  const organizations: StaffOrgDto[] = [];
  for (const o of orgs) {
    const verifs = await db.admin((q) =>
      q<{ farm_id: string; visited_on: Date | string }>(
        "SELECT DISTINCT ON (farm_id) farm_id, visited_on FROM field_verification WHERE organization_id = $1 ORDER BY farm_id, visited_on DESC",
        [o.id],
      ),
    );
    const farms = await db.tenant(o.id, async (q) => {
      const fs = await q<{
        id: string;
        name: string;
        location_text: string | null;
        livestock_area_ha: number | null;
        total_area_ha: number | null;
        production_focus: string | null;
      }>(
        "SELECT id, name, location_text, livestock_area_ha, total_area_ha, production_focus FROM farm WHERE organization_id = $1 ORDER BY name",
        [o.id],
      );
      const counts = await q<{ farm_id: string; n: string }>(
        "SELECT farm_id, count(*) AS n FROM animal WHERE organization_id = $1 AND status = 'activo' GROUP BY farm_id",
        [o.id],
      );
      return fs.map((f) => ({
        id: f.id,
        name: f.name,
        location: f.location_text,
        areaHa: f.livestock_area_ha ?? f.total_area_ha,
        focus: f.production_focus,
        animals: Number(counts.find((c) => c.farm_id === f.id)?.n ?? 0),
        verifiedOn: day(verifs.find((v) => v.farm_id === f.id)?.visited_on ?? null),
      }));
    });
    organizations.push({
      organizationId: o.id,
      organizationName: o.name,
      department: o.department,
      municipality: o.municipality,
      farms,
    });
  }
  return db.admin(async (q) => ({
    staff,
    cases: ids.length
      ? (
          await q<CaseRow>(
            `${CASE_SQL} WHERE c.organization_id = ANY($1::uuid[])
              ORDER BY (c.status = 'abierta') DESC, c.updated_at DESC LIMIT 200`,
            [ids],
          )
        ).map(toCase)
      : [],
    organizations,
    recommendations: ids.length
      ? (
          await q<RecoRow>(
            `${RECO_SQL} WHERE r.organization_id = ANY($1::uuid[]) ORDER BY r.created_at DESC LIMIT 300`,
            [ids],
          )
        ).map(toReco)
      : [],
    indicators: await indicatorsFor(q, ids),
  }));
}

/* ───────────── Escritura ───────────── */

/** Consultas escaladas por ganadería en 24 horas (evita llenar la bandeja del técnico). */
export const CASES_PER_DAY = 10;

export async function createCase(
  db: Db,
  userId: string,
  input: TechCaseCreate,
): Promise<TechCaseDto | Fail | { error: "LIMITE" }> {
  return db.admin(async (q) => {
    if (!(await orgShares(q, input.organizationId)))
      return { error: "COMPARTIR_REQUERIDO" as const };
    const [n] = await q<{ n: string }>(
      "SELECT count(*) AS n FROM tech_case WHERE organization_id = $1 AND created_at > now() - interval '1 day'",
      [input.organizationId],
    );
    if (Number(n?.n ?? 0) >= CASES_PER_DAY) return { error: "LIMITE" as const };
    if (input.farmId) {
      const [f] = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
        input.farmId,
        input.organizationId,
      ]);
      if (!f) return { error: "NO_EXISTE" as const };
    }
    const [row] = await q<{ id: string }>(
      `INSERT INTO tech_case (organization_id, farm_id, created_by, topic, question, ai_answer)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        input.organizationId,
        input.farmId ?? null,
        userId,
        input.topic,
        input.question,
        input.aiAnswer || null,
      ],
    );
    const [c] = await q<CaseRow>(`${CASE_SQL} WHERE c.id = $1`, [row?.id]);
    return toCase(c as CaseRow);
  });
}

export async function caseOrg(db: Db, caseId: string): Promise<string | null> {
  const [r] = await db.admin((q) =>
    q<{ organization_id: string }>("SELECT organization_id FROM tech_case WHERE id = $1", [caseId]),
  );
  return r?.organization_id ?? null;
}

export async function getThread(db: Db, caseId: string): Promise<TechCaseThreadDto | null> {
  return db.admin(async (q) => {
    const [c] = await q<CaseRow>(`${CASE_SQL} WHERE c.id = $1`, [caseId]);
    if (!c) return null;
    const msgs = await q<{
      id: string;
      from_staff: boolean;
      author_name: string;
      body: string;
      created_at: Date | string;
    }>(
      `SELECT m.id, m.from_staff, u.display_name AS author_name, m.body, m.created_at
         FROM tech_message m JOIN app_user u ON u.id = m.author_id
        WHERE m.case_id = $1 ORDER BY m.created_at`,
      [caseId],
    );
    const messages: TechMessageDto[] = msgs.map((m) => ({
      id: m.id,
      fromStaff: m.from_staff,
      authorName: m.author_name,
      body: m.body,
      createdAt: iso(m.created_at),
    }));
    return { case: toCase(c), messages };
  });
}

/** Mensaje en la consulta. La respuesta del técnico la deja «respondida»; la del productor, «abierta». */
export async function addMessage(
  db: Db,
  caseId: string,
  userId: string,
  fromStaff: boolean,
  body: string,
): Promise<TechCaseThreadDto | Fail> {
  const ok = await db.admin(async (q) => {
    const [c] = await q<{ status: string }>("SELECT status FROM tech_case WHERE id = $1", [caseId]);
    if (!c) return false;
    await q(
      "INSERT INTO tech_message (case_id, author_id, from_staff, body) VALUES ($1,$2,$3,$4)",
      [caseId, userId, fromStaff, body],
    );
    await q("UPDATE tech_case SET status = $2, updated_at = now() WHERE id = $1", [
      caseId,
      fromStaff ? "respondida" : "abierta",
    ]);
    return true;
  });
  if (!ok) return { error: "NO_EXISTE" };
  return (await getThread(db, caseId)) as TechCaseThreadDto;
}

export async function closeCase(db: Db, caseId: string): Promise<void> {
  await db.admin((q) =>
    q("UPDATE tech_case SET status = 'cerrada', updated_at = now() WHERE id = $1", [caseId]),
  );
}

/** Recomendación del Secretario Técnico a una ganadería de su región. */
export async function createRecommendation(
  db: Db,
  userId: string,
  input: RecommendationCreate,
): Promise<RecommendationDto | Fail> {
  return db.admin(async (q) => {
    if (input.farmId) {
      const [f] = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
        input.farmId,
        input.organizationId,
      ]);
      if (!f) return { error: "NO_EXISTE" as const };
    }
    if (input.caseId) {
      const [c] = await q("SELECT 1 FROM tech_case WHERE id = $1 AND organization_id = $2", [
        input.caseId,
        input.organizationId,
      ]);
      if (!c) return { error: "NO_EXISTE" as const };
    }
    const [row] = await q<{ id: string }>(
      `INSERT INTO recommendation (organization_id, farm_id, case_id, author_id, from_staff, topic, title, detail, indicator, due_on)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.organizationId,
        input.farmId ?? null,
        input.caseId ?? null,
        userId,
        input.topic,
        input.title,
        input.detail ?? "",
        input.indicator ?? null,
        input.dueOn ?? null,
      ],
    );
    const [r] = await q<RecoRow>(`${RECO_SQL} WHERE r.id = $1`, [row?.id]);
    return toReco(r as RecoRow);
  });
}

export async function recoOrg(db: Db, recoId: string): Promise<string | null> {
  const [r] = await db.admin((q) =>
    q<{ organization_id: string }>("SELECT organization_id FROM recommendation WHERE id = $1", [
      recoId,
    ]),
  );
  return r?.organization_id ?? null;
}

/** El productor cuenta en qué va: en curso, la adoptó o la descartó. Una verificada ya no cambia. */
export async function setRecommendationStatus(
  db: Db,
  recoId: string,
  status: RecommendationStatus,
): Promise<RecommendationDto | Fail> {
  return db.admin(async (q) => {
    const [cur] = await q<{ verified_at: Date | null }>(
      "SELECT verified_at FROM recommendation WHERE id = $1",
      [recoId],
    );
    if (!cur) return { error: "NO_EXISTE" as const };
    if (cur.verified_at) return { error: "ESTADO" as const };
    await q(
      `UPDATE recommendation SET status = $2, updated_at = now(),
              adopted_at = CASE WHEN $2 = 'adoptada' THEN coalesce(adopted_at, now()) ELSE NULL END
        WHERE id = $1`,
      [recoId, status],
    );
    const [r] = await q<RecoRow>(`${RECO_SQL} WHERE r.id = $1`, [recoId]);
    return toReco(r as RecoRow);
  });
}

/** El Secretario Técnico confirma en finca que la recomendación adoptada se aplicó. */
export async function verifyRecommendation(
  db: Db,
  recoId: string,
  userId: string,
  note: string,
): Promise<RecommendationDto | Fail> {
  return db.admin(async (q) => {
    const [cur] = await q<{ status: string }>("SELECT status FROM recommendation WHERE id = $1", [
      recoId,
    ]);
    if (!cur) return { error: "NO_EXISTE" as const };
    if (cur.status !== "adoptada") return { error: "ESTADO" as const };
    await q(
      `UPDATE recommendation SET verified_at = now(), verified_by = $2, verification_note = $3, updated_at = now()
        WHERE id = $1`,
      [recoId, userId, note || null],
    );
    const [r] = await q<RecoRow>(`${RECO_SQL} WHERE r.id = $1`, [recoId]);
    return toReco(r as RecoRow);
  });
}

/** Visita de verificación en campo de la línea base del predio (lleva el expediente al nivel 3). */
export async function createVerification(
  db: Db,
  userId: string,
  input: FieldVerificationCreate,
): Promise<FieldVerificationDto | Fail> {
  return db.admin(async (q) => {
    const [f] = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
      input.farmId,
      input.organizationId,
    ]);
    if (!f) return { error: "NO_EXISTE" as const };
    const [row] = await q<{ id: string }>(
      `INSERT INTO field_verification (organization_id, farm_id, verified_by, visited_on, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.organizationId, input.farmId, userId, input.visitedOn, input.note ?? ""],
    );
    const [v] = await q<VerifRow>(
      `SELECT v.id, v.organization_id, v.farm_id, v.visited_on, v.note, u.display_name AS verifier_name
         FROM field_verification v JOIN app_user u ON u.id = v.verified_by WHERE v.id = $1`,
      [row?.id],
    );
    return toVerif(v as VerifRow);
  });
}
