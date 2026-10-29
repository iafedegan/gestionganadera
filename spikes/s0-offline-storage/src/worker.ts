import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";

const N_ANIMALS = 5_000;
const N_EVENTS = 20_000;
const N_OUTBOX = 100;

let db: Database | undefined;
let backend = "";

async function open(): Promise<Database> {
  if (db) return db;
  const sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "s0-pool", clearOnInit: false });
    db = new pool.OpfsSAHPoolDb("/s0.db");
    backend = "opfs-sahpool";
  } catch (err) {
    db = new sqlite3.oo1.DB(":memory:");
    backend = `memoria (OPFS no disponible: ${String(err)})`;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS animal(
      id TEXT PRIMARY KEY, tag TEXT NOT NULL, species TEXT NOT NULL, sex TEXT NOT NULL,
      farm_id TEXT NOT NULL, payload BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS animal_tag ON animal(tag);
    CREATE TABLE IF NOT EXISTS animal_event(
      id TEXT PRIMARY KEY, animal_id TEXT NOT NULL, type TEXT NOT NULL,
      occurred_at TEXT NOT NULL, payload BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS ev_animal ON animal_event(animal_id, occurred_at);
    CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, body BLOB NOT NULL, state TEXT NOT NULL);
  `);
  return db;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function seal(key: CryptoKey, text: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

async function unseal(key: CryptoKey, blob: Uint8Array): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.slice(0, 12) },
    key,
    blob.slice(12),
  );
  return dec.decode(pt);
}

async function time<T>(fn: () => Promise<T> | T): Promise<[number, T]> {
  const t = performance.now();
  const r = await fn();
  return [Math.round((performance.now() - t) * 10) / 10, r];
}

function uuid(i: number): string {
  return `00000000-0000-7000-8000-${i.toString(16).padStart(12, "0")}`;
}

async function run() {
  const d = await open();
  const existing = d.selectValue("SELECT count(*) FROM animal") as number;
  const key = await makeKey();
  const results: Record<string, unknown> = {
    backend,
    crossOriginIsolated: self.crossOriginIsolated,
    userAgent: navigator.userAgent,
    filasPrevias: existing,
  };

  if (existing === 0) {
    const payloadA = (i: number) =>
      JSON.stringify({
        nombre: `Animal ${i}`,
        madre: i > 1 ? uuid(i - 1) : null,
        notas: "x".repeat(120),
      });
    const payloadE = (i: number) =>
      JSON.stringify({ detalle: `evento ${i}`, valor: i % 500, nota: "y".repeat(80) });

    // Cifrado de payloads antes de insertar: se mide el costo por separado.
    const [tEncA, sealedA] = await time(async () => {
      const arr: Uint8Array[] = [];
      for (let i = 0; i < N_ANIMALS; i++) arr.push(await seal(key, payloadA(i)));
      return arr;
    });
    const [tEncE, sealedE] = await time(async () => {
      const arr: Uint8Array[] = [];
      for (let i = 0; i < N_EVENTS; i++) arr.push(await seal(key, payloadE(i)));
      return arr;
    });
    results.ms_cifrar_payloads = { animales: tEncA, eventos: tEncE };

    const [tIns] = await time(() => {
      d.exec("BEGIN");
      const sa = d.prepare(
        "INSERT INTO animal(id,tag,species,sex,farm_id,payload) VALUES(?,?,?,?,?,?)",
      );
      for (let i = 0; i < N_ANIMALS; i++) {
        sa.bind([
          uuid(i),
          `BOV-${String(i).padStart(5, "0")}`,
          i % 4 === 0 ? "bufalino" : "bovino",
          i % 3 ? "H" : "M",
          `finca-${i % 50}`,
          sealedA[i]!,
        ]).stepReset();
      }
      sa.finalize();
      const se = d.prepare(
        "INSERT INTO animal_event(id,animal_id,type,occurred_at,payload) VALUES(?,?,?,?,?)",
      );
      const tipos = ["peso", "leche", "sanidad", "traslado"];
      for (let i = 0; i < N_EVENTS; i++) {
        const day = 1 + (i % 28);
        se.bind([
          uuid(100_000 + i),
          uuid(i % N_ANIMALS),
          tipos[i % 4]!,
          `2026-0${1 + (i % 9)}-${String(day).padStart(2, "0")}`,
          sealedE[i]!,
        ]).stepReset();
      }
      se.finalize();
      d.exec("COMMIT");
    });
    results.ms_insertar_5000_animales_y_20000_eventos = tIns;

    const [tOut] = await time(() => {
      d.exec("BEGIN");
      const so = d.prepare("INSERT INTO outbox(id,body,state) VALUES(?,?,'pendiente')");
      for (let i = 0; i < N_OUTBOX; i++)
        so.bind([uuid(900_000 + i), enc.encode(JSON.stringify({ type: "peso", i }))]).stepReset();
      so.finalize();
      d.exec("COMMIT");
    });
    results.ms_encolar_100_comandos = tOut;
  }

  const [tSearch, hits] = await time(() =>
    d.selectValues("SELECT id FROM animal WHERE tag LIKE 'BOV-0012%' LIMIT 50"),
  );
  const [tInv, inv] = await time(() =>
    d.selectObjects(
      "SELECT species, count(*) AS n FROM animal WHERE farm_id = 'finca-7' GROUP BY species",
    ),
  );
  const [tLast] = await time(() =>
    d.selectObjects(
      "SELECT animal_id, max(occurred_at) AS ultimo FROM animal_event WHERE type='peso' GROUP BY animal_id ORDER BY ultimo DESC LIMIT 50",
    ),
  );
  const [tDecrypt, nDec] = await time(async () => {
    const rows = d.selectObjects("SELECT payload FROM animal WHERE farm_id='finca-3'") as {
      payload: Uint8Array;
    }[];
    for (const r of rows) await unseal(key, r.payload).catch(() => ""); // clave nueva: falla a propósito si hubo carga previa
    return rows.length;
  });

  Object.assign(results, {
    ms_buscar_por_arete: tSearch,
    resultados_busqueda: hits.length,
    ms_inventario_por_especie_de_una_finca: tInv,
    inventario_finca_7: inv,
    ms_ultimo_peso_por_animal_top50: tLast,
    ms_descifrar_animales_de_una_finca: tDecrypt,
    animales_descifrados: nDec,
    total_animales: d.selectValue("SELECT count(*) FROM animal"),
    total_eventos: d.selectValue("SELECT count(*) FROM animal_event"),
    comandos_en_cola: d.selectValue("SELECT count(*) FROM outbox"),
  });
  return results;
}

self.onmessage = async (e: MessageEvent<{ cmd: "run" | "reset" }>) => {
  try {
    if (e.data.cmd === "reset") {
      const d = await open();
      d.exec("DELETE FROM animal; DELETE FROM animal_event; DELETE FROM outbox;");
      self.postMessage({ reset: true, backend });
    } else {
      self.postMessage(await run());
    }
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
    });
  }
};
