/// <reference lib="webworker" />
import type { AnimalDto, Change, CommandEnvelope } from "@ganaderia/contracts";
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
  animalId: string;
  state: "pendiente" | "enviado" | "rechazado" | "conflicto";
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  tag: string;
  species: string;
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
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, org_id TEXT NOT NULL,
    animal_id TEXT NOT NULL, state TEXT NOT NULL, body BLOB NOT NULL,
    error_code TEXT, error_msg TEXT, created_at TEXT NOT NULL, sent_at TEXT);
`;

async function openDb(userId: string): Promise<void> {
  if (db && currentUser === userId) return;
  db?.close();
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "ganaderia-pool", clearOnInit: false });
  db = new pool.OpfsSAHPoolDb(`/ganaderia-${userId}.db`);
  db.exec(SCHEMA);
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
    d.exec("DELETE FROM animal; DELETE FROM farm; DELETE FROM outbox; DELETE FROM meta;");
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
    const prepared: { c: Change; payload?: Uint8Array }[] = [];
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
        } else {
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
              payload as Uint8Array,
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
      "DELETE FROM animal WHERE sync_state = 'sincronizado'; DELETE FROM farm; DELETE FROM meta WHERE k IN ('cursor','scope');",
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
    command: CommandEnvelope;
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
        sql: "INSERT INTO outbox (id, org_id, animal_id, state, body, created_at) VALUES (?,?,?,'pendiente',?,?)",
        bind: [args.command.id, args.orgId, p.id, body, new Date().toISOString()],
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
          sql: "UPDATE animal SET sync_state = ? WHERE id = (SELECT animal_id FROM outbox WHERE id = ?)",
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
      `SELECT o.id, o.org_id, o.animal_id, o.state, o.error_code, o.error_msg, o.created_at, a.tag, a.species
         FROM outbox o LEFT JOIN animal a ON a.id = o.animal_id
        WHERE o.org_id = ? AND o.state <> 'enviado' ORDER BY o.seq DESC`,
      [orgId],
    ) as Record<string, string | null>[];
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      animalId: r.animal_id as string,
      state: r.state as OutboxItem["state"],
      errorCode: r.error_code ?? null,
      errorMessage: r.error_msg ?? null,
      createdAt: r.created_at as string,
      tag: (r.tag as string | null) ?? "(sin arete)",
      species: (r.species as string | null) ?? "",
    }));
  },

  /** Descarta un comando fallido y el animal local que nunca llegó a confirmarse. */
  outboxDiscard(id: string): void {
    const d = requireDb();
    d.exec("BEGIN");
    try {
      d.exec({
        sql: "DELETE FROM animal WHERE sync_state IN ('rechazado','conflicto','pendiente') AND id = (SELECT animal_id FROM outbox WHERE id = ?)",
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
