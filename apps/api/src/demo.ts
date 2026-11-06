import { randomBytes } from "node:crypto";
import { uuidv7 } from "@ganaderia/domain";
import { type Membership, hashPassword, sha256 } from "./auth.js";
import type { Db, Q } from "./db.js";
import { type DemoFarmSpec, type DemoSpec, buildHerd, demoProfile } from "./demoData.js";
import { push, todayIn } from "./sync.js";

/**
 * Cuentas de muestra: cada perfil se crea la primera vez que alguien lo elige y queda guardado.
 * Solo se puede entrar con el selector de la pantalla de ingreso (sin contraseña) y solo si el
 * servidor lo permite; las cuentas no tienen una contraseña con la que alguien pueda iniciar sesión.
 */

const LOCK = 727275;

/** Inserta muchas filas de una vez con `unnest`; los jsonb viajan como texto y se convierten aquí. */
async function bulk(
  q: Q,
  table: string,
  columns: { name: string; type: string }[],
  rows: unknown[][],
): Promise<void> {
  const STEP = 1500;
  for (let i = 0; i < rows.length; i += STEP) {
    const part = rows.slice(i, i + STEP);
    const arrays = columns.map((_, c) => part.map((r) => r[c] ?? null));
    const select = columns.map((c, k) => (c.type === "jsonb" ? `x${k}::jsonb` : `x${k}`));
    const unnest = columns.map((c, k) => `$${k + 1}::${c.type === "jsonb" ? "text" : c.type}[]`);
    const alias = columns.map((_, k) => `x${k}`);
    await q(
      `INSERT INTO ${table} (${columns.map((c) => c.name).join(", ")})
       SELECT ${select.join(", ")} FROM unnest(${unnest.join(", ")}) AS t(${alias.join(", ")})`,
      arrays,
    );
  }
}

const species = (f: DemoFarmSpec) => (f.bufalas > 0 ? ["bovino", "bufalino"] : ["bovino"]);

async function create(db: Db, spec: DemoSpec): Promise<{ userId: string; orgId: string }> {
  const today = todayIn();
  const unusable = await hashPassword(randomBytes(24).toString("hex"));
  return db.admin(async (q) => {
    await q("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    const found = await q<{ id: string; org: string | null; ready: boolean }>(
      `SELECT u.id,
              (SELECT m.organization_id FROM membership m WHERE m.user_id = u.id AND m.farm_id IS NULL
                ORDER BY m.organization_id LIMIT 1) AS org,
              coalesce((SELECT o.herd_estimate->>'demo' = 'true' FROM organization o
                         WHERE o.id = (SELECT m.organization_id FROM membership m WHERE m.user_id = u.id LIMIT 1)), false) AS ready
         FROM app_user u WHERE u.email = $1`,
      [spec.email],
    );
    const existing = found[0];
    if (existing?.ready && existing.org) return { userId: existing.id, orgId: existing.org };
    if (existing) {
      // Un intento anterior quedó a medias: se parte de cero para esa cuenta.
      throw new Error(
        `La cuenta de muestra ${spec.key} quedó incompleta; bórrela y vuelva a intentar.`,
      );
    }

    const herd = buildHerd(spec, today);
    const profile = demoProfile(spec, herd);
    const [u] = await q<{ id: string }>(
      "INSERT INTO app_user (email, display_name, password_hash, onboarding_pending) VALUES ($1,$2,$3,$4) RETURNING id",
      [spec.email, spec.displayName, unusable, spec.onboardingPending],
    );
    const userId = u?.id as string;
    const [o] = await q<{ id: string }>(
      `INSERT INTO organization (name, kind, department, municipality, goals, herd_estimate, created_by, profile, profile_updated_at)
       VALUES ($1,$2,$3,$4,$5,'{"demo": true}'::jsonb,$6,$7, CASE WHEN $7::jsonb IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [
        spec.orgName,
        spec.orgKind,
        spec.department || null,
        spec.municipality || null,
        profile?.goals ?? [],
        userId,
        profile ? JSON.stringify(profile) : null,
      ],
    );
    const orgId = o?.id as string;
    await q(
      "INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,'propietario')",
      [userId, orgId],
    );

    // Fincas.
    const farmIds = spec.farms.map(() => uuidv7());
    const changes: { farmId: string; entity: string; id: string; data: unknown }[] = [];
    for (const [i, f] of spec.farms.entries()) {
      const settings = Object.fromEntries(
        species(f).map((s) => [s, { weaningMonths: 8, dryOffDays: s === "bufalino" ? 270 : 305 }]),
      );
      await q(
        `INSERT INTO farm (id, organization_id, code, name, location_text, species_present, production_focus,
                           production_system, total_area_ha, livestock_area_ha, area_unit, latitude, longitude, species_settings)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ha',$11,$12,$13)`,
        [
          farmIds[i],
          orgId,
          f.code,
          f.name,
          f.municipality,
          species(f),
          f.focus,
          "ciclo_completo",
          f.totalHa,
          f.livestockHa,
          f.lat,
          f.lng,
          JSON.stringify(settings),
        ],
      );
      changes.push({
        farmId: farmIds[i] as string,
        entity: "farm",
        id: farmIds[i] as string,
        data: {
          id: farmIds[i],
          organizationId: orgId,
          code: f.code,
          name: f.name,
          locationText: f.municipality,
          speciesPresent: species(f),
          productionFocus: f.focus,
          productionSystem: "ciclo_completo",
          totalAreaHa: f.totalHa,
          livestockAreaHa: f.livestockHa,
          areaUnit: "ha",
          latitude: f.lat,
          longitude: f.lng,
          speciesSettings: settings,
        },
      });
    }

    // Hato y eventos.
    const { animals, events } = herd;
    const parents = animals.filter((a) => !a.motherId && !a.fatherId);
    const children = animals.filter((a) => a.motherId || a.fatherId);
    const animalCols = [
      { name: "id", type: "uuid" },
      { name: "organization_id", type: "uuid" },
      { name: "farm_id", type: "uuid" },
      { name: "tag", type: "text" },
      { name: "species", type: "text" },
      { name: "sex", type: "text" },
      { name: "category", type: "text" },
      { name: "birth_date", type: "date" },
      { name: "birth_date_precision", type: "text" },
      { name: "mother_id", type: "uuid" },
      { name: "father_id", type: "uuid" },
      { name: "created_by", type: "uuid" },
    ];
    const animalRow = (a: (typeof animals)[number]) => [
      a.id,
      orgId,
      farmIds[a.farm],
      a.tag,
      a.species,
      a.sex,
      a.category,
      a.birthDate,
      "estimada",
      a.motherId,
      a.fatherId,
      userId,
    ];
    await bulk(q, "animal", animalCols, parents.map(animalRow));
    await bulk(q, "animal", animalCols, children.map(animalRow));
    for (const a of animals) {
      changes.push({
        farmId: farmIds[a.farm] as string,
        entity: "animal",
        id: a.id,
        data: {
          id: a.id,
          organizationId: orgId,
          farmId: farmIds[a.farm],
          tag: a.tag,
          species: a.species,
          sex: a.sex,
          category: a.category,
          status: "activo",
          birthDate: { date: a.birthDate, precision: "estimada" },
          motherId: a.motherId,
          fatherId: a.fatherId,
          notes: null,
          entry: {
            reason: a.motherId ? "nacimiento" : "inventario_inicial",
            occurredAt: a.entryDate < a.birthDate ? a.birthDate : a.entryDate,
            origin: null,
          },
        },
      });
    }
    const eventCols = [
      { name: "id", type: "uuid" },
      { name: "organization_id", type: "uuid" },
      { name: "farm_id", type: "uuid" },
      { name: "animal_id", type: "uuid" },
      { name: "type", type: "text" },
      { name: "occurred_on", type: "date" },
      { name: "tz", type: "text" },
      { name: "user_id", type: "uuid" },
      { name: "source", type: "text" },
      { name: "payload", type: "jsonb" },
    ];
    await bulk(
      q,
      "animal_event",
      eventCols,
      animals.map((a) => [
        uuidv7(),
        orgId,
        farmIds[a.farm],
        a.id,
        "entrada",
        a.entryDate < a.birthDate ? a.birthDate : a.entryDate,
        "America/Bogota",
        userId,
        "muestra",
        JSON.stringify({ reason: a.motherId ? "nacimiento" : "inventario_inicial", origin: null }),
      ]),
    );
    await bulk(
      q,
      "animal_event",
      eventCols,
      events.map((e) => [
        e.id,
        orgId,
        farmIds[e.farm],
        e.animalId,
        e.type,
        e.occurredOn,
        "America/Bogota",
        userId,
        "muestra",
        JSON.stringify(e.data),
      ]),
    );
    for (const e of events) {
      changes.push({
        farmId: farmIds[e.farm] as string,
        entity: "animal_event",
        id: e.id,
        data: {
          id: e.id,
          animalId: e.animalId,
          occurredOn: e.occurredOn,
          type: e.type,
          data: e.data,
          organizationId: orgId,
          farmId: farmIds[e.farm],
          recordedBy: spec.displayName,
        },
      });
    }

    // Cambios para la sincronización: se reservan las versiones de una vez.
    if (changes.length > 0) {
      const [c] = await q<{ version: number | string }>(
        `INSERT INTO org_counter (organization_id, version) VALUES ($1, $2)
         ON CONFLICT (organization_id) DO UPDATE SET version = org_counter.version + $2
         RETURNING version`,
        [orgId, changes.length],
      );
      const first = Number(c?.version) - changes.length + 1;
      await bulk(
        q,
        "change",
        [
          { name: "organization_id", type: "uuid" },
          { name: "version", type: "bigint" },
          { name: "farm_id", type: "uuid" },
          { name: "entity", type: "text" },
          { name: "entity_id", type: "uuid" },
          { name: "data", type: "jsonb" },
        ],
        changes.map((ch, i) => [
          orgId,
          first + i,
          ch.farmId,
          ch.entity,
          ch.id,
          JSON.stringify(ch.data),
        ]),
      );
    }

    // Equipo: personas con distintos permisos y una invitación pendiente.
    for (const m of spec.team) {
      const [tu] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
        [m.email, m.displayName, unusable],
      );
      await q(
        "INSERT INTO membership (user_id, organization_id, role, farm_id) VALUES ($1,$2,$3,$4)",
        [tu?.id, orgId, m.role, m.farm === null ? null : farmIds[m.farm]],
      );
    }
    if (spec.pendingInvitation) {
      await q(
        `INSERT INTO invitation (organization_id, code_hash, role, label, expires_at, created_by)
         VALUES ($1,$2,'operario','Nuevo ordeñador (pendiente)', now() + interval '7 days', $3)`,
        [orgId, sha256(randomBytes(16).toString("hex")), userId],
      );
    }
    return { userId, orgId, farmIds } as never;
  }) as Promise<{ userId: string; orgId: string }>;
}

/** Insumos con lotes y consumos, y el mapa de la primera finca, con los mismos comandos de la app. */
async function addSupplies(db: Db, spec: DemoSpec, userId: string, orgId: string) {
  if (!spec.supplies && !spec.map) return;
  const farms = await db.tenant(orgId, (q) =>
    q<{ id: string; code: string }>("SELECT id, code FROM farm ORDER BY code"),
  );
  const farmId = farms.find((f) => f.code === spec.farms[0]?.code)?.id;
  if (!farmId) return;
  const today = todayIn();
  const day = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const env = (type: string, payload: Record<string, unknown>) => ({
    id: uuidv7(),
    type,
    clientTs: new Date().toISOString(),
    payload,
  });
  const sup = (name: string, category: string, unit: string, minStock: number) => ({
    id: uuidv7(),
    name,
    category,
    unit,
    minStock,
  });
  const cmds: unknown[] = [];
  if (spec.supplies) {
    const [vac, iver, conc, mel] = [
      sup("Vacuna antiaftosa", "medicamento", "dosis", 60),
      sup("Ivermectina 1 %", "medicamento", "L", 5),
      sup("Concentrado de levante", "alimento", "bulto", 20),
      sup("Melaza", "alimento", "L", 50),
    ] as const;
    const receive = (
      s: { id: string },
      qty: number,
      ago: number,
      lot: string,
      exp: number,
      cost: number,
    ) =>
      env("stock.receive", {
        supplyId: s.id,
        farmId,
        quantity: qty,
        occurredOn: day(-ago),
        lotCode: lot,
        expiresOn: day(exp),
        unitCost: cost,
        supplier: "Proveedor de muestra",
      });
    const consume = (s: { id: string }, qty: number, ago: number, label: string) =>
      env("stock.consume", {
        supplyId: s.id,
        farmId,
        quantity: qty,
        occurredOn: day(-ago),
        target: { kind: "lote", label },
      });
    cmds.push(
      ...[vac, iver, conc, mel].map((s) => env("supply.create", { ...s })),
      receive(vac, 200, 40, "AF-2610", 200, 3800),
      consume(vac, 90, 8, "Vacunación ciclo"),
      receive(iver, 12, 30, "IV-088", 12 * 30, 58000),
      consume(iver, 8, 6, "Lote de levante"),
      receive(conc, 80, 25, "CL-5521", 90, 74000),
      consume(conc, 62, 3, "Lote de levante"),
      receive(mel, 400, 15, "ME-13", 60, 2400),
    );
  }
  if (spec.map) {
    const f = spec.farms[0] as DemoFarmSpec;
    const dLat = 0.004;
    const dLng = 0.0045;
    const ring = (a: number, b: number, c: number, d: number) => [
      { lat: f.lat + a, lng: f.lng + b },
      { lat: f.lat + a, lng: f.lng + d },
      { lat: f.lat + c, lng: f.lng + d },
      { lat: f.lat + c, lng: f.lng + b },
    ];
    cmds.push(
      env("farm.map.save", {
        farmId,
        baseRevision: 0,
        boundary: ring(-dLat, -dLng, dLat, dLng),
        paddocks: [
          { id: "P1", name: "Potrero 1", forage: "Brachiaria", points: ring(-dLat, -dLng, 0, 0) },
          { id: "P2", name: "Potrero 2", forage: "Brachiaria", points: ring(-dLat, 0, 0, dLng) },
          { id: "P3", name: "Potrero 3", forage: "Estrella", points: ring(0, -dLng, dLat, 0) },
          { id: "P4", name: "Potrero 4", forage: "Estrella", points: ring(0, 0, dLat, dLng) },
        ],
      }),
    );
  }
  const user = { id: userId, email: spec.email, displayName: spec.displayName };
  const memberships: Membership[] = [
    {
      organizationId: orgId,
      organizationName: spec.orgName,
      role: "propietario",
      farmId: null,
      validUntil: null,
    },
  ];
  await push(db, user, memberships, orgId, "muestra", cmds);
}

const ready = new Map<string, Promise<{ userId: string; orgId: string }>>();

/** Crea la cuenta de muestra la primera vez y devuelve su usuario. */
export function ensureDemo(db: Db, spec: DemoSpec): Promise<{ userId: string; orgId: string }> {
  const cached = ready.get(spec.key);
  if (cached) return cached;
  const p = create(db, spec)
    .then(async (r) => {
      await addSupplies(db, spec, r.userId, r.orgId).catch(() => undefined);
      return r;
    })
    .catch((err) => {
      ready.delete(spec.key);
      throw err;
    });
  ready.set(spec.key, p);
  return p;
}

/** Límite simple por IP: evita que alguien llene la base creando y entrando sin parar. */
export class DemoRateLimit {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max = 30,
    private readonly windowMs = 10 * 60_000,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
