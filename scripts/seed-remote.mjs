// Carga datos de demostración en un sitio publicado, a través de su API (mismas validaciones
// que la app). Uso: SITE=https://... EMAIL=... PASSWORD=... node scripts/seed-remote.mjs
import { randomBytes } from "node:crypto";

const SITE = process.env.SITE ?? "https://gestionganadera.vercel.app";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("Defina EMAIL y PASSWORD.");

const H = { "content-type": "application/json", "x-requested-with": "ganaderia", origin: SITE };
let cookie = "";
async function call(method, path, body) {
  const res = await fetch(SITE + path, {
    method,
    headers: { ...H, ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** UUID versión 7 (orden temporal), como usa la app. */
function uuidv7() {
  const b = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const session = await call("POST", "/v1/auth/login", { email: EMAIL, password: PASSWORD });
const org = session.memberships[0]?.organizationId;
const farms = await call("GET", `/v1/farms?organizationId=${org}`);
const farm = (Array.isArray(farms) ? farms : farms.farms)[0]?.id;
if (!org || !farm) throw new Error("No hay organización o finca.");

const pulled = await call("GET", `/v1/sync/pull?organizationId=${org}&since=0&limit=500`);
if (pulled.changes.filter((c) => c.entity === "animal").length > 20) {
  console.log("Ya hay datos de demostración; no se hace nada.");
  process.exit(0);
}

const today = new Date();
const ago = (d) => new Date(today.getTime() - d * 864e5).toISOString().slice(0, 10);
const plus = (d) => ago(-d);
const env = (type, payload) => ({
  id: uuidv7(),
  type,
  clientTs: new Date().toISOString(),
  payload,
});

const animal = (tag, species, sex, category, days, extra = {}) => {
  const id = uuidv7();
  return {
    id,
    cmd: env("animal.register", {
      id,
      farmId: farm,
      tag,
      species,
      sex,
      category,
      entry: {
        reason: extra.reason ?? "inventario_inicial",
        occurredAt: ago(days),
        ...(extra.origin ? { origin: extra.origin } : {}),
      },
      ...(extra.birth ? { birthDate: { date: ago(extra.birth), precision: "estimada" } } : {}),
      ...(extra.mother ? { motherId: extra.mother } : {}),
      ...(extra.father ? { fatherId: extra.father } : {}),
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
    "ternero",
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
  mother: bufalas[0].id,
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

const push = (commands) =>
  call("POST", "/v1/sync/push", { organizationId: org, deviceId: "carga-demo-remota", commands });
const report = (label, r) => {
  const bad = r.results.filter((x) => x.status !== "accepted");
  console.log(`${label}: ${r.results.length - bad.length} aceptados, ${bad.length} omitidos`);
  for (const b of bad.slice(0, 3)) console.log("  ·", b.code, b.message);
};
report("Animales (adultos)", await push([toro, toroBuf, ...vacas, ...bufalas].map((a) => a.cmd)));
report(
  "Animales (crías y levante)",
  await push([...terneros, terneroBuf, ...novillas, ...novillos].map((a) => a.cmd)),
);

const sup = (name, category, unit, minStock) => ({ id: uuidv7(), name, category, unit, minStock });
const [vac, iver, conc, mel, fert, sal] = [
  sup("Vacuna antiaftosa", "medicamento", "dosis", 60),
  sup("Ivermectina 1 %", "medicamento", "L", 5),
  sup("Concentrado de levante", "alimento", "bulto", 20),
  sup("Melaza", "alimento", "L", 50),
  sup("Fertilizante 15-15-15", "fertilizante", "bulto", 10),
  sup("Sal mineralizada", "suplemento", "kg", 100),
];
const receive = (s, qty, days, lot, exp, cost, prov) =>
  env("stock.receive", {
    supplyId: s.id,
    farmId: farm,
    quantity: qty,
    occurredOn: ago(days),
    lotCode: lot,
    ...(exp !== null ? { expiresOn: plus(exp) } : {}),
    unitCost: cost,
    supplier: prov,
  });
const consume = (s, qty, days, label) =>
  env("stock.consume", {
    supplyId: s.id,
    farmId: farm,
    quantity: qty,
    occurredOn: ago(days),
    target: { kind: "lote", label },
  });

report(
  "Insumos y movimientos",
  await push([
    ...[vac, iver, conc, mel, fert, sal].map((s) => env("supply.create", s)),
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
    receive(sal, 250, 20, "SM-401", 300, 3300, "Agroinsumos Demo"),
    consume(sal, 180, 1, "Todo el hato"),
  ]),
);
await call("POST", "/v1/auth/logout", {});
console.log("Listo.");
