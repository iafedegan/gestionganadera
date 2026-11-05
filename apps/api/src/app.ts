import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import {
  AssistantRequest,
  ErrorCodes,
  FarmCreate,
  FarmProfile,
  FarmUpdate,
  InvitationCreate,
  LoginRequest,
  OnboardingRequest,
  PushRequest,
  RegisterInvitedRequest,
  RegisterRequest,
} from "@ganaderia/contracts";
import { can } from "@ganaderia/domain";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AskFn,
  DAILY_LIMIT,
  SYSTEM_PROMPT,
  buildMessages,
  claudeAsk,
  farmContext,
  recordTokens,
  takeQuota,
} from "./assistant.js";
import { appendAudit, verifyAuditChain } from "./audit.js";
import {
  type AuthUser,
  LoginThrottle,
  type Membership,
  grants,
  login,
  logout,
  register,
  registerInvited,
  resolveSession,
  toSessionDto,
} from "./auth.js";
import type { Db } from "./db.js";
import { createFarm, listFarms, pull, push, updateFarm } from "./sync.js";
import {
  acceptInvitation,
  createInvitation,
  getTeam,
  previewInvitation,
  removeMember,
  revokeInvitation,
} from "./team.js";

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
  /** Llamada al modelo del asistente. Por defecto usa ANTHROPIC_API_KEY; en pruebas se inyecta. */
  ask?: AskFn | null;
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
      maxAge: 12 * 3600,
    });
    return toSessionDto(res.user, res.memberships);
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

  const ask =
    opts.ask !== undefined
      ? opts.ask
      : process.env.ANTHROPIC_API_KEY
        ? claudeAsk(process.env.ANTHROPIC_API_KEY)
        : null;

  app.get("/v1/assistant/status", { preHandler: requireSession }, async () => ({
    enabled: ask !== null,
    dailyLimit: DAILY_LIMIT,
  }));

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
    if (!ask)
      return reply.code(503).send({
        error: ErrorCodes.ASISTENTE_NO_CONFIGURADO,
        message: "El asistente todavía no está activado en este servidor.",
      });
    if (!(await takeQuota(db, orgId)))
      return reply.code(429).send({
        error: ErrorCodes.LIMITE_DIARIO,
        message: `Su ganadería ya hizo las ${DAILY_LIMIT} preguntas de hoy. Mañana puede seguir.`,
      });
    const context = await farmContext(db, orgId, a.memberships, body.data);
    try {
      const r = await ask({ system: SYSTEM_PROMPT, messages: buildMessages(body.data, context) });
      await recordTokens(db, orgId, r.inputTokens, r.outputTokens);
      const [u] = await db.admin((q) =>
        q<{ questions: number }>(
          "SELECT questions FROM assistant_usage WHERE organization_id = $1 AND day = CURRENT_DATE",
          [orgId],
        ),
      );
      const answer =
        r.refused || !r.text
          ? "No puedo ayudar con esa pregunta. Si se trata de la salud de un animal, consulte a su veterinario."
          : r.text;
      return { answer, remaining: Math.max(0, DAILY_LIMIT - (u?.questions ?? 0)) };
    } catch (err) {
      req.log.error(err, "asistente");
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
