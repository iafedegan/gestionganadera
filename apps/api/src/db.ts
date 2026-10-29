import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Row = Record<string, unknown>;
export type Q = <R = Row>(sql: string, params?: unknown[]) => Promise<R[]>;

export interface Db {
  /** Contexto administrativo (tablas de identidad). Sin RLS; solo para el servicio de autenticación. */
  admin<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  /**
   * Contexto de una organización: rol sin privilegios + RLS. Con `write` serializa las
   * escrituras de la organización, lo que hace monótono el cursor de sincronización.
   */
  tenant<T>(orgId: string, fn: (q: Q) => Promise<T>, opts?: { write?: boolean }): Promise<T>;
  close(): Promise<void>;
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function applyMigrations(db: Db): Promise<void> {
  await db.admin((q) =>
    q(
      "CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    ),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.admin(async (q) => {
      const done = await q("SELECT 1 FROM schema_migration WHERE name = $1", [file]);
      if (done.length > 0) return;
      await q(readFileSync(join(migrationsDir, file), "utf8"));
      await q("INSERT INTO schema_migration(name) VALUES ($1)", [file]);
    });
  }
}

async function tenantPrelude(q: Q, orgId: string, write: boolean): Promise<void> {
  await q("SET LOCAL ROLE app_rw");
  await q("SELECT set_config('app.org_id', $1, true)", [orgId]);
  if (write) await q("SELECT pg_advisory_xact_lock(hashtext($1))", [orgId]);
}

/** PostgreSQL real (producción y CI). */
export async function createPgDb(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString, max: 10 });
  async function run<T>(fn: (q: Q) => Promise<T>, prelude?: (q: Q) => Promise<void>): Promise<T> {
    const client = await pool.connect();
    const q: Q = async (sql, params) => (await client.query(sql, params as unknown[])).rows;
    try {
      await client.query("BEGIN");
      if (prelude) await prelude(q);
      const out = await fn(q);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  const db: Db = {
    admin: (fn) => run(fn),
    tenant: (orgId, fn, opts) => run(fn, (q) => tenantPrelude(q, orgId, opts?.write ?? false)),
    close: () => pool.end(),
  };
  await applyMigrations(db);
  return db;
}

/** PGlite: PostgreSQL real compilado a WASM. Para desarrollo local y pruebas sin Docker. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  const lite = dataDir ? new PGlite(dataDir) : new PGlite();
  await lite.waitReady;
  async function run<T>(fn: (q: Q) => Promise<T>, prelude?: (q: Q) => Promise<void>): Promise<T> {
    return lite.transaction(async (tx) => {
      const q: Q = async (sql, params) => {
        // query() admite un solo comando con parámetros; exec() admite varios sin parámetros.
        if (!params || params.length === 0) {
          const res = await tx.exec(sql);
          return (res[res.length - 1]?.rows ?? []) as never;
        }
        return (await tx.query(sql, params)).rows as never;
      };
      if (prelude) await prelude(q);
      return fn(q);
    });
  }
  const db: Db = {
    admin: (fn) => run(fn),
    tenant: (orgId, fn, opts) => run(fn, (q) => tenantPrelude(q, orgId, opts?.write ?? false)),
    close: () => lite.close(),
  };
  await applyMigrations(db);
  return db;
}
