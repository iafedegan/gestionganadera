import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { FarmCreate, FarmUpdate, LoginRequest, PushRequest } from "@ganaderia/contracts";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { verifyAuditChain } from "./audit.js";
import {
  type AuthUser,
  LoginThrottle,
  type Membership,
  grants,
  login,
  logout,
  resolveSession,
  toSessionDto,
} from "./auth.js";
import type { Db } from "./db.js";
import { createFarm, listFarms, pull, push, updateFarm } from "./sync.js";

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

  app.post("/v1/auth/logout", async (req, reply) => {
    await logout(db, req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
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
