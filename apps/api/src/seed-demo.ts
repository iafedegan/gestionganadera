import { uuidv7 } from "@ganaderia/domain";
import type { Membership } from "./auth.js";
import { createPgDb, createPgliteDb } from "./db.js";
import { push, todayIn } from "./sync.js";

/**
 * Datos de demostración (solo desarrollo): animales de ambas especies con genealogía,
 * insumos con lotes y consumos. Es idempotente: si ya hay más de 20 animales no hace nada.
 * Con PGlite el servidor debe estar detenido.
 */
if (process.env.NODE_ENV === "production") throw new Error("No se ejecuta en producción.");

const db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");

const who = await db.admin(async (q) => {
  const u = (
    await q<{ id: string; email: string; display_name: string }>(
      "SELECT id, email, display_name FROM app_user WHERE email = 'propietario@demo.local'",
    )
  )[0];
  const m = (
    await q<{ organization_id: string }>(
      "SELECT organization_id FROM membership WHERE user_id = $1 AND farm_id IS NULL LIMIT 1",
      [u?.id],
    )
  )[0];
  const f = (
    await q<{ id: string }>("SELECT id FROM farm WHERE organization_id = $1 LIMIT 1", [
      m?.organization_id,
    ])
  )[0];
  return u && m && f ? { u, org: m.organization_id, farm: f.id } : null;
});
if (!who) throw new Error("Ejecute primero el seed base.");

const count = await db.tenant(who.org, (q) => q<{ n: string }>("SELECT count(*) AS n FROM animal"));
if (Number(count[0]?.n) > 20) {
  console.log("Los datos de demostración ya existen.");
  await db.close();
  process.exit(0);
}

const user = { id: who.u.id, email: who.u.email, displayName: who.u.display_name };
const memberships: Membership[] = [
  {
    organizationId: who.org,
    organizationName: "Organización demostrativa",
    role: "propietario",
    farmId: null,
    validUntil: null,
  },
];
const today = todayIn();
const ago = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const plus = (days: number) => ago(-days);
const env = (type: string, payload: Record<string, unknown>) => ({
  id: uuidv7(),
  type,
  clientTs: new Date().toISOString(),
  payload,
});

const animal = (
  tag: string,
  species: string,
  sex: string,
  category: string,
  days: number,
  extra: Record<string, unknown> = {},
) => {
  const id = uuidv7();
  return {
    id,
    cmd: env("animal.register", {
      id,
      farmId: who.farm,
      tag,
      species,
      sex,
      category,
      entry: {
        reason: (extra.reason as string) ?? "inventario_inicial",
        occurredAt: ago(days),
        ...(extra.origin ? { origin: extra.origin } : {}),
      },
      ...(extra.birth
        ? { birthDate: { date: ago(extra.birth as number), precision: "estimada" } }
        : {}),
      ...(extra.mother ? { motherId: extra.mother } : {}),
      ...(extra.father ? { fatherId: extra.father } : {}),
      ...(extra.notes ? { notes: extra.notes } : {}),
    }),
  };
};

const toro = animal("BOV-T01", "bovino", "macho", "toro", 900, {
  birth: 1800,
  origin: "Compra · Feria de Montería",
});
const toroBuf = animal("BUF-T01", "bufalino", "macho", "toro", 800, {
  birth: 1700,
  origin: "Compra",
});
const vacas = Array.from({ length: 12 }, (_, i) =>
  animal(`BOV-${String(10 + i).padStart(3, "0")}`, "bovino", "hembra", "vaca", 700 - i * 20, {
    birth: 1500 + i * 30,
  }),
);
const bufalas = Array.from({ length: 6 }, (_, i) =>
  animal(`BUF-${String(10 + i).padStart(3, "0")}`, "bufalino", "hembra", "vaca", 600 - i * 25, {
    birth: 1600 + i * 30,
  }),
);
const terneros = vacas.slice(0, 6).map((v, i) =>
  animal(
    `BOV-${String(40 + i).padStart(3, "0")}`,
    "bovino",
    i % 2 ? "hembra" : "macho",
    i % 2 ? "ternero" : "ternero",
    120 - i * 15,
    {
      reason: "nacimiento",
      birth: 120 - i * 15,
      mother: v.id,
      father: toro.id,
    },
  ),
);
const terneroBuf = animal("BUF-040", "bufalino", "hembra", "ternero", 60, {
  reason: "nacimiento",
  birth: 60,
  mother: bufalas[0]?.id,
  father: toroBuf.id,
});
const novillas = Array.from({ length: 5 }, (_, i) =>
  animal(`BOV-${String(60 + i).padStart(3, "0")}`, "bovino", "hembra", "novilla", 300 - i * 20, {
    birth: 600 + i * 20,
    reason: "compra",
    origin: "Hacienda La Esperanza",
  }),
);
const novillos = Array.from({ length: 4 }, (_, i) =>
  animal(`BOV-${String(80 + i).padStart(3, "0")}`, "bovino", "macho", "novillo", 260 - i * 15, {
    birth: 560 + i * 20,
  }),
);

const base = [toro, toroBuf, ...vacas, ...bufalas];
const second = [...terneros, terneroBuf, ...novillas, ...novillos];
const r1 = await push(
  db,
  user,
  memberships,
  who.org,
  "demo",
  base.map((a) => a.cmd),
);
const r2 = await push(
  db,
  user,
  memberships,
  who.org,
  "demo",
  second.map((a) => a.cmd),
);
const bad = [...r1.results, ...r2.results].filter((r) => r.status !== "accepted");
console.log(
  `Animales: ${r1.results.length + r2.results.length - bad.length} creados, ${bad.length} omitidos.`,
);

const sup = (name: string, category: string, unit: string, minStock: number) => ({
  id: uuidv7(),
  name,
  category,
  unit,
  minStock,
});
const supplies = [
  sup("Sal mineralizada", "suplemento", "kg", 100),
  sup("Vacuna antiaftosa", "medicamento", "dosis", 60),
  sup("Ivermectina 1 %", "medicamento", "L", 5),
  sup("Concentrado de levante", "alimento", "bulto", 20),
  sup("Melaza", "alimento", "L", 50),
  sup("Fertilizante 15-15-15", "fertilizante", "bulto", 10),
].filter((s) => s.name !== "Sal mineralizada");
const receive = (
  s: { id: string },
  qty: number,
  days: number,
  lot: string,
  exp: number | null,
  cost: number,
  prov: string,
) =>
  env("stock.receive", {
    supplyId: s.id,
    farmId: who.farm,
    quantity: qty,
    occurredOn: ago(days),
    lotCode: lot,
    ...(exp !== null ? { expiresOn: plus(exp) } : {}),
    unitCost: cost,
    supplier: prov,
  });
const consume = (s: { id: string }, qty: number, days: number, label: string) =>
  env("stock.consume", {
    supplyId: s.id,
    farmId: who.farm,
    quantity: qty,
    occurredOn: ago(days),
    target: { kind: "lote", label },
  });

const [vac, iver, conc, mel, fert] = supplies as [
  (typeof supplies)[0],
  (typeof supplies)[0],
  (typeof supplies)[0],
  (typeof supplies)[0],
  (typeof supplies)[0],
];
const cmds = [
  ...supplies.map((s) => env("supply.create", { ...s })),
  receive(vac, 120, 40, "AF-2610", 20, 3800, "Droguería Agro Demo"),
  receive(vac, 60, 10, "AF-2611", 200, 3900, "Droguería Agro Demo"),
  consume(vac, 90, 8, "Vacunación ciclo 2"),
  receive(iver, 12, 30, "IV-088", 12, 58000, "Droguería Agro Demo"),
  consume(iver, 8, 6, "Lote de levante"),
  receive(conc, 80, 25, "CL-5521", 90, 74000, "Concentrados del Sinú"),
  consume(conc, 62, 3, "Lote de levante"),
  receive(mel, 400, 15, "ME-13", 60, 2400, "Ingenio Demo"),
  consume(mel, 120, 2, "Lote de cría"),
  receive(fert, 30, 50, "FE-77", null, 98000, "Agroinsumos Demo"),
];
const r3 = await push(db, user, memberships, who.org, "demo", cmds);
const bad3 = r3.results.filter((r) => r.status !== "accepted");
console.log(
  `Insumos y movimientos: ${r3.results.length - bad3.length} registrados, ${bad3.length} omitidos.`,
);
await db.close();
