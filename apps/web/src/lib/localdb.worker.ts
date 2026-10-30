/// <reference lib="webworker" />
import type {
  AnimalCommand,
  AnimalDto,
  Change,
  CommandEnvelope,
  ConsumeTarget,
  FarmMapSaveCommand,
  LatLng,
  MapPaddock,
  StockConsumeCommand,
  StockReceiveCommand,
  SupplyCreateCommand,
} from "@ganaderia/contracts";
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";

/**
 * Base local cifrada. Las columnas de búsqueda (arete, especie, finca, estado) quedan en claro;
 * el resto de cada registro y el cuerpo de cada comando se cifran con AES-GCM.
 * La clave de datos se guarda envuelta con una clave derivada de la contraseña (PBKDF2) y solo
 * existe sin envolver, como CryptoKey no extraíble, en la memoria de este Worker.
 */

export interface Keystore {
  salt: string;
  iv: string;
  wrapped: string;
  iterations: number;
}

export type SyncState = "pendiente" | "sincronizado" | "rechazado" | "conflicto";

export interface LocalAnimal {
  id: string;
  orgId: string;
  farmId: string;
  tag: string;
  species: string;
  sex: string;
  category: string;
  status: string;
  syncState: SyncState;
}

export interface AnimalDetail extends LocalAnimal {
  birthDate: AnimalDto["birthDate"];
  motherId: string | null;
  fatherId: string | null;
  notes: string | null;
  entry: AnimalDto["entry"];
}

export interface OutboxItem {
  id: string;
  orgId: string;
  kind: CommandEnvelope["type"];
  /** Texto corto para reconocer el registro (arete, nombre del insumo…). */
  label: string;
  state: "pendiente" | "enviado" | "rechazado" | "conflicto";
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface MapPayload {
  boundary: LatLng[] | null;
  paddocks: MapPaddock[];
  updatedAt: string;
  updatedBy: string;
}

export interface LocalFarmMap extends MapPayload {
  farmId: string;
  /** Revisión del servidor sobre la que se editó lo que se ve. */
  revision: number;
  /** Última revisión conocida del servidor. */
  serverRevision: number;
  syncState: SyncState;
  /** Versión del servidor, por si hay cambios locales en conflicto. */
  server: MapPayload | null;
}

export interface SupplyLot {
  lotCode: string | null;
  expiresOn: string | null;
  balance: number;
}

export interface SupplyOverview {
  id: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  syncState: SyncState;
  /** Existencia confirmada por el servidor. */
  onHand: number;
  /** Cambio por registros aún sin enviar (positivo recibe, negativo consume). */
  pending: number;
  lots: SupplyLot[];
  nearestExpiry: string | null;
}

export interface StockRow {
  id: string;
  farmId: string;
  kind: "entrada" | "consumo";
  quantity: number;
  lotCode: string | null;
  expiresOn: string | null;
  occurredOn: string;
  unitCost: number | null;
  supplier: string | null;
  target: ConsumeTarget | null;
  note: string | null;
  pending: boolean;
}

const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let db: Database | undefined;
let key: CryptoKey | undefined;
let currentUser: string | undefined;

async function kek(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(text: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!key) throw new Error("BLOQUEADO");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

async function unseal(blob: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!key) throw new Error("BLOQUEADO");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.slice(0, 12) },
    key,
    blob.slice(12),
  );
  return dec.decode(pt);
}

function requireDb(): Database {
  if (!db || !key) throw new Error("BLOQUEADO");
  return db;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS farm (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, species TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS animal (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, farm_id TEXT NOT NULL, tag TEXT NOT NULL,
    species TEXT NOT NULL, sex TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
    sync_state TEXT NOT NULL, payload BLOB NOT NULL);
  CREATE INDEX IF NOT EXISTS animal_tag ON animal (tag);
  CREATE INDEX IF NOT EXISTS animal_org ON animal (org_id, status);
  CREATE TABLE IF NOT EXISTS supply (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
    unit TEXT NOT NULL, min_stock REAL NOT NULL DEFAULT 0, sync_state TEXT NOT NULL, payload BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS stock_movement (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, farm_id TEXT NOT NULL, supply_id TEXT NOT NULL,
    kind TEXT NOT NULL, quantity REAL NOT NULL, lot_code TEXT, expires_on TEXT, occurred_on TEXT NOT NULL,
    payload BLOB NOT NULL);
  CREATE INDEX IF NOT EXISTS stock_by_supply ON stock_movement (supply_id, farm_id);
  CREATE TABLE IF NOT EXISTS farm_map (
    farm_id TEXT PRIMARY KEY, org_id TEXT NOT NULL, revision INTEGER NOT NULL,
    server_revision INTEGER NOT NULL DEFAULT 0, sync_state TEXT NOT NULL,
    payload BLOB NOT NULL, server_payload BLOB);
`;

const OUTBOX = `
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, org_id TEXT NOT NULL,
    kind TEXT NOT NULL, entity_id TEXT, label TEXT NOT NULL,
    supply_id TEXT, farm_id TEXT, qty_delta REAL,
    state TEXT NOT NULL, body BLOB NOT NULL,
    error_code TEXT, error_msg TEXT, created_at TEXT NOT NULL, sent_at TEXT);
`;

/** Versión 2: cola de comandos genérica (antes solo altas de animales) y tablas de insumos. */
function migrate(d: Database): void {
  const version = Number(d.selectValue("PRAGMA user_version"));
  const legacy =
    Number(
      d.selectValue("SELECT count(*) FROM pragma_table_info('outbox') WHERE name = 'animal_id'"),
    ) > 0;
  if (legacy) d.exec("ALTER TABLE outbox RENAME TO outbox_v1");
  d.exec(SCHEMA);
  d.exec(OUTBOX);
  if (legacy) {
    d.exec(`INSERT INTO outbox (seq, id, org_id, kind, entity_id, label, state, body, error_code, error_msg, created_at, sent_at)
            SELECT o.seq, o.id, o.org_id, 'animal.register', o.animal_id, coalesce(a.tag, '(sin arete)'),
                   o.state, o.body, o.error_code, o.error_msg, o.created_at, o.sent_at
              FROM outbox_v1 o LEFT JOIN animal a ON a.id = o.animal_id;
            DROP TABLE outbox_v1;`);
  }
  if (version < 3) d.exec("PRAGMA user_version = 3");
}

async function openDb(userId: string): Promise<void> {
  if (db && currentUser === userId) return;
  db?.close();
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "ganaderia-pool", clearOnInit: false });
  db = new pool.OpfsSAHPoolDb(`/ganaderia-${userId}.db`);
  migrate(db);
  currentUser = userId;
}

const api = {
  /** Abre la base del usuario y desbloquea la clave. Con `keystore` nulo crea una clave nueva. */
  async unlock(args: {
    userId: string;
    password: string;
    keystore: Keystore | null;
  }): Promise<{ keystore: Keystore; created: boolean }> {
    key = undefined;
    let store = args.keystore;
    let created = false;
    if (store) {
      try {
        const wrapKey = await kek(args.password, unb64(store.salt), store.iterations);
        const raw = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(store.iv) },
          wrapKey,
          unb64(store.wrapped),
        );
        key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
      } catch {
        throw new Error("CLAVE_INCORRECTA");
      }
    } else {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const wrapKey = await kek(args.password, salt, PBKDF2_ITERATIONS);
      const wrapped = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, raw),
      );
      store = {
        salt: b64(salt),
        iv: b64(iv),
        wrapped: b64(wrapped),
        iterations: PBKDF2_ITERATIONS,
      };
      key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
      created = true;
    }
    try {
      await openDb(args.userId);
    } catch (err) {
      key = undefined;
      throw new Error(`ALMACENAMIENTO: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { keystore: store, created };
  },

  /** Olvida la clave en memoria. Los datos quedan cifrados en el dispositivo. */
  lock(): void {
    key = undefined;
  },

  /** Borra los datos locales del usuario (uso: contraseña cambiada o cierre definitivo). */
  wipe(): void {
    const d = requireDb();
    d.exec(
      "DELETE FROM animal; DELETE FROM farm; DELETE FROM supply; DELETE FROM stock_movement; DELETE FROM farm_map; DELETE FROM outbox; DELETE FROM meta;",
    );
  },

  getMeta(k: string): string | null {
    const v = requireDb().selectValue("SELECT v FROM meta WHERE k = ?", [k]);
    return typeof v === "string" ? v : null;
  },

  setMeta(k: string, v: string): void {
    requireDb().exec({
      sql: "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
      bind: [k, v],
    });
  },

  async applyPull(args: {
    changes: Change[];
    cursor: number;
    scope: string;
  }): Promise<{ applied: number }> {
    const d = requireDb();
    const prepared: { c: Change; payload?: Uint8Array<ArrayBuffer> }[] = [];
    for (const c of args.changes) {
      if (c.entity === "animal") {
        const { data } = c;
        prepared.push({
          c,
          payload: await seal(
            JSON.stringify({
              birthDate: data.birthDate,
              motherId: data.motherId,
              fatherId: data.fatherId,
              notes: data.notes,
              entry: data.entry,
            }),
          ),
        });
      } else if (c.entity === "supply") {
        prepared.push({ c, payload: await seal(JSON.stringify({ notes: c.data.notes })) });
      } else if (c.entity === "stock_movement") {
        const m = c.data;
        prepared.push({
          c,
          payload: await seal(
            JSON.stringify({
              unitCost: m.unitCost,
              supplier: m.supplier,
              target: m.target,
              note: m.note,
            }),
          ),
        });
      } else if (c.entity === "farm_map") {
        const m = c.data;
        prepared.push({
          c,
          payload: await seal(
            JSON.stringify({
              boundary: m.boundary,
              paddocks: m.paddocks,
              updatedAt: m.updatedAt,
              updatedBy: m.updatedBy,
            }),
          ),
        });
      } else prepared.push({ c });
    }
    d.exec("BEGIN");
    try {
      for (const { c, payload } of prepared) {
        if (c.entity === "farm") {
          d.exec({
            sql: `INSERT INTO farm (id, org_id, code, name, species) VALUES (?,?,?,?,?)
                  ON CONFLICT (id) DO UPDATE SET code=excluded.code, name=excluded.name, species=excluded.species`,
            bind: [
              c.data.id,
              c.data.organizationId,
              c.data.code,
              c.data.name,
              c.data.speciesPresent.join(","),
            ],
          });
        } else if (c.entity === "animal") {
          const a = c.data;
          d.exec({
            sql: `INSERT INTO animal (id, org_id, farm_id, tag, species, sex, category, status, sync_state, payload)
                  VALUES (?,?,?,?,?,?,?,?,'sincronizado',?)
                  ON CONFLICT (id) DO UPDATE SET farm_id=excluded.farm_id, tag=excluded.tag, species=excluded.species,
                    sex=excluded.sex, category=excluded.category, status=excluded.status,
                    sync_state='sincronizado', payload=excluded.payload`,
            bind: [
              a.id,
              a.organizationId,
              a.farmId,
              a.tag,
              a.species,
              a.sex,
              a.category,
              a.status,
              payload as Uint8Array<ArrayBuffer>,
            ],
          });
        } else if (c.entity === "supply") {
          const u = c.data;
          d.exec({
            sql: `INSERT INTO supply (id, org_id, name, category, unit, min_stock, sync_state, payload)
                  VALUES (?,?,?,?,?,?,'sincronizado',?)
                  ON CONFLICT (id) DO UPDATE SET name=excluded.name, category=excluded.category, unit=excluded.unit,
                    min_stock=excluded.min_stock, sync_state='sincronizado', payload=excluded.payload`,
            bind: [
              u.id,
              u.organizationId,
              u.name,
              u.category,
              u.unit,
              u.minStock,
              payload as Uint8Array<ArrayBuffer>,
            ],
          });
        } else if (c.entity === "farm_map") {
          const m = c.data;
          // Con cambios locales sin confirmar, solo se guarda la versión del servidor aparte:
          // así el usuario decide en caso de conflicto y nada se pierde.
          d.exec({
            sql: `INSERT INTO farm_map (farm_id, org_id, revision, server_revision, sync_state, payload, server_payload)
                  VALUES (?,?,?,?,'sincronizado',?,?)
                  ON CONFLICT (farm_id) DO UPDATE SET
                    server_revision = excluded.server_revision, server_payload = excluded.server_payload,
                    revision = CASE WHEN farm_map.sync_state = 'sincronizado' THEN excluded.revision ELSE farm_map.revision END,
                    payload = CASE WHEN farm_map.sync_state = 'sincronizado' THEN excluded.payload ELSE farm_map.payload END
                  WHERE excluded.server_revision >= farm_map.server_revision`,
            bind: [
              m.farmId,
              m.organizationId,
              m.revision,
              m.revision,
              payload as Uint8Array<ArrayBuffer>,
              payload as Uint8Array<ArrayBuffer>,
            ],
          });
        } else {
          const m = c.data;
          d.exec({
            sql: `INSERT OR REPLACE INTO stock_movement
                  (id, org_id, farm_id, supply_id, kind, quantity, lot_code, expires_on, occurred_on, payload)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`,
            bind: [
              m.id,
              m.organizationId,
              m.farmId,
              m.supplyId,
              m.kind,
              m.quantity,
              m.lotCode,
              m.expiresOn,
              m.occurredOn,
              payload as Uint8Array<ArrayBuffer>,
            ],
          });
        }
      }
      d.exec({
        sql: "INSERT INTO meta (k, v) VALUES ('cursor', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
        bind: [String(args.cursor)],
      });
      d.exec({
        sql: "INSERT INTO meta (k, v) VALUES ('scope', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
        bind: [args.scope],
      });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
    return { applied: prepared.length };
  },

  /** El alcance de fincas cambió: se descarta lo sincronizado y se conserva lo pendiente. */
  resetSynced(): void {
    const d = requireDb();
    d.exec(
      "DELETE FROM animal WHERE sync_state = 'sincronizado'; DELETE FROM supply WHERE sync_state = 'sincronizado'; DELETE FROM stock_movement; DELETE FROM farm_map WHERE sync_state = 'sincronizado'; DELETE FROM farm; DELETE FROM meta WHERE k IN ('cursor','scope');",
    );
  },

  listFarms(orgId: string): { id: string; code: string; name: string; species: string }[] {
    return requireDb().selectObjects(
      "SELECT id, code, name, species FROM farm WHERE org_id = ? ORDER BY name",
      [orgId],
    ) as { id: string; code: string; name: string; species: string }[];
  },

  listAnimals(args: {
    orgId: string;
    q?: string;
    species?: string;
    category?: string;
    farmId?: string;
    limit?: number;
  }): LocalAnimal[] {
    const where = ["org_id = ?"];
    const bind: (string | number)[] = [args.orgId];
    if (args.q) {
      where.push("tag LIKE ?");
      bind.push(`%${args.q.trim().toUpperCase()}%`);
    }
    if (args.species) {
      where.push("species = ?");
      bind.push(args.species);
    }
    if (args.category) {
      where.push("category = ?");
      bind.push(args.category);
    }
    if (args.farmId) {
      where.push("farm_id = ?");
      bind.push(args.farmId);
    }
    bind.push(args.limit ?? 200);
    const rows = requireDb().selectObjects(
      `SELECT id, org_id, farm_id, tag, species, sex, category, status, sync_state FROM animal
        WHERE ${where.join(" AND ")} ORDER BY tag LIMIT ?`,
      bind,
    ) as Record<string, string>[];
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      farmId: r.farm_id as string,
      tag: r.tag as string,
      species: r.species as string,
      sex: r.sex as string,
      category: r.category as string,
      status: r.status as string,
      syncState: r.sync_state as SyncState,
    }));
  },

  async getAnimal(id: string): Promise<AnimalDetail | null> {
    const rows = requireDb().selectObjects("SELECT * FROM animal WHERE id = ?", [id]) as Record<
      string,
      unknown
    >[];
    const r = rows[0];
    if (!r) return null;
    const extra = JSON.parse(await unseal(r.payload as Uint8Array<ArrayBuffer>)) as Pick<
      AnimalDetail,
      "birthDate" | "motherId" | "fatherId" | "notes" | "entry"
    >;
    return {
      id: r.id as string,
      orgId: r.org_id as string,
      farmId: r.farm_id as string,
      tag: r.tag as string,
      species: r.species as string,
      sex: r.sex as string,
      category: r.category as string,
      status: r.status as string,
      syncState: r.sync_state as SyncState,
      ...extra,
    };
  },

  counts(orgId: string): { total: number; bovino: number; bufalino: number } {
    const rows = requireDb().selectObjects(
      "SELECT species, count(*) AS n FROM animal WHERE org_id = ? AND status = 'activo' GROUP BY species",
      [orgId],
    ) as { species: string; n: number }[];
    const n = (s: string) => rows.find((r) => r.species === s)?.n ?? 0;
    return {
      total: rows.reduce((a, r) => a + r.n, 0),
      bovino: n("bovino"),
      bufalino: n("bufalino"),
    };
  },

  /** Alta local: guarda el animal como pendiente y encola el comando en la misma transacción. */
  async enqueueRegister(args: {
    orgId: string;
    command: AnimalCommand;
  }): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const d = requireDb();
    const p = args.command.payload;
    const dup = d.selectValue(
      "SELECT id FROM animal WHERE org_id = ? AND tag = ? AND status = 'activo' AND id <> ? LIMIT 1",
      [args.orgId, p.tag, p.id],
    );
    if (dup) {
      return {
        ok: false,
        code: "TAG_DUPLICADO",
        message: `Ya existe un animal activo con el arete ${p.tag}.`,
      };
    }
    const payload = await seal(
      JSON.stringify({
        birthDate: p.birthDate ?? null,
        motherId: p.motherId ?? null,
        fatherId: p.fatherId ?? null,
        notes: p.notes ?? null,
        entry: {
          reason: p.entry.reason,
          occurredAt: p.entry.occurredAt,
          origin: p.entry.origin ?? null,
        },
      }),
    );
    const body = await seal(JSON.stringify(args.command));
    d.exec("BEGIN");
    try {
      d.exec({
        sql: `INSERT INTO animal (id, org_id, farm_id, tag, species, sex, category, status, sync_state, payload)
              VALUES (?,?,?,?,?,?,?,'activo','pendiente',?)
              ON CONFLICT (id) DO UPDATE SET farm_id=excluded.farm_id, tag=excluded.tag, species=excluded.species,
                sex=excluded.sex, category=excluded.category, sync_state='pendiente', payload=excluded.payload`,
        bind: [p.id, args.orgId, p.farmId, p.tag, p.species, p.sex, p.category, payload],
      });
      d.exec({
        sql: "INSERT INTO outbox (id, org_id, kind, entity_id, label, state, body, created_at) VALUES (?,?,'animal.register',?,?,'pendiente',?,?)",
        bind: [args.command.id, args.orgId, p.id, p.tag, body, new Date().toISOString()],
      });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
    return { ok: true };
  },

  async outboxPending(limit: number): Promise<CommandEnvelope[]> {
    const rows = requireDb().selectObjects(
      "SELECT body FROM outbox WHERE state = 'pendiente' ORDER BY seq LIMIT ?",
      [limit],
    ) as { body: Uint8Array<ArrayBuffer> }[];
    const out: CommandEnvelope[] = [];
    for (const r of rows) out.push(JSON.parse(await unseal(r.body)) as CommandEnvelope);
    return out;
  },

  outboxMark(
    results: {
      id: string;
      status: "accepted" | "rejected" | "conflict";
      code?: string;
      message?: string;
    }[],
  ): void {
    const d = requireDb();
    d.exec("BEGIN");
    try {
      for (const r of results) {
        const state =
          r.status === "accepted" ? "enviado" : r.status === "rejected" ? "rechazado" : "conflicto";
        d.exec({
          sql: "UPDATE outbox SET state = ?, error_code = ?, error_msg = ?, sent_at = ? WHERE id = ?",
          bind: [state, r.code ?? null, r.message ?? null, new Date().toISOString(), r.id],
        });
        const animalState: SyncState =
          r.status === "accepted"
            ? "sincronizado"
            : r.status === "rejected"
              ? "rechazado"
              : "conflicto";
        d.exec({
          sql: "UPDATE animal SET sync_state = ? WHERE id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'animal.register')",
          bind: [animalState, r.id],
        });
        d.exec({
          sql: "UPDATE supply SET sync_state = ? WHERE id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'supply.create')",
          bind: [animalState, r.id],
        });
        d.exec({
          sql: "UPDATE farm_map SET sync_state = ? WHERE farm_id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'farm.map.save')",
          bind: [animalState, r.id],
        });
      }
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
  },

  outboxList(orgId: string): OutboxItem[] {
    const rows = requireDb().selectObjects(
      `SELECT id, org_id, kind, label, state, error_code, error_msg, created_at
         FROM outbox WHERE org_id = ? AND state <> 'enviado' ORDER BY seq DESC`,
      [orgId],
    ) as Record<string, string | null>[];
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      kind: r.kind as OutboxItem["kind"],
      label: r.label as string,
      state: r.state as OutboxItem["state"],
      errorCode: r.error_code ?? null,
      errorMessage: r.error_msg ?? null,
      createdAt: r.created_at as string,
    }));
  },

  /** Descarta un comando fallido y el animal local que nunca llegó a confirmarse. */
  outboxDiscard(id: string): void {
    const d = requireDb();
    d.exec("BEGIN");
    try {
      d.exec({
        sql: "DELETE FROM animal WHERE sync_state IN ('rechazado','conflicto','pendiente') AND id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'animal.register')",
        bind: [id],
      });
      d.exec({
        sql: "DELETE FROM supply WHERE sync_state IN ('rechazado','conflicto','pendiente') AND id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'supply.create')",
        bind: [id],
      });
      d.exec({
        sql: `UPDATE farm_map SET payload = coalesce(server_payload, payload), revision = server_revision, sync_state = 'sincronizado'
               WHERE server_payload IS NOT NULL AND farm_id = (SELECT entity_id FROM outbox WHERE id = ? AND kind = 'farm.map.save')`,
        bind: [id],
      });
      d.exec({ sql: "DELETE FROM outbox WHERE id = ?", bind: [id] });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
  },

  /** Recupera el comando original para corregirlo y reenviarlo con un identificador nuevo. */
  async outboxGetCommand(id: string): Promise<CommandEnvelope | null> {
    const rows = requireDb().selectObjects("SELECT body FROM outbox WHERE id = ?", [id]) as {
      body: Uint8Array<ArrayBuffer>;
    }[];
    const r = rows[0];
    return r ? (JSON.parse(await unseal(r.body)) as CommandEnvelope) : null;
  },

  /** Alta local de un insumo: queda pendiente y se encola. */
  async enqueueSupplyCreate(args: {
    orgId: string;
    command: SupplyCreateCommand;
  }): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const d = requireDb();
    const p = args.command.payload;
    const dup = d.selectValue(
      "SELECT id FROM supply WHERE org_id = ? AND lower(name) = lower(?) AND id <> ? LIMIT 1",
      [args.orgId, p.name, p.id],
    );
    if (dup)
      return { ok: false, code: "INSUMO_DUPLICADO", message: `Ya existe el insumo «${p.name}».` };
    const payload = await seal(JSON.stringify({ notes: p.notes ?? null }));
    const body = await seal(JSON.stringify(args.command));
    d.exec("BEGIN");
    try {
      d.exec({
        sql: `INSERT INTO supply (id, org_id, name, category, unit, min_stock, sync_state, payload)
              VALUES (?,?,?,?,?,?,'pendiente',?)
              ON CONFLICT (id) DO UPDATE SET name=excluded.name, category=excluded.category, unit=excluded.unit,
                min_stock=excluded.min_stock, sync_state='pendiente', payload=excluded.payload`,
        bind: [p.id, args.orgId, p.name, p.category, p.unit, p.minStock ?? 0, payload],
      });
      d.exec({
        sql: "INSERT INTO outbox (id, org_id, kind, entity_id, label, state, body, created_at) VALUES (?,?,'supply.create',?,?,'pendiente',?,?)",
        bind: [args.command.id, args.orgId, p.id, p.name, body, new Date().toISOString()],
      });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
    return { ok: true };
  },

  /** Recepción o consumo local. El consumo se valida contra la existencia vigente conocida. */
  async enqueueStock(args: {
    orgId: string;
    label: string;
    command: StockReceiveCommand | StockConsumeCommand;
  }): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const d = requireDb();
    const { command } = args;
    const p = command.payload;
    let delta = p.quantity;
    if (command.type === "stock.consume") {
      const lots = d.selectObjects(
        `SELECT expires_on, sum(CASE kind WHEN 'entrada' THEN quantity ELSE -quantity END) AS bal
           FROM stock_movement WHERE supply_id = ? AND farm_id = ?
          GROUP BY lot_code, expires_on HAVING bal > 0`,
        [p.supplyId, p.farmId],
      ) as { expires_on: string | null; bal: number }[];
      const vigente = lots
        .filter((l) => !(l.expires_on && l.expires_on < command.payload.occurredOn))
        .reduce((a, l) => a + l.bal, 0);
      const pendiente = Number(
        d.selectValue(
          "SELECT coalesce(sum(qty_delta), 0) FROM outbox WHERE state = 'pendiente' AND supply_id = ? AND farm_id = ?",
          [p.supplyId, p.farmId],
        ),
      );
      const disponible = Math.round((vigente + pendiente) * 1000) / 1000;
      if (p.quantity > disponible) {
        return {
          ok: false,
          code: "STOCK_INSUFICIENTE",
          message: `Existencia insuficiente: hay ${disponible} disponibles en este dispositivo.`,
        };
      }
      delta = -p.quantity;
    }
    const body = await seal(JSON.stringify(command));
    d.exec({
      sql: `INSERT INTO outbox (id, org_id, kind, entity_id, label, supply_id, farm_id, qty_delta, state, body, created_at)
            VALUES (?,?,?,?,?,?,?,?,'pendiente',?,?)`,
      bind: [
        command.id,
        args.orgId,
        command.type,
        p.supplyId,
        args.label,
        p.supplyId,
        p.farmId,
        delta,
        body,
        new Date().toISOString(),
      ],
    });
    return { ok: true };
  },

  /** Mapa de la finca tal como lo ve este dispositivo (incluidos cambios sin enviar). */
  async getFarmMap(farmId: string): Promise<LocalFarmMap | null> {
    const rows = requireDb().selectObjects(
      "SELECT farm_id, revision, server_revision, sync_state, payload, server_payload FROM farm_map WHERE farm_id = ?",
      [farmId],
    ) as {
      farm_id: string;
      revision: number;
      server_revision: number;
      sync_state: SyncState;
      payload: Uint8Array<ArrayBuffer>;
      server_payload: Uint8Array<ArrayBuffer> | null;
    }[];
    const r = rows[0];
    if (!r) return null;
    const mine = JSON.parse(await unseal(r.payload)) as MapPayload;
    const server = r.server_payload
      ? (JSON.parse(await unseal(r.server_payload)) as MapPayload)
      : null;
    return {
      farmId: r.farm_id,
      revision: Number(r.revision),
      serverRevision: Number(r.server_revision),
      syncState: r.sync_state,
      boundary: mine.boundary,
      paddocks: mine.paddocks,
      updatedAt: mine.updatedAt,
      updatedBy: mine.updatedBy,
      server,
    };
  },

  /**
   * Guarda el mapa en el dispositivo y encola su envío. Solo importa el último estado del mapa,
   * así que un guardado reemplaza al comando anterior que aún no salió.
   */
  async enqueueFarmMap(args: {
    orgId: string;
    command: FarmMapSaveCommand;
    updatedBy: string;
  }): Promise<void> {
    const d = requireDb();
    const p = args.command.payload;
    const payload = await seal(
      JSON.stringify({
        boundary: p.boundary,
        paddocks: p.paddocks,
        updatedAt: new Date().toISOString(),
        updatedBy: args.updatedBy,
      }),
    );
    const body = await seal(JSON.stringify(args.command));
    d.exec("BEGIN");
    try {
      d.exec({
        sql: "DELETE FROM outbox WHERE kind = 'farm.map.save' AND entity_id = ? AND state IN ('pendiente','conflicto','rechazado')",
        bind: [p.farmId],
      });
      d.exec({
        sql: `INSERT INTO farm_map (farm_id, org_id, revision, server_revision, sync_state, payload)
              VALUES (?,?,?,?,'pendiente',?)
              ON CONFLICT (farm_id) DO UPDATE SET revision = excluded.revision, sync_state = 'pendiente', payload = excluded.payload`,
        bind: [p.farmId, args.orgId, p.baseRevision, p.baseRevision, payload],
      });
      d.exec({
        sql: "INSERT INTO outbox (id, org_id, kind, entity_id, label, farm_id, state, body, created_at) VALUES (?,?,'farm.map.save',?,?,?,'pendiente',?,?)",
        bind: [
          args.command.id,
          args.orgId,
          p.farmId,
          "Mapa de la finca",
          p.farmId,
          body,
          new Date().toISOString(),
        ],
      });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
  },

  /** Conflicto resuelto a favor del servidor: se descartan los cambios locales del mapa. */
  useServerFarmMap(farmId: string): void {
    const d = requireDb();
    d.exec("BEGIN");
    try {
      d.exec({
        sql: "DELETE FROM outbox WHERE kind = 'farm.map.save' AND entity_id = ? AND state <> 'enviado'",
        bind: [farmId],
      });
      d.exec({
        sql: "UPDATE farm_map SET payload = coalesce(server_payload, payload), revision = server_revision, sync_state = 'sincronizado' WHERE farm_id = ?",
        bind: [farmId],
      });
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
  },

  /** Resumen de existencias por insumo: confirmado, pendiente, lotes y vencimiento más próximo. */
  supplyOverview(args: { orgId: string; farmId?: string }): SupplyOverview[] {
    const d = requireDb();
    const farm = args.farmId ? " AND farm_id = ?" : "";
    const fbind = args.farmId ? [args.orgId, args.farmId] : [args.orgId];
    const supplies = d.selectObjects(
      "SELECT id, name, category, unit, min_stock, sync_state FROM supply WHERE org_id = ? ORDER BY name",
      [args.orgId],
    ) as Record<string, string | number>[];
    const lots = d.selectObjects(
      `SELECT supply_id, lot_code, expires_on,
              sum(CASE kind WHEN 'entrada' THEN quantity ELSE -quantity END) AS bal
         FROM stock_movement WHERE org_id = ?${farm}
        GROUP BY supply_id, lot_code, expires_on HAVING bal > 0.0005`,
      fbind,
    ) as { supply_id: string; lot_code: string | null; expires_on: string | null; bal: number }[];
    const pend = d.selectObjects(
      `SELECT supply_id, sum(qty_delta) AS delta FROM outbox
        WHERE org_id = ? AND state = 'pendiente' AND supply_id IS NOT NULL${farm}
        GROUP BY supply_id`,
      fbind,
    ) as { supply_id: string; delta: number }[];
    return supplies.map((s) => {
      const mine = lots
        .filter((l) => l.supply_id === s.id)
        .map((l) => ({
          lotCode: l.lot_code,
          expiresOn: l.expires_on,
          balance: Math.round(l.bal * 1000) / 1000,
        }))
        .sort((a, b) => ((a.expiresOn ?? "9999") < (b.expiresOn ?? "9999") ? -1 : 1));
      const expiries = mine.map((l) => l.expiresOn).filter((x): x is string => x !== null);
      return {
        id: s.id as string,
        name: s.name as string,
        category: s.category as string,
        unit: s.unit as string,
        minStock: Number(s.min_stock),
        syncState: s.sync_state as SyncState,
        onHand: Math.round(mine.reduce((a, l) => a + l.balance, 0) * 1000) / 1000,
        pending:
          Math.round(Number(pend.find((p) => p.supply_id === s.id)?.delta ?? 0) * 1000) / 1000,
        lots: mine,
        nearestExpiry: expiries.length ? (expiries.sort()[0] ?? null) : null,
      };
    });
  },

  /** Historial de un insumo: movimientos confirmados y registros pendientes de enviar. */
  async stockMovements(args: { orgId: string; supplyId: string; limit?: number }): Promise<
    StockRow[]
  > {
    const d = requireDb();
    const rows = d.selectObjects(
      `SELECT * FROM stock_movement WHERE org_id = ? AND supply_id = ?
        ORDER BY occurred_on DESC, rowid DESC LIMIT ?`,
      [args.orgId, args.supplyId, args.limit ?? 60],
    ) as Record<string, unknown>[];
    const out: StockRow[] = [];
    for (const r of rows) {
      const extra = JSON.parse(await unseal(r.payload as Uint8Array<ArrayBuffer>)) as {
        unitCost: number | null;
        supplier: string | null;
        target: StockRow["target"];
        note: string | null;
      };
      out.push({
        id: r.id as string,
        farmId: r.farm_id as string,
        kind: r.kind as StockRow["kind"],
        quantity: Number(r.quantity),
        lotCode: (r.lot_code as string | null) ?? null,
        expiresOn: (r.expires_on as string | null) ?? null,
        occurredOn: r.occurred_on as string,
        pending: false,
        ...extra,
      });
    }
    const pend = d.selectObjects(
      "SELECT id, body FROM outbox WHERE org_id = ? AND state = 'pendiente' AND supply_id = ? ORDER BY seq DESC",
      [args.orgId, args.supplyId],
    ) as { id: string; body: Uint8Array<ArrayBuffer> }[];
    const pending: StockRow[] = [];
    for (const r of pend) {
      const c = JSON.parse(await unseal(r.body)) as StockReceiveCommand | StockConsumeCommand;
      const p = c.payload;
      pending.push({
        id: r.id,
        farmId: p.farmId,
        kind: c.type === "stock.receive" ? "entrada" : "consumo",
        quantity: p.quantity,
        lotCode: c.type === "stock.receive" ? (c.payload.lotCode ?? null) : null,
        expiresOn: c.type === "stock.receive" ? (c.payload.expiresOn ?? null) : null,
        occurredOn: p.occurredOn,
        unitCost: c.type === "stock.receive" ? (c.payload.unitCost ?? null) : null,
        supplier: c.type === "stock.receive" ? (c.payload.supplier ?? null) : null,
        target: c.type === "stock.consume" ? c.payload.target : null,
        note: p.note ?? null,
        pending: true,
      });
    }
    return [...pending, ...out];
  },

  outboxCount(orgId: string): { pendiente: number; rechazado: number; conflicto: number } {
    const rows = requireDb().selectObjects(
      "SELECT state, count(*) AS n FROM outbox WHERE org_id = ? GROUP BY state",
      [orgId],
    ) as { state: string; n: number }[];
    const n = (s: string) => rows.find((r) => r.state === s)?.n ?? 0;
    return { pendiente: n("pendiente"), rechazado: n("rechazado"), conflicto: n("conflicto") };
  },
};

export type WorkerApi = typeof api;

self.onmessage = async (
  e: MessageEvent<{ id: number; method: keyof WorkerApi; args: unknown[] }>,
) => {
  const { id, method, args } = e.data;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: despacho dinámico tipado en el cliente
    const result = await (api[method] as (...a: any[]) => unknown)(...args);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
