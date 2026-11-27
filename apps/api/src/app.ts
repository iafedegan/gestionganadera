import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import {
  type AiConfigDto,
  AiConfigInput,
  AssistantRequest,
  AulaQuizAnswers,
  AvatarInput,
  CommunityPostCreate,
  CommunityReplyCreate,
  CommunityTopic,
  DEFAULT_GEMINI_MODEL,
  DataConsentInput,
  DataRequestInput,
  DemoLoginRequest,
  ErrorCodes,
  FarmCreate,
  FarmProfile,
  FarmUpdate,
  FieldVerificationCreate,
  ForestCheckRequest,
  InvitationCreate,
  LoginRequest,
  OnboardingRequest,
  PushRequest,
  RecommendationCreate,
  RecommendationUpdate,
  RecommendationVerify,
  RegisterInvitedRequest,
  RegisterRequest,
  TechCaseCreate,
  TechMessageCreate,
  UrgentAlertCreate,
  UrgentMessageCreate,
  VetAdd,
} from "@ganaderia/contracts";
import { can } from "@ganaderia/domain";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { checkGemini, geminiAsk, open as openKey, orgAi, seal } from "./aiKey.js";
import {
  type AskFn,
  DAILY_LIMIT,
  SYSTEM_PROMPT,
  buildMessages,
  claudeAsk,
  farmContext,
  recordTokens,
  takeQuota,
  urgentReason,
} from "./assistant.js";
import { appendAudit, verifyAuditChain } from "./audit.js";
import {
  type AuthUser,
  LoginThrottle,
  type Membership,
  REMEMBER_HOURS,
  grants,
  login,
  logout,
  openDemoSession,
  register,
  registerInvited,
  resolveSession,
  toSessionDto,
} from "./auth.js";
import { directMedia, listContacts, listDirect, sendDirect } from "./chats.js";
import {
  createPost,
  createReply,
  getThread,
  hideOwn,
  listPosts,
  report as reportContent,
} from "./community.js";
import { addRequest, exportData, getConsent, listRequests, saveConsent } from "./datos.js";
import type { Db } from "./db.js";
import { DemoRateLimit, ensureDemo, ensureDemoRole, ensureDemoStaff } from "./demo.js";
import {
  DEMO_ROLES,
  DEMO_SPECS,
  DEMO_STAFF,
  DEMO_VETS,
  demoRoleSpec,
  demoSpec,
  demoStaffSpec,
  demoVetSpec,
} from "./demoData.js";
import { type Aula, AulaError, type Ecosistema, type KnowledgeHit } from "./ecosistema.js";
import {
  type Fail,
  accessTo,
  addMessage,
  caseOrg,
  closeCase,
  createCase,
  createRecommendation,
  createVerification,
  getThread as getCaseThread,
  getStaff,
  orgSummary,
  recoOrg,
  setRecommendationStatus,
  staffInbox,
  verifyRecommendation,
} from "./extension.js";
import { createFarm, listFarms, pull, push, updateFarm } from "./sync.js";
import {
  acceptInvitation,
  addVet,
  createInvitation,
  getTeam,
  listVets,
  previewInvitation,
  removeMember,
  revokeInvitation,
} from "./team.js";
import { latestChecks, runCheck } from "./trazabilidad.js";
import {
  ackUrgent,
  addUrgentMessage,
  createUrgent,
  listMessages,
  listMyUrgent,
  listUrgent,
  urgentMedia,
  urgentTeam,
} from "./urgent.js";

const COOKIE = "sid";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { user: AuthUser; memberships: Membership[] };
  }
}

export interface AppOptions {
  db: Db;
  production?: boolean;
  /** Orígenes permitidos para peticiones que modifican estado. */
  allowedOrigins?: string[];
  /** Carpeta compilada de la landing; se sirve en «/». */
  landingDir?: string;
  /** Carpeta compilada de la PWA; se sirve en «/app/». */
  appDir?: string;
  /** Permite entrar a las cuentas de muestra sin contraseña (selector de la pantalla de ingreso). */
  demo?: boolean;
  /** Fuente de la capa de bosque (inyectable en pruebas). */
  forestFetch?: typeof fetch;
  /** Llamada al modelo del asistente. Por defecto usa ANTHROPIC_API_KEY; en pruebas se inyecta. */
  ask?: AskFn | null;
  /** Llamadas a Google Gemini (inyectable en pruebas). */
  geminiFetch?: typeof fetch;
  /** Las cuentas de muestra pueden guardar su clave de IA. Nunca en un servidor público. */
  demoSecrets?: boolean;
  /**
   * Conectores del ecosistema FEDEGÁN 5.0 (noticias, cursos, tienda, conocimiento del gremio).
   * Sin conector, esas rutas responden «no disponible» y el asistente usa solo la finca.
   */
  ecosistema?: Ecosistema | null;
}

/** Límite simple por usuario para publicar en la comunidad: evita ráfagas y spam. */
class PostLimit {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max = 12,
    private readonly windowMs = 10 * 60_000,
  ) {}
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.delete(this.hits.keys().next().value as string);
    return true;
  }
}

/** Caché de estáticos: los archivos con huella son inmutables; el resto siempre se revalida. */
function staticHeaders(res: { setHeader(k: string, v: string): void }, path: string): void {
  const hashed = path.replaceAll("\\", "/").includes("/assets/");
  res.setHeader("cache-control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts;
  const app = Fastify({
    logger: opts.production ? { level: "info" } : false,
    bodyLimit: 1_000_000,
  });
  const throttle = new LoginThrottle();
  const registerThrottle = new LoginThrottle();
  const inviteThrottle = new LoginThrottle();
  const demoLimit = new DemoRateLimit();
  await app.register(cookie);

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    // Las respuestas de la API nunca se guardan; los estáticos manejan su propia caché.
    if (req.url.startsWith("/v1/")) reply.header("cache-control", "no-store");
  });

  // Defensa CSRF: cookie SameSite=Strict + encabezado propio + verificación de Origin si viene.
  app.addHook("preHandler", async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
    if (req.headers["x-requested-with"] !== "ganaderia") {
      return reply.code(403).send({ error: "CSRF", message: "Falta el encabezado de seguridad." });
    }
    const origin = req.headers.origin;
    if (origin && opts.allowedOrigins && !opts.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "CSRF", message: "Origen no permitido." });
    }
  });

  async function requireSession(req: FastifyRequest, reply: FastifyReply) {
    const s = await resolveSession(db, req.cookies[COOKIE]);
    if (!s) return reply.code(401).send({ error: "NO_AUTENTICADO", message: "Sesión no válida." });
    req.auth = s;
  }

  const orgQuery = z.object({ organizationId: z.string().uuid() });
  const pullQuery = orgQuery.extend({
    since: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  });

  app.get("/v1/health", async () => ({ ok: true }));

  app.post("/v1/auth/login", async (req, reply) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Datos inválidos." });
    const res = await login(
      db,
      throttle,
      body.data.email,
      body.data.password,
      req.headers["user-agent"],
      body.data.remember === true,
    );
    if (!res.ok) {
      return reply.code(res.reason === "bloqueado" ? 429 : 401).send({
        error: res.reason === "bloqueado" ? "BLOQUEADO" : "CREDENCIALES",
        message:
          res.reason === "bloqueado"
            ? "Demasiados intentos. Espere 15 minutos."
            : "Correo o contraseña incorrectos.",
      });
    }
    reply.setCookie(COOKIE, res.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: opts.production ?? false,
      path: "/",
      maxAge: (body.data.remember ? REMEMBER_HOURS : 12) * 3600,
    });
    return toSessionDto(res.user, res.memberships);
  });

  // Cuentas de muestra: solo existen si el servidor las habilita. Sin eso responden 404.
  app.get("/v1/demo/users", async (_req, reply) => {
    if (!opts.demo)
      return reply.code(404).send({ error: "NO_ENCONTRADO", message: "No disponible." });
    const list = (items: { key: string; label: string; description: string }[], group: string) =>
      items.map(({ key, label, description }) => ({ key, label, description, group }));
    return [
      ...list(DEMO_ROLES, "Por rol en la finca"),
      ...list(DEMO_SPECS, "Propietario, según su ganadería"),
      ...list(DEMO_VETS, "Veterinaria que recibe urgencias"),
      ...list(DEMO_STAFF, "Gremio"),
    ];
  });

  app.post("/v1/demo/login", async (req, reply) => {
    if (!opts.demo)
      return reply.code(404).send({ error: "NO_ENCONTRADO", message: "No disponible." });
    const body = DemoLoginRequest.safeParse(req.body);
    const spec = body.success ? demoSpec(body.data.key) : undefined;
    const staffSpec = body.success ? demoStaffSpec(body.data.key) : undefined;
    const roleSpec = body.success ? demoRoleSpec(body.data.key) : undefined;
    const vetSpec = body.success ? demoVetSpec(body.data.key) : undefined;
    if (!spec && !staffSpec && !roleSpec && !vetSpec)
      return reply
        .code(400)
        .send({ error: "VALIDACION", message: "Esa cuenta de muestra no existe." });
    if (!demoLimit.allow(req.ip)) {
      return reply.code(429).send({
        error: "BLOQUEADO",
        message: "Demasiados ingresos de muestra. Espere unos minutos.",
      });
    }
    try {
      const { userId } = spec
        ? await ensureDemo(db, spec)
        : roleSpec
          ? await ensureDemoRole(db, demoSpec("completo") as NonNullable<typeof spec>, roleSpec)
          : vetSpec
            ? await ensureDemoRole(db, demoSpec(vetSpec.org) as NonNullable<typeof spec>, vetSpec)
            : await ensureDemoStaff(db, staffSpec as NonNullable<typeof staffSpec>);
      const s = await openDemoSession(db, userId, req.headers["user-agent"]);
      reply.setCookie(COOKIE, s.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: opts.production ?? false,
        path: "/",
        maxAge: 12 * 3600,
      });
      return toSessionDto(s.user, s.memberships);
    } catch (err) {
      req.log.error(err, "no se pudo preparar la cuenta de muestra");
      return reply
        .code(500)
        .send({ error: "ERROR", message: "No se pudo preparar la cuenta de muestra." });
    }
  });

  // Registro público: limitado por IP para frenar altas masivas.
  app.post("/v1/auth/register", async (req, reply) => {
    const ipKey = `registro:${req.ip}`;
    if (registerThrottle.isLocked(ipKey)) {
      return reply.code(429).send({
        error: "BLOQUEADO",
        message: "Demasiados registros desde esta red. Intente más tarde.",
      });
    }
    const body = RegisterRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "VALIDACION",
        message: body.error.issues[0]?.message ?? "Datos inválidos.",
      });
    }
    registerThrottle.fail(ipKey);
    const res = await register(db, body.data, req.headers["user-agent"]);
    if (!res.ok) {
      return reply.code(409).send({
        error: ErrorCodes.CORREO_EN_USO,
        message: "Ya existe una cuenta con ese correo. Ingrese o use otro correo.",
      });
    }
    reply.setCookie(COOKIE, res.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: opts.production ?? false,
      path: "/",
      maxAge: 12 * 3600,
    });
    return reply.code(201).send(toSessionDto(res.user, res.memberships));
  });

  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: opts.production ?? false,
      path: "/",
      maxAge: 12 * 3600,
    });
  const badCode = (reply: FastifyReply) =>
    reply.code(404).send({
      error: ErrorCodes.INVITACION_INVALIDA,
      message: "La invitación no existe, ya se usó o venció. Pida una nueva.",
    });

  // Vista previa pública de una invitación: a qué finca y con qué papel. Limitada por IP.
  app.get("/v1/invitations/:code", async (req, reply) => {
    const key = `invitacion:${req.ip}`;
    if (inviteThrottle.isLocked(key))
      return reply
        .code(429)
        .send({ error: "BLOQUEADO", message: "Demasiados intentos. Espere 15 minutos." });
    const { code } = req.params as { code: string };
    const p = await previewInvitation(db, code);
    if (!p) {
      inviteThrottle.fail(key);
      return badCode(reply);
    }
    return p;
  });

  app.post("/v1/auth/register-invited", async (req, reply) => {
    const key = `invitacion:${req.ip}`;
    if (inviteThrottle.isLocked(key))
      return reply
        .code(429)
        .send({ error: "BLOQUEADO", message: "Demasiados intentos. Espere 15 minutos." });
    const body = RegisterInvitedRequest.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({
        error: "VALIDACION",
        message: body.error.issues[0]?.message ?? "Datos inválidos.",
      });
    const res = await registerInvited(db, body.data, req.headers["user-agent"]);
    if (!res.ok) {
      if (res.reason === "correo_en_uso")
        return reply.code(409).send({
          error: ErrorCodes.CORREO_EN_USO,
          message: "Ya existe una cuenta con ese correo: ingrese con ella y use la invitación.",
        });
      inviteThrottle.fail(key);
      return badCode(reply);
    }
    setSession(reply, res.token);
    return reply.code(201).send(toSessionDto(res.user, res.memberships));
  });

  app.post("/v1/invitations/accept", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const key = `invitacion:${a.user.id}`;
    if (inviteThrottle.isLocked(key))
      return reply
        .code(429)
        .send({ error: "BLOQUEADO", message: "Demasiados intentos. Espere 15 minutos." });
    const code = String((req.body as { code?: unknown } | null)?.code ?? "");
    const orgId = await acceptInvitation(db, a.user, code);
    if (!orgId) {
      inviteThrottle.fail(key);
      return badCode(reply);
    }
    const fresh = await resolveSession(db, req.cookies[COOKIE]);
    return toSessionDto(fresh?.user ?? a.user, fresh?.memberships ?? a.memberships);
  });

  const teamGuard = (req: FastifyRequest, reply: FastifyReply, orgId: string) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!grants(a.memberships, orgId, "team.manage", null)) {
      void reply.code(403).send({
        error: "PERMISO_DENEGADO",
        message: "Solo el propietario o el administrador gestionan el equipo.",
      });
      return null;
    }
    return a;
  };

  app.get("/v1/team", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    const a = teamGuard(req, reply, q.data.organizationId);
    if (!a) return reply;
    return getTeam(db, q.data.organizationId, a.user.id);
  });

  app.get("/v1/team/veterinarios", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    const a = teamGuard(req, reply, q.data.organizationId);
    if (!a) return reply;
    return { items: await listVets(db, a.user, q.data.organizationId) };
  });

  app.post("/v1/team/veterinarios", { preHandler: requireSession }, async (req, reply) => {
    const body = VetAdd.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Datos inválidos." });
    const a = teamGuard(req, reply, body.data.organizationId);
    if (!a) return reply;
    if (!(await addVet(db, a.user, body.data)))
      return reply.code(400).send({
        error: "NO_PERMITIDO",
        message: "Esa persona ya está en su equipo o no es veterinaria.",
      });
    return reply.code(201).send({ ok: true });
  });

  app.post("/v1/team/invitations", { preHandler: requireSession }, async (req, reply) => {
    const body = InvitationCreate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({
        error: "VALIDACION",
        message: body.error.issues[0]?.message ?? "Datos inválidos.",
      });
    const a = teamGuard(req, reply, body.data.organizationId);
    if (!a) return reply;
    const res = await createInvitation(db, a.user, body.data);
    if (!res.ok)
      return reply
        .code(400)
        .send({ error: "FINCA_NO_AUTORIZADA", message: "La finca no es de esta organización." });
    return reply.code(201).send({ code: res.code, invitation: res.invitation });
  });

  app.delete("/v1/team/invitations/:id", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    const a = teamGuard(req, reply, q.data.organizationId);
    if (!a) return reply;
    const ok = await revokeInvitation(
      db,
      a.user,
      q.data.organizationId,
      (req.params as { id: string }).id,
    );
    return ok
      ? { ok: true }
      : reply.code(404).send({ error: "NO_EXISTE", message: "La invitación no existe." });
  });

  app.delete("/v1/team/members/:id", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    const a = teamGuard(req, reply, q.data.organizationId);
    if (!a) return reply;
    const r = await removeMember(
      db,
      a.user,
      q.data.organizationId,
      (req.params as { id: string }).id,
    );
    if (r.ok) return { ok: true };
    const msg = {
      no_existe: "La persona no está en el equipo.",
      propietario: "El propietario no se puede retirar.",
      yo: "No puede quitarse su propio acceso.",
    }[r.reason];
    return reply
      .code(r.reason === "no_existe" ? 404 : 400)
      .send({ error: "NO_PERMITIDO", message: msg });
  });

  app.post("/v1/onboarding", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const body = OnboardingRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "VALIDACION",
        message: body.error.issues[0]?.message ?? "Datos inválidos.",
      });
    }
    const b = body.data;
    if (!grants(a.memberships, b.organizationId, "farm.write", null)) {
      return reply.code(403).send({
        error: "PERMISO_DENEGADO",
        message: "Sin permiso para configurar esta organización.",
      });
    }
    await db.admin(async (q) => {
      await q(
        `UPDATE app_user SET display_name = $2, phone = $3, job_role = $4, experience_years = $5,
                onboarding_pending = false WHERE id = $1`,
        [a.user.id, b.displayName, b.phone ?? null, b.jobRole, b.experienceYears ?? null],
      );
      await q(
        `UPDATE organization SET kind = $2, tax_id = $3, department = $4, municipality = $5,
                goals = $6, herd_estimate = $7 WHERE id = $1`,
        [
          b.organizationId,
          b.orgKind,
          b.taxId ?? null,
          b.department ?? null,
          b.municipality ?? null,
          b.goals,
          JSON.stringify(b.herdEstimate),
        ],
      );
    });
    await db.tenant(
      b.organizationId,
      (q) =>
        appendAudit(q, b.organizationId, {
          userId: a.user.id,
          action: "onboarding.complete",
          entity: "organization",
          entityId: b.organizationId,
          detail: { jobRole: b.jobRole, orgKind: b.orgKind, goals: b.goals },
        }),
      { write: true },
    );
    return toSessionDto(
      { ...a.user, displayName: b.displayName, onboardingPending: false },
      a.memberships,
    );
  });

  // Perfil de la finca (cuestionario inicial). Lo ve todo el equipo; lo responde quien administra.
  app.get("/v1/profile", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    if (!grants(a.memberships, q.data.organizationId, "farm.read", null))
      return reply.code(403).send({ error: "PERMISO_DENEGADO", message: "Sin acceso." });
    const [row] = await db.admin((sql) =>
      sql<{ profile: unknown; profile_updated_at: Date | string | null }>(
        "SELECT profile, profile_updated_at FROM organization WHERE id = $1",
        [q.data.organizationId],
      ),
    );
    const parsed = row?.profile ? FarmProfile.safeParse(row.profile) : null;
    return {
      profile: parsed?.success ? parsed.data : null,
      updatedAt: row?.profile_updated_at ? new Date(row.profile_updated_at).toISOString() : null,
    };
  });

  app.put("/v1/profile", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    const body = FarmProfile.safeParse(req.body);
    if (!q.success || !body.success)
      return reply.code(400).send({
        error: "VALIDACION",
        message: body.success
          ? "Organización requerida."
          : (body.error.issues[0]?.message ?? "Datos inválidos."),
      });
    if (!grants(a.memberships, q.data.organizationId, "farm.write", null))
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "Sin permiso para editar el perfil." });
    const [row] = await db.admin((sql) =>
      sql<{ profile_updated_at: Date | string }>(
        "UPDATE organization SET profile = $2, profile_updated_at = now() WHERE id = $1 RETURNING profile_updated_at",
        [q.data.organizationId, JSON.stringify(body.data)],
      ),
    );
    await db.tenant(
      q.data.organizationId,
      (sql) =>
        appendAudit(sql, q.data.organizationId, {
          userId: a.user.id,
          action: "profile.save",
          entity: "organization",
          entityId: q.data.organizationId,
          detail: { level: body.data.level, goals: body.data.goals, heads: body.data.heads },
        }),
      { write: true },
    );
    return {
      profile: body.data,
      updatedAt: row ? new Date(row.profile_updated_at).toISOString() : new Date().toISOString(),
    };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    await logout(db, req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  // Asistente del servidor: la clave vive en las variables del entorno (p. ej. en Vercel).
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const ask =
    opts.ask !== undefined
      ? opts.ask
      : geminiKey
        ? geminiAsk(
            geminiKey,
            process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
            opts.geminiFetch,
          )
        : process.env.ANTHROPIC_API_KEY
          ? claudeAsk(process.env.ANTHROPIC_API_KEY)
          : null;

  const eco = opts.ecosistema ?? null;
  const postLimit = new PostLimit();

  /* ───── Ecosistema FEDEGÁN 5.0: contenido que vive en otras plataformas del gremio ───── */

  async function fromEco<T>(reply: FastifyReply, load: (e: Ecosistema) => Promise<T>) {
    if (!eco)
      return reply.code(503).send({
        error: ErrorCodes.SERVICIO_EXTERNO,
        message: "Este servicio del ecosistema no está conectado en este servidor.",
      });
    try {
      return await load(eco);
    } catch (err) {
      reply.log.warn(err, "ecosistema");
      return reply.code(502).send({
        error: ErrorCodes.SERVICIO_EXTERNO,
        message: "El servicio no respondió. Intente de nuevo en un momento.",
      });
    }
  }

  app.get("/v1/ecosistema/noticias", { preHandler: requireSession }, (_req, reply) =>
    fromEco(reply, async (e) => ({ items: await e.news() })),
  );
  app.get("/v1/ecosistema/cursos", { preHandler: requireSession }, (_req, reply) =>
    fromEco(reply, async (e) => ({
      // «enrollable»: el servidor puede inscribir y llevar el avance en la Escuela (hay clave de aliado).
      items: (await e.courses()).map((c) => (e.aula ? { ...c, enrollable: true } : c)),
    })),
  );

  /* ───── Aula: estudiar los cursos de la Escuela dentro de la app ───── */

  /** El servidor llama a la Escuela con la clave de aliado; el celular nunca la ve. */
  async function fromAula<T>(reply: FastifyReply, load: (aula: Aula) => Promise<T>) {
    const aula = eco?.aula;
    if (!aula)
      return reply.code(503).send({
        error: ErrorCodes.SERVICIO_EXTERNO,
        message: "Estudiar dentro de la app todavía no está disponible. Use el enlace al curso.",
      });
    try {
      return await load(aula);
    } catch (err) {
      if (err instanceof AulaError) {
        if (err.status === 404)
          return reply.code(404).send({
            error: ErrorCodes.AULA_NO_EXISTE,
            message: "Ese curso o lección ya no está disponible.",
          });
        if (err.status === 403)
          return reply.code(403).send({
            error: ErrorCodes.AULA_SIN_INSCRIPCION,
            message: "Inscríbase al curso para continuar.",
          });
        if (err.status === 400)
          return reply.code(400).send({
            error: ErrorCodes.VALIDACION,
            message: err.message || "No se pudo completar la acción.",
          });
      }
      reply.log.warn(err, "aula");
      return reply.code(502).send({
        error: ErrorCodes.SERVICIO_EXTERNO,
        message: "La Escuela Virtual no respondió. Intente de nuevo en un momento.",
      });
    }
  }
  const courseParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,100}$/) });
  const lessonParam = courseParam.extend({ lesson: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });
  const invalid = (reply: FastifyReply) =>
    reply.code(400).send({ error: ErrorCodes.VALIDACION, message: "Dirección no válida." });
  const learnerName = (u: { displayName: string; email: string }) =>
    u.displayName.trim().length >= 3 ? u.displayName.trim() : (u.email.split("@")[0] ?? "Ganadero");

  app.get("/v1/ecosistema/cursos/:slug", { preHandler: requireSession }, (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = courseParam.safeParse(req.params);
    if (!p.success) return invalid(reply);
    return fromAula(reply, (aula) => aula.detail(p.data.slug, a.user.id));
  });
  app.post(
    "/v1/ecosistema/cursos/:slug/inscripcion",
    { preHandler: requireSession },
    (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = courseParam.safeParse(req.params);
      if (!p.success) return invalid(reply);
      return fromAula(reply, async (aula) => {
        await aula.enroll(p.data.slug, a.user.id, learnerName(a.user));
        return aula.detail(p.data.slug, a.user.id);
      });
    },
  );
  app.post(
    "/v1/ecosistema/cursos/:slug/lecciones/:lesson/completar",
    { preHandler: requireSession },
    (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = lessonParam.safeParse(req.params);
      if (!p.success) return invalid(reply);
      return fromAula(reply, (aula) => aula.complete(p.data.slug, p.data.lesson, a.user.id));
    },
  );
  app.get(
    "/v1/ecosistema/cursos/:slug/lecciones/:lesson/evaluacion",
    { preHandler: requireSession },
    (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = lessonParam.safeParse(req.params);
      if (!p.success) return invalid(reply);
      return fromAula(reply, (aula) => aula.quiz(p.data.slug, p.data.lesson, a.user.id));
    },
  );
  app.post(
    "/v1/ecosistema/cursos/:slug/lecciones/:lesson/evaluacion",
    { preHandler: requireSession },
    (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = lessonParam.safeParse(req.params);
      const b = AulaQuizAnswers.safeParse(req.body);
      if (!p.success || !b.success)
        return reply
          .code(400)
          .send({ error: ErrorCodes.VALIDACION, message: "Responda todas las preguntas." });
      return fromAula(reply, (aula) =>
        aula.submitQuiz(p.data.slug, p.data.lesson, a.user.id, b.data.answers),
      );
    },
  );
  app.get("/v1/ecosistema/mis-cursos", { preHandler: requireSession }, (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return fromAula(reply, async (aula) => ({ items: await aula.mine(a.user.id) }));
  });
  app.get("/v1/ecosistema/tienda/categorias", { preHandler: requireSession }, (_req, reply) =>
    fromEco(reply, async (e) => ({ items: await e.storeCategories() })),
  );
  const catalogQuery = z.object({
    categoria: z
      .string()
      .regex(/^[a-z-]{2,40}$/)
      .optional(),
  });
  app.get("/v1/ecosistema/tienda/catalogo", { preHandler: requireSession }, (req, reply) => {
    const q = catalogQuery.safeParse(req.query);
    if (!q.success)
      return reply
        .code(400)
        .send({ error: ErrorCodes.VALIDACION, message: "Categoría no válida." });
    return fromEco(reply, (e) => e.storeCatalog(q.data.categoria));
  });
  const storeQuery = z.object({ q: z.string().trim().min(2).max(80) });
  app.get("/v1/ecosistema/tienda", { preHandler: requireSession }, (req, reply) => {
    const q = storeQuery.safeParse(req.query);
    if (!q.success)
      return reply
        .code(400)
        .send({ error: ErrorCodes.VALIDACION, message: "Escriba al menos dos letras." });
    return fromEco(reply, (e) => e.storeSearch(q.data.q));
  });

  /* ───── Protocolo de datos del productor (Plan CTeI 2026–2030, §6.2.6) ───── */

  app.get("/v1/me/consentimiento", { preHandler: requireSession }, (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return getConsent(db, a.user.id);
  });
  app.put("/v1/me/consentimiento", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = DataConsentInput.safeParse(req.body);
    if (!b.success)
      return reply.code(400).send({ error: ErrorCodes.VALIDACION, message: "Datos inválidos." });
    const r = await saveConsent(db, a.user.id, b.data);
    if ("error" in r)
      return reply.code(409).send({
        error: ErrorCodes.VALIDACION,
        message: "El texto de autorización cambió. Recargue la aplicación y léalo de nuevo.",
      });
    return r;
  });
  app.put("/v1/me/avatar", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = AvatarInput.safeParse(req.body);
    if (!b.success)
      return reply
        .code(400)
        .send({ error: ErrorCodes.VALIDACION, message: "La foto no es válida o pesa demasiado." });
    // Las cuentas de muestra son públicas: su foto no se guarda en el servidor.
    if (a.user.email.endsWith("@demo.ganaderia.local"))
      return reply.code(403).send({
        error: ErrorCodes.PERMISO_DENEGADO,
        message: "En las cuentas de muestra la foto se guarda solo en este dispositivo.",
      });
    await db.admin((q) =>
      q("UPDATE app_user SET avatar = $2 WHERE id = $1", [a.user.id, b.data.image]),
    );
    return toSessionDto({ ...a.user, avatar: b.data.image }, a.memberships);
  });
  app.get("/v1/me/datos", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const data = await exportData(db, a.user, a.memberships);
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Disposition", `attachment; filename="mis-datos-${day}.json"`)
      .header("Cache-Control", "no-store")
      .send(data);
  });
  app.get("/v1/me/solicitudes", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return { items: await listRequests(db, a.user.id) };
  });
  app.post("/v1/me/solicitudes", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = DataRequestInput.safeParse(req.body);
    if (!b.success)
      return reply.code(400).send({
        error: ErrorCodes.VALIDACION,
        message: b.error.issues[0]?.message ?? "Datos inválidos.",
      });
    const r = await addRequest(db, a.user.id, b.data);
    if ("error" in r)
      return reply.code(429).send({
        error: ErrorCodes.LIMITE_DIARIO,
        message: "Ya envió varias solicitudes hoy. Le responderemos pronto.",
      });
    return reply.code(201).send(r);
  });

  /* ───── Extensión híbrida con adopción verificada (Plan CTeI 2026–2030, §6.1.1) ───── */

  const FAIL: Record<Fail["error"], { code: number; error: string; message: string }> = {
    SIN_ACCESO: {
      code: 403,
      error: ErrorCodes.SIN_ACCESO,
      message: "No tiene acceso a esta ganadería.",
    },
    NO_EXISTE: { code: 404, error: ErrorCodes.NO_ENCONTRADO, message: "Ya no está disponible." },
    COMPARTIR_REQUERIDO: {
      code: 409,
      error: ErrorCodes.COMPARTIR_REQUERIDO,
      message:
        "Para consultar al Secretario Técnico, autorice compartir el expediente de su finca.",
    },
    ESTADO: {
      code: 409,
      error: ErrorCodes.VALIDACION,
      message: "La recomendación no está en un estado que permita ese cambio.",
    },
  };
  const fail = (reply: FastifyReply, f: Fail) => {
    const e = FAIL[f.error];
    return reply.code(e.code).send({ error: e.error, message: e.message });
  };
  const isFail = (v: unknown): v is Fail =>
    typeof v === "object" && v !== null && "error" in v && typeof (v as Fail).error === "string";
  const bad = (reply: FastifyReply, message = "Datos inválidos.") =>
    reply.code(400).send({ error: ErrorCodes.VALIDACION, message });
  const isMember = (a: NonNullable<FastifyRequest["auth"]>, orgId: string) =>
    a.memberships.some((m) => m.organizationId === orgId);

  app.get("/v1/extension", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success) return bad(reply);
    if (!isMember(a, q.data.organizationId)) return fail(reply, { error: "SIN_ACCESO" });
    return orgSummary(db, q.data.organizationId);
  });

  app.post("/v1/extension/consultas", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = TechCaseCreate.safeParse(req.body);
    if (!b.success) return bad(reply, b.error.issues[0]?.message);
    if (!isMember(a, b.data.organizationId)) return fail(reply, { error: "SIN_ACCESO" });
    const r = await createCase(db, a.user.id, b.data);
    if ("error" in r && r.error === "LIMITE")
      return reply.code(429).send({
        error: ErrorCodes.LIMITE_DIARIO,
        message: "Su ganadería ya envió muchas consultas hoy. Intente mañana.",
      });
    if (isFail(r)) return fail(reply, r);
    return reply.code(201).send(r);
  });

  /** Acceso a la consulta: miembro de la ganadería o Secretario Técnico autorizado de su región. */
  async function caseAccess(req: FastifyRequest, id: string) {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const orgId = await caseOrg(db, id);
    if (!orgId) return { error: "NO_EXISTE" } as Fail;
    return accessTo(db, a.user, a.memberships, orgId);
  }
  const idParam2 = z.object({ id: z.string().uuid() });

  app.get("/v1/extension/consultas/:id", { preHandler: requireSession }, async (req, reply) => {
    const p = idParam2.safeParse(req.params);
    if (!p.success) return bad(reply);
    const acc = await caseAccess(req, p.data.id);
    if (isFail(acc)) return fail(reply, acc);
    return getCaseThread(db, p.data.id);
  });

  app.post(
    "/v1/extension/consultas/:id/mensajes",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = idParam2.safeParse(req.params);
      const b = TechMessageCreate.safeParse(req.body);
      if (!p.success || !b.success) return bad(reply, b.error?.issues[0]?.message);
      const acc = await caseAccess(req, p.data.id);
      if (isFail(acc)) return fail(reply, acc);
      const r = await addMessage(db, p.data.id, a.user.id, acc.kind === "staff", b.data.body);
      return isFail(r) ? fail(reply, r) : r;
    },
  );

  app.post(
    "/v1/extension/consultas/:id/cerrar",
    { preHandler: requireSession },
    async (req, reply) => {
      const p = idParam2.safeParse(req.params);
      if (!p.success) return bad(reply);
      const acc = await caseAccess(req, p.data.id);
      if (isFail(acc)) return fail(reply, acc);
      await closeCase(db, p.data.id);
      return getCaseThread(db, p.data.id);
    },
  );

  app.post("/v1/extension/recomendaciones", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = RecommendationCreate.safeParse(req.body);
    if (!b.success) return bad(reply, b.error.issues[0]?.message);
    const acc = await accessTo(db, a.user, a.memberships, b.data.organizationId);
    if (isFail(acc)) return fail(reply, acc);
    // Las recomendaciones técnicas las entrega el Secretario Técnico.
    if (acc.kind !== "staff") return fail(reply, { error: "SIN_ACCESO" });
    const r = await createRecommendation(db, a.user.id, b.data);
    return isFail(r) ? fail(reply, r) : reply.code(201).send(r);
  });

  app.patch(
    "/v1/extension/recomendaciones/:id",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = idParam2.safeParse(req.params);
      const b = RecommendationUpdate.safeParse(req.body);
      if (!p.success || !b.success) return bad(reply);
      const orgId = await recoOrg(db, p.data.id);
      if (!orgId) return fail(reply, { error: "NO_EXISTE" });
      // El estado de adopción lo declara la ganadería, no el técnico.
      if (!isMember(a, orgId)) return fail(reply, { error: "SIN_ACCESO" });
      const r = await setRecommendationStatus(db, p.data.id, b.data.status);
      return isFail(r) ? fail(reply, r) : r;
    },
  );

  app.post(
    "/v1/extension/recomendaciones/:id/verificar",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = idParam2.safeParse(req.params);
      const b = RecommendationVerify.safeParse(req.body ?? {});
      if (!p.success || !b.success) return bad(reply);
      const orgId = await recoOrg(db, p.data.id);
      if (!orgId) return fail(reply, { error: "NO_EXISTE" });
      const acc = await accessTo(db, a.user, a.memberships, orgId);
      if (isFail(acc)) return fail(reply, acc);
      // La verificación en finca la hace el técnico, nunca la misma ganadería.
      if (acc.kind !== "staff") return fail(reply, { error: "SIN_ACCESO" });
      const r = await verifyRecommendation(db, p.data.id, a.user.id, b.data.note);
      return isFail(r) ? fail(reply, r) : r;
    },
  );

  app.get("/v1/gremio/yo", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return { staff: await getStaff(db, a.user.id) };
  });

  app.get("/v1/gremio/bandeja", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const staff = await getStaff(db, a.user.id);
    if (!staff) return fail(reply, { error: "SIN_ACCESO" });
    return staffInbox(db, staff);
  });

  app.post("/v1/gremio/verificaciones", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = FieldVerificationCreate.safeParse(req.body);
    if (!b.success) return bad(reply);
    const acc = await accessTo(db, a.user, a.memberships, b.data.organizationId);
    if (isFail(acc)) return fail(reply, acc);
    if (acc.kind !== "staff") return fail(reply, { error: "SIN_ACCESO" });
    const r = await createVerification(db, a.user.id, b.data);
    return isFail(r) ? fail(reply, r) : reply.code(201).send(r);
  });

  /* ───── Trazabilidad libre de deforestación (Ley 2585 de 2026; Reglamento (UE) 2023/1115) ───── */

  app.get("/v1/trazabilidad", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success) return bad(reply);
    if (!isMember(a, q.data.organizationId)) return fail(reply, { error: "SIN_ACCESO" });
    return { items: await latestChecks(db, q.data.organizationId) };
  });

  app.post("/v1/trazabilidad/bosque", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = ForestCheckRequest.safeParse(req.body);
    if (!b.success) return bad(reply, "El lindero no es válido o está fuera de Colombia.");
    if (!isMember(a, b.data.organizationId)) return fail(reply, { error: "SIN_ACCESO" });
    try {
      const r = await runCheck(
        db,
        a.user.id,
        b.data,
        opts.forestFetch ? { fetch: opts.forestFetch } : {},
      );
      if ("error" in r) {
        if (r.error === "NO_EXISTE") return fail(reply, { error: "NO_EXISTE" });
        if (r.error === "AREA")
          return bad(reply, "El lindero es demasiado grande para revisarlo de una vez.");
        return reply.code(429).send({
          error: ErrorCodes.LIMITE_DIARIO,
          message: "Ya hizo muchas revisiones hoy. Intente mañana.",
        });
      }
      return reply.code(201).send(r);
    } catch (err) {
      reply.log.warn(err, "bosque");
      return reply.code(502).send({
        error: ErrorCodes.SERVICIO_EXTERNO,
        message: "La capa de bosque de Global Forest Watch no respondió. Intente en un momento.",
      });
    }
  });

  /* ───── Comunidad de productores ───── */

  const listQuery = z.object({
    topic: CommunityTopic.optional(),
    before: z.string().datetime().optional(),
    q: z.string().trim().min(2).max(80).optional(),
  });
  const idParam = z.object({ id: z.string().uuid() });
  const targetParam = z.object({ kind: z.enum(["post", "reply"]), id: z.string().uuid() });
  const notFound = (reply: FastifyReply) =>
    reply.code(404).send({
      error: ErrorCodes.PUBLICACION_NO_EXISTE,
      message: "La publicación ya no está disponible.",
    });
  const tooFast = (reply: FastifyReply) =>
    reply.code(429).send({
      error: ErrorCodes.LIMITE_DIARIO,
      message: "Está publicando muy seguido. Espere unos minutos.",
    });

  app.get("/v1/comunidad", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = listQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: ErrorCodes.VALIDACION, message: "Filtro no válido." });
    return listPosts(db, a.user.id, {
      ...(q.data.topic ? { topic: q.data.topic } : {}),
      ...(q.data.before ? { before: q.data.before } : {}),
      ...(q.data.q ? { q: q.data.q } : {}),
    });
  });

  app.get("/v1/comunidad/:id", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = idParam.safeParse(req.params);
    if (!p.success) return notFound(reply);
    return (await getThread(db, a.user.id, p.data.id)) ?? notFound(reply);
  });

  app.post("/v1/comunidad", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const body = CommunityPostCreate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({
        error: ErrorCodes.VALIDACION,
        message: "Escriba un título (5 a 140 letras) y un mensaje (10 a 4.000 letras).",
      });
    if (!postLimit.take(a.user.id)) return tooFast(reply);
    const orgs = a.memberships.map((m) => m.organizationId);
    return reply.code(201).send(await createPost(db, a.user.id, orgs, body.data));
  });

  app.post("/v1/comunidad/:id/respuestas", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = idParam.safeParse(req.params);
    const body = CommunityReplyCreate.safeParse(req.body);
    if (!p.success) return notFound(reply);
    if (!body.success)
      return reply
        .code(400)
        .send({ error: ErrorCodes.VALIDACION, message: "Escriba una respuesta más completa." });
    if (!postLimit.take(a.user.id)) return tooFast(reply);
    const r = await createReply(db, a.user.id, p.data.id, body.data);
    return r ? reply.code(201).send(r) : notFound(reply);
  });

  app.delete("/v1/comunidad/:kind/:id", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = targetParam.safeParse(req.params);
    if (!p.success || !(await hideOwn(db, a.user.id, p.data.kind, p.data.id)))
      return notFound(reply);
    return { ok: true };
  });

  app.post(
    "/v1/comunidad/:kind/:id/reporte",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = targetParam.safeParse(req.params);
      if (!p.success) return notFound(reply);
      const r = await reportContent(db, a.user.id, p.data.kind, p.data.id);
      return r ?? notFound(reply);
    },
  );

  app.get("/v1/urgencias", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success || !a.memberships.some((m) => m.organizationId === q.data.organizationId))
      return reply
        .code(403)
        .send({ error: ErrorCodes.PERMISO_DENEGADO, message: "Sin acceso a la organización." });
    return { items: await listUrgent(db, a.user.id, a.memberships, q.data.organizationId) };
  });

  // Todas las ganaderías de la persona: así llega aunque su app no sepa aún que la agregaron.
  app.get("/v1/urgencias/mias", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return {
      items: await listMyUrgent(db, a.user.id, a.memberships),
      organizations: [...new Set(a.memberships.map((m) => m.organizationId))],
    };
  });

  app.get("/v1/urgencias/equipo", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success || !a.memberships.some((m) => m.organizationId === q.data.organizationId))
      return reply
        .code(403)
        .send({ error: ErrorCodes.PERMISO_DENEGADO, message: "Sin acceso a la organización." });
    return { team: await urgentTeam(db, q.data.organizationId) };
  });

  app.post("/v1/urgencias", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const b = UrgentAlertCreate.safeParse(req.body);
    if (!b.success)
      return reply.code(400).send({ error: ErrorCodes.VALIDACION, message: "Datos inválidos." });
    if (!a.memberships.some((m) => m.organizationId === b.data.organizationId))
      return reply
        .code(403)
        .send({ error: ErrorCodes.PERMISO_DENEGADO, message: "Sin acceso a la organización." });
    const r = await createUrgent(db, a.user.id, a.memberships, b.data);
    if ("error" in r)
      return r.error === "LIMITE"
        ? reply.code(429).send({
            error: ErrorCodes.LIMITE_DIARIO,
            message: "Ya se enviaron muchos avisos hoy. Llame directamente.",
          })
        : reply.code(404).send({ error: "NO_EXISTE", message: "La finca no existe." });
    return reply.code(201).send(r);
  });

  app.post("/v1/urgencias/:id/atender", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "NO_EXISTE", message: "No existe." });
    const r = await ackUrgent(db, p.data.id, a.user.id, a.memberships);
    if ("error" in r)
      return reply
        .code(r.error === "NO_EXISTE" ? 404 : 403)
        .send({ error: r.error, message: "No puede atender este aviso." });
    return r;
  });

  /** Entrega una foto o video; el iPhone pide los videos por tramos. */
  function sendMedia(req: FastifyRequest, reply: FastifyReply, r: { type: string; data: Buffer }) {
    reply
      .type(r.type)
      .header("content-disposition", "inline")
      .header("content-security-policy", "sandbox")
      .header("accept-ranges", "bytes");
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (!range || (!range[1] && !range[2])) return reply.send(r.data);
    const size = r.data.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size)
      return reply.code(416).header("content-range", `bytes */${size}`).send();
    return reply
      .code(206)
      .header("content-range", `bytes ${start}-${end}/${size}`)
      .send(r.data.subarray(start, end + 1));
  }

  const chatCode = { NO_EXISTE: 404, SIN_ACCESO: 403, SIN_CONFIRMAR: 409, LIMITE: 429 } as const;
  const chatText = {
    NO_EXISTE: "No existe.",
    SIN_ACCESO: "Sin acceso a este chat.",
    SIN_CONFIRMAR: "El chat se abre cuando el veterinario confirma.",
    LIMITE: "Este chat llegó a su límite.",
  } as const;
  const chatFail = (reply: FastifyReply, e: keyof typeof chatCode) =>
    reply.code(chatCode[e]).send({ error: e, message: chatText[e] });
  const alertId = z.object({ id: z.string().uuid() });

  app.get("/v1/urgencias/:id/mensajes", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = alertId.safeParse(req.params);
    if (!p.success) return chatFail(reply, "NO_EXISTE");
    const r = await listMessages(db, p.data.id, a.user.id, a.memberships);
    return "error" in r ? chatFail(reply, r.error) : { items: r };
  });

  app.post(
    "/v1/urgencias/:id/mensajes",
    { preHandler: requireSession, bodyLimit: 4_300_000 },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = alertId.safeParse(req.params);
      const b = UrgentMessageCreate.safeParse(req.body);
      if (!p.success) return chatFail(reply, "NO_EXISTE");
      if (!b.success)
        return reply.code(400).send({
          error: ErrorCodes.VALIDACION,
          message: "Archivo no admitido o demasiado grande (máximo 3 MB).",
        });
      const r = await addUrgentMessage(db, p.data.id, a.user.id, a.memberships, b.data);
      return "error" in r ? chatFail(reply, r.error) : reply.code(201).send(r);
    },
  );

  app.get(
    "/v1/urgencias/:id/mensajes/:mid/archivo",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = z.object({ id: z.string().uuid(), mid: z.string().uuid() }).safeParse(req.params);
      if (!p.success) return chatFail(reply, "NO_EXISTE");
      const r = await urgentMedia(db, p.data.id, p.data.mid, a.user.id, a.memberships);
      if ("error" in r) return chatFail(reply, r.error);
      return sendMedia(req, reply, r);
    },
  );

  /* ───── Chats entre personas del equipo ───── */
  app.get("/v1/chats", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return { items: await listContacts(db, a.user.id, a.memberships) };
  });

  const person = z.object({ userId: z.string().uuid() });

  app.get("/v1/chats/:userId/mensajes", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const p = person.safeParse(req.params);
    if (!p.success) return chatFail(reply, "NO_EXISTE");
    const r = await listDirect(db, a.user.id, a.memberships, p.data.userId);
    return "error" in r ? chatFail(reply, r.error) : { items: r };
  });

  app.post(
    "/v1/chats/:userId/mensajes",
    { preHandler: requireSession, bodyLimit: 4_300_000 },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = person.safeParse(req.params);
      const b = UrgentMessageCreate.safeParse(req.body);
      if (!p.success) return chatFail(reply, "NO_EXISTE");
      if (!b.success)
        return reply.code(400).send({
          error: ErrorCodes.VALIDACION,
          message: "Archivo no admitido o demasiado grande (máximo 3 MB).",
        });
      const r = await sendDirect(db, a.user.id, a.memberships, p.data.userId, b.data);
      return "error" in r ? chatFail(reply, r.error) : reply.code(201).send(r);
    },
  );

  app.get(
    "/v1/chats/:userId/mensajes/:mid/archivo",
    { preHandler: requireSession },
    async (req, reply) => {
      const a = req.auth as NonNullable<FastifyRequest["auth"]>;
      const p = person.extend({ mid: z.string().uuid() }).safeParse(req.params);
      if (!p.success) return chatFail(reply, "NO_EXISTE");
      const r = await directMedia(db, a.user.id, a.memberships, p.data.userId, p.data.mid);
      return "error" in r ? chatFail(reply, r.error) : sendMedia(req, reply, r);
    },
  );

  app.get("/v1/assistant/status", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    const mine =
      q.success && a.memberships.some((m) => m.organizationId === q.data.organizationId)
        ? await orgAi(db, q.data.organizationId)
        : null;
    return { enabled: ask !== null || mine !== null, dailyLimit: DAILY_LIMIT };
  });

  const aiConfig = async (orgId: string, canEdit: boolean): Promise<AiConfigDto> => {
    const row = await orgAi(db, orgId);
    const readable = row !== null && openKey(row.key_cipher) !== null;
    return {
      configured: readable,
      last4: readable ? (row?.key_last4 ?? null) : null,
      model: row?.model ?? DEFAULT_GEMINI_MODEL,
      serverAssistant: ask !== null,
      canEdit,
    };
  };
  const isOwner = (a: NonNullable<FastifyRequest["auth"]>, orgId: string) =>
    a.memberships.some((m) => m.organizationId === orgId && m.role === "propietario");

  app.get("/v1/assistant/config", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const q = orgQuery.safeParse(req.query);
    if (!q.success || !isOwner(a, q.data.organizationId))
      return reply.code(403).send({
        error: ErrorCodes.PERMISO_DENEGADO,
        message: "Solo el propietario configura la IA.",
      });
    return aiConfig(q.data.organizationId, true);
  });

  app.put("/v1/assistant/config", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const body = AiConfigInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({
        error: ErrorCodes.VALIDACION,
        message: "Revise la clave y el nombre del modelo.",
      });
    const { organizationId: orgId, apiKey, model } = body.data;
    if (!isOwner(a, orgId))
      return reply.code(403).send({
        error: ErrorCodes.PERMISO_DENEGADO,
        message: "Solo el propietario configura la IA.",
      });
    if (a.user.email.endsWith("@demo.ganaderia.local") && !(opts.demoSecrets ?? false))
      return reply.code(403).send({
        error: ErrorCodes.PERMISO_DENEGADO,
        message:
          "Las cuentas de muestra son públicas: no se les puede guardar una clave. Use su propia cuenta.",
      });
    if (apiKey === null) {
      await db.admin((q) => q("DELETE FROM org_ai WHERE organization_id = $1", [orgId]));
    } else {
      const check = await checkGemini(apiKey, model, opts.geminiFetch);
      if (check !== "ok")
        return reply.code(422).send({
          error: ErrorCodes.VALIDACION,
          message:
            check === "clave"
              ? "Google no aceptó la clave. Cópiela completa desde Google AI Studio."
              : check === "modelo"
                ? `El modelo «${model}» no está disponible para esa clave.`
                : "No se pudo comprobar la clave con Google. Intente de nuevo.",
        });
      await db.admin((q) =>
        q(
          `INSERT INTO org_ai (organization_id, provider, key_cipher, key_last4, model, updated_by)
           VALUES ($1,'gemini',$2,$3,$4,$5)
           ON CONFLICT (organization_id) DO UPDATE
             SET key_cipher = $2, key_last4 = $3, model = $4, updated_by = $5, updated_at = now()`,
          [orgId, seal(apiKey), apiKey.slice(-4), model, a.user.id],
        ),
      );
    }
    await db.tenant(
      orgId,
      (q) =>
        appendAudit(q, orgId, {
          userId: a.user.id,
          action: apiKey === null ? "ia.clave.quitar" : "ia.clave.guardar",
        }),
      { write: true },
    );
    return aiConfig(orgId, true);
  });

  app.post("/v1/assistant", { preHandler: requireSession }, async (req, reply) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const body = AssistantRequest.safeParse(req.body);
    if (!body.success)
      return reply
        .code(400)
        .send({ error: ErrorCodes.VALIDACION, message: "Escriba una pregunta más corta." });
    const orgId = body.data.organizationId;
    if (!a.memberships.some((m) => m.organizationId === orgId && can(m.role, "farm.read")))
      return reply
        .code(403)
        .send({ error: ErrorCodes.PERMISO_DENEGADO, message: "Sin acceso a la organización." });
    // La clave de la ganadería tiene prioridad sobre el asistente del servidor.
    const own = await orgAi(db, orgId);
    const ownKey = own ? openKey(own.key_cipher) : null;
    // Clave que viene con la pregunta (guardada en el dispositivo): se usa y se olvida.
    const device = body.data.ownAi;
    const model = device
      ? geminiAsk(device.apiKey, device.model, opts.geminiFetch)
      : own && ownKey
        ? geminiAsk(ownKey, own.model, opts.geminiFetch)
        : ask;
    if (!model)
      return reply.code(503).send({
        error: ErrorCodes.ASISTENTE_NO_CONFIGURADO,
        message: "El asistente todavía no está activado en este servidor.",
      });
    // El cupo diario cuida la clave del servidor y la de la ganadería, no la de cada persona.
    if (!body.data.ownAi && !(await takeQuota(db, orgId)))
      return reply.code(429).send({
        error: ErrorCodes.LIMITE_DIARIO,
        message: `Su ganadería ya hizo las ${DAILY_LIMIT} preguntas de hoy. Mañana puede seguir.`,
      });
    // El asistente habla solo de las fincas: no se le entregan noticias ni otras fuentes.
    const context = await farmContext(
      db,
      orgId,
      a.memberships,
      body.data,
      Date.now(),
      body.data.question,
    );
    try {
      const r = await model({
        system: SYSTEM_PROMPT,
        messages: buildMessages(body.data, context),
      });
      await recordTokens(db, orgId, r.inputTokens, r.outputTokens);
      const [u] = await db.admin((q) =>
        q<{ questions: number }>(
          "SELECT questions FROM assistant_usage WHERE organization_id = $1 AND day = CURRENT_DATE",
          [orgId],
        ),
      );
      const left = Math.max(0, DAILY_LIMIT - (u?.questions ?? 0));
      const urgent = r.refused ? null : urgentReason(r.text);
      if (urgent) return { answer: "", urgent, remaining: left };
      const answer =
        r.refused || !r.text
          ? "No puedo ayudar con esa pregunta. Si se trata de la salud de un animal, consulte a su veterinario."
          : r.text;
      return { answer, remaining: left };
    } catch (err) {
      req.log.error(err, "asistente");
      if (body.data.ownAi)
        return reply.code(502).send({
          error: ErrorCodes.ASISTENTE_ERROR,
          message: "Google no respondió con su clave. Revísela en Configuración.",
        });
      return reply.code(502).send({
        error: ErrorCodes.ASISTENTE_ERROR,
        message: "El asistente no respondió. Intente de nuevo en un momento.",
      });
    }
  });

  app.get("/v1/auth/me", { preHandler: requireSession }, async (req) => {
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    return toSessionDto(a.user, a.memberships);
  });

  // Posición aproximada según la IP, que Vercel entrega en cabeceras. Solo sirve para centrar el mapa.
  app.get("/v1/geo/approx", { preHandler: requireSession }, async (req, reply) => {
    const lat = Number(req.headers["x-vercel-ip-latitude"] ?? Number.NaN);
    const lng = Number(req.headers["x-vercel-ip-longitude"] ?? Number.NaN);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return reply.code(404).send({ error: "SIN_UBICACION", message: "Ubicación no disponible." });
    }
    return { lat, lng };
  });

  app.get("/v1/farms", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    if (
      !grants(a.memberships, q.data.organizationId, "farm.read", null) &&
      !a.memberships.some((m) => m.organizationId === q.data.organizationId)
    ) {
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "Sin acceso a la organización." });
    }
    return listFarms(db, q.data.organizationId, a.memberships);
  });

  app.post("/v1/farms", { preHandler: requireSession }, async (req, reply) => {
    const body = FarmCreate.safeParse(req.body);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!body.success)
      return reply.code(400).send({ error: "VALIDACION", message: body.error.issues[0]?.message });
    if (!grants(a.memberships, body.data.organizationId, "farm.write", null)) {
      return reply.code(403).send({ error: "PERMISO_DENEGADO", message: "No puede crear fincas." });
    }
    try {
      return reply.code(201).send(await createFarm(db, a.user, body.data));
    } catch (err) {
      if (String(err).includes("farm_organization_id_code_key")) {
        return reply
          .code(409)
          .send({ error: "CODIGO_DUPLICADO", message: "Ya existe una finca con ese código." });
      }
      throw err;
    }
  });

  app.put("/v1/farms/:id", { preHandler: requireSession }, async (req, reply) => {
    const body = FarmUpdate.safeParse(req.body);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    const id = (req.params as { id: string }).id;
    if (!body.success)
      return reply.code(400).send({ error: "VALIDACION", message: body.error.issues[0]?.message });
    if (!z.string().uuid().safeParse(id).success)
      return reply.code(404).send({ error: "NO_ENCONTRADO", message: "La finca no existe." });
    if (!grants(a.memberships, body.data.organizationId, "farm.write", id)) {
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "No puede editar esta finca." });
    }
    try {
      const farm = await updateFarm(db, a.user, id, body.data);
      if (!farm)
        return reply.code(404).send({ error: "NO_ENCONTRADO", message: "La finca no existe." });
      return farm;
    } catch (err) {
      if (String(err).includes("ESPECIE_CON_ANIMALES")) {
        return reply.code(409).send({
          error: "ESPECIE_CON_ANIMALES",
          message: "No puede quitar una especie que aún tiene animales activos en la finca.",
        });
      }
      throw err;
    }
  });

  app.get("/v1/sync/pull", { preHandler: requireSession }, async (req, reply) => {
    const q = pullQuery.safeParse(req.query);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Parámetros inválidos." });
    if (!a.memberships.some((m) => m.organizationId === q.data.organizationId)) {
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "Sin acceso a la organización." });
    }
    return pull(db, q.data.organizationId, a.memberships, q.data.since, q.data.limit);
  });

  app.post("/v1/sync/push", { preHandler: requireSession }, async (req, reply) => {
    const body = PushRequest.safeParse(req.body);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!body.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Solicitud inválida." });
    if (!a.memberships.some((m) => m.organizationId === body.data.organizationId)) {
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "Sin acceso a la organización." });
    }
    return push(
      db,
      a.user,
      a.memberships,
      body.data.organizationId,
      body.data.deviceId,
      body.data.commands,
    );
  });

  app.get("/v1/audit/verify", { preHandler: requireSession }, async (req, reply) => {
    const q = orgQuery.safeParse(req.query);
    const a = req.auth as NonNullable<FastifyRequest["auth"]>;
    if (!q.success)
      return reply.code(400).send({ error: "VALIDACION", message: "Organización requerida." });
    if (!grants(a.memberships, q.data.organizationId, "audit.read", null)) {
      return reply
        .code(403)
        .send({ error: "PERMISO_DENEGADO", message: "Sin permiso de auditoría." });
    }
    return db.tenant(q.data.organizationId, (qq) => verifyAuditChain(qq, q.data.organizationId));
  });

  // Un solo origen: la landing en «/», la aplicación en «/app/» y la API en «/v1/».
  const { landingDir, appDir } = opts;
  if (landingDir && existsSync(landingDir)) {
    await app.register(fastifyStatic, {
      root: landingDir,
      prefix: "/",
      cacheControl: false,
      setHeaders: staticHeaders,
    });
  }
  if (appDir && existsSync(appDir)) {
    await app.register(fastifyStatic, {
      root: appDir,
      prefix: "/app/",
      redirect: true,
      cacheControl: false,
      decorateReply: Boolean(!landingDir || !existsSync(landingDir)),
      setHeaders: staticHeaders,
    });
  }
  app.get("/app", (_req, reply) => reply.redirect("/app/", 301));
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && req.url.startsWith("/app/") && appDir && existsSync(appDir)) {
      // La aplicación no tiene rutas propias; cualquier ruta bajo /app/ abre su portada.
      return reply.header("cache-control", "no-cache").sendFile("index.html", appDir);
    }
    return reply.code(404).send({ error: "NO_ENCONTRADO", message: "Recurso no encontrado." });
  });

  return app;
}
