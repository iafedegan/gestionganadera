import { randomBytes } from "node:crypto";
import { uuidv7 } from "@ganaderia/domain";
import { type Membership, hashPassword } from "./auth.js";
import type { Db, Q } from "./db.js";
import type { DemoFarmSpec, DemoSpec } from "./demoData.js";
import { push, todayIn } from "./sync.js";

/**
 * Datos de muestra completos para la cuenta grande: asistencia técnica con su Secretario Técnico,
 * comunidad con vecinos, bodega surtida en las tres fincas, linderos y potreros, y la revisión de
 * bosque. Cada parte mira primero si ya existe, así que se puede correr en cada arranque sin
 * duplicar nada y también llega a las cuentas de muestra que ya estaban creadas.
 */

const DOMAIN = "demo.ganaderia.local";
const LOCK = 727276;

const ago = (today: string, n: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const at = (today: string, n: number, hour = 9) =>
  `${ago(today, n)}T${String(hour).padStart(2, "0")}:15:00Z`;

export async function addRichDemo(
  db: Db,
  spec: DemoSpec,
  userId: string,
  orgId: string,
): Promise<void> {
  const today = todayIn();
  const farms = await db.tenant(orgId, (q) =>
    q<{ id: string; code: string }>("SELECT id, code FROM farm ORDER BY code"),
  );
  const farmOf = (code: string) => farms.find((f) => f.code === code)?.id ?? null;
  const unusable = await hashPassword(randomBytes(24).toString("hex"));

  await db.admin(async (q) => {
    await q("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    const staffId = await secretary(q, spec, unusable);
    await extension(q, today, orgId, userId, staffId, farmOf);
    await community(q, today, userId, unusable);
  });

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
  await push(
    db,
    user,
    memberships,
    orgId,
    "muestra",
    await supplies(db, orgId, today, spec, farmOf),
  );
  await push(
    db,
    user,
    memberships,
    orgId,
    "muestra",
    await alertLots(db, orgId, today, spec, farmOf),
  );
  await push(db, user, memberships, orgId, "muestra", await maps(db, orgId, spec, farmOf));
  await forest(db, orgId, userId, spec, farmOf);
}

/* ───────────── Secretario Técnico de la región ───────────── */

async function secretary(q: Q, spec: DemoSpec, unusable: string): Promise<string> {
  const email = `demo-secretario-${spec.department.toLowerCase().replace(/\s+/g, "-")}@${DOMAIN}`;
  const [found] = await q<{ id: string }>("SELECT id FROM app_user WHERE email = $1", [email]);
  if (found) return found.id;
  const [u] = await q<{ id: string }>(
    "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
    [email, `Secretaría Técnica ${spec.department} (muestra)`, unusable],
  );
  const id = u?.id as string;
  await q(
    "INSERT INTO gremio_staff (user_id, role, tecnigan, departments) VALUES ($1,'secretario_tecnico',$2,$3)",
    [id, `TECNIG@N de ${spec.department}`, [spec.department]],
  );
  return id;
}

/* ───────────── Asistencia técnica: consultas y recomendaciones ───────────── */

interface CaseSeed {
  farm: string;
  topic: string;
  question: string;
  ai: string;
  status: "abierta" | "respondida" | "cerrada";
  days: number;
  replies: { staff: boolean; body: string; days: number }[];
}

const CASES: CaseSeed[] = [
  {
    farm: "LLANOS",
    topic: "reproduccion",
    question:
      "Tenemos 26 vacas servidas hace más de 45 días sin palpar y la natalidad bajó al 62 %. ¿Qué protocolo recomiendan para recuperar el intervalo entre partos?",
    ai: "Revise primero la condición corporal al servicio y programe palpación a los 35–45 días. Considere IATF en las vacas con más de 120 días abiertos.",
    status: "respondida",
    days: 18,
    replies: [
      {
        staff: true,
        body: "Buenos días. Con esos datos conviene palpar todo el lote esta semana y separar vacías con condición menor a 2,75. Le dejamos una recomendación de IATF para las vacías con cría al pie.",
        days: 16,
      },
      {
        staff: false,
        body: "Gracias. El veterinario palpa el jueves. ¿El protocolo con dispositivo sirve igual para las búfalas?",
        days: 15,
      },
      {
        staff: true,
        body: "En búfalas funciona mejor en la época de días cortos y con sincronización adaptada. Lo revisamos en la visita del mes.",
        days: 14,
      },
    ],
  },
  {
    farm: "PALMAR",
    topic: "leche",
    question:
      "El recuento de células somáticas de la planta subió a 480.000 en el tanque de El Palmar. ¿Por dónde empezamos?",
    ai: "Haga CMT a todas las vacas en ordeño, revise el sellado de pezones y la limpieza del equipo. Separe y trate según cultivo.",
    status: "cerrada",
    days: 40,
    replies: [
      {
        staff: true,
        body: "Recomendamos CMT semanal por cuarto, cambiar pezoneras (llevan más de 2.500 ordeños) y terapia de secado. En 6 semanas debería bajar.",
        days: 38,
      },
      {
        staff: false,
        body: "Hicimos los cambios. La planta reporta 210.000 esta semana.",
        days: 6,
      },
    ],
  },
  {
    farm: "SABANA",
    topic: "praderas",
    question:
      "En verano los potreros de La Sabana se quedan sin pasto antes de cumplir el descanso. ¿Conviene sembrar otra especie o hacer reserva?",
    ai: "Ajuste la carga a la oferta forrajera y planee una reserva (heno o ensilaje) para 90 días de verano.",
    status: "respondida",
    days: 25,
    replies: [
      {
        staff: true,
        body: "Con 340 ha y la carga actual, sugerimos dividir los 4 potreros grandes en 8, dejar 40 ha para henificar en invierno y probar Brachiaria humidicola en los bajos.",
        days: 22,
      },
    ],
  },
  {
    farm: "LLANOS",
    topic: "sanidad",
    question:
      "Aparecieron terneros con diarrea y fiebre en el lote de cría de Los Llanos. Ya se trataron tres. ¿Qué medidas preventivas siguen?",
    ai: "Asegure el calostro en las primeras 6 horas, desinfecte el ombligo y aísle a los enfermos. Consulte al veterinario para el tratamiento.",
    status: "abierta",
    days: 2,
    replies: [],
  },
  {
    farm: "PALMAR",
    topic: "nutricion",
    question:
      "¿Cuánto concentrado le doy a las vacas de El Palmar según la producción? Hoy todas reciben 3 kg.",
    ai: "Suele usarse 1 kg de concentrado por cada 3 a 4 litros por encima de lo que permite el forraje.",
    status: "respondida",
    days: 55,
    replies: [
      {
        staff: true,
        body: "Con el pasto que reportan, las vacas de menos de 10 L no necesitan concentrado; de 10 a 18 L, 1 kg por cada 3 L adicionales. Así ahorran cerca de 30 % en alimento.",
        days: 52,
      },
    ],
  },
  {
    farm: "LLANOS",
    topic: "ambiental",
    question:
      "Un comprador nos pide demostrar que el ganado no viene de áreas deforestadas. ¿Qué tenemos que entregar?",
    ai: "Dibuje el lindero de cada finca y haga la revisión de bosque en Trazabilidad; el archivo de geolocalización es lo que pide el comprador.",
    status: "cerrada",
    days: 70,
    replies: [
      {
        staff: true,
        body: "Ya quedaron los linderos de las tres fincas y la revisión no muestra pérdida de bosque después de 2020. Puede descargar el archivo en Trazabilidad.",
        days: 64,
      },
    ],
  },
];

interface RecoSeed {
  farm: string;
  topic: string;
  title: string;
  detail: string;
  indicator: string | null;
  due: number;
  status: "pendiente" | "en_curso" | "adoptada" | "descartada";
  verified?: string;
  caseIdx?: number;
}

const RECOS: RecoSeed[] = [
  {
    farm: "LLANOS",
    topic: "reproduccion",
    title: "Palpar todo el lote de servidas esta semana",
    detail:
      "Separar vacías con condición corporal menor a 2,75 y llevarlas a potrero de recuperación.",
    indicator: "intervaloPartos",
    due: 4,
    status: "en_curso",
    caseIdx: 0,
  },
  {
    farm: "LLANOS",
    topic: "reproduccion",
    title: "IATF en vacas vacías con más de 120 días abiertos",
    detail:
      "Protocolo con dispositivo intravaginal de progesterona; repetir diagnóstico a los 30 días.",
    indicator: "natalidad",
    due: 21,
    status: "pendiente",
    caseIdx: 0,
  },
  {
    farm: "PALMAR",
    topic: "leche",
    title: "CMT semanal por cuarto y cambio de pezoneras",
    detail: "Registrar el resultado de cada vaca en Sanidad; tratar según cultivo.",
    indicator: "litrosVacaDia",
    due: -30,
    status: "adoptada",
    verified: "El recuento de la planta bajó de 480.000 a 210.000 células.",
    caseIdx: 1,
  },
  {
    farm: "PALMAR",
    topic: "leche",
    title: "Terapia de secado en todas las vacas",
    detail: "Antibiótico intramamario y sellador interno al secado.",
    indicator: "litrosVacaDia",
    due: -10,
    status: "adoptada",
    caseIdx: 1,
  },
  {
    farm: "SABANA",
    topic: "praderas",
    title: "Dividir los potreros grandes y ajustar la rotación",
    detail:
      "Pasar de 4 a 8 potreros con cerca eléctrica; 30 días de descanso en invierno, 45 en verano.",
    indicator: "carga",
    due: 45,
    status: "en_curso",
    caseIdx: 2,
  },
  {
    farm: "SABANA",
    topic: "nutricion",
    title: "Reserva de heno para 90 días de verano",
    detail: "Henificar 40 ha en el pico de lluvias (unas 1.600 pacas).",
    indicator: "gananciaDiaria",
    due: 120,
    status: "pendiente",
    caseIdx: 2,
  },
  {
    farm: "PALMAR",
    topic: "nutricion",
    title: "Concentrado según producción",
    detail: "Nada a vacas de menos de 10 L; 1 kg por cada 3 L adicionales desde 10 L.",
    indicator: "litrosVacaDia",
    due: -40,
    status: "adoptada",
    verified: "Bajó 28 % el gasto en concentrado sin perder leche.",
    caseIdx: 4,
  },
  {
    farm: "LLANOS",
    topic: "sanidad",
    title: "Calostro en las primeras 6 horas y cura de ombligo",
    detail: "Registrar cada parto con la hora de calostro; yodo al 7 % en el ombligo.",
    indicator: "natalidad",
    due: 7,
    status: "pendiente",
  },
  {
    farm: "LLANOS",
    topic: "ambiental",
    title: "Cercar el bosque de galería del caño",
    detail: "Aislar 12 ha de bosque y dejar bebederos fuera del cauce.",
    indicator: null,
    due: 90,
    status: "en_curso",
    caseIdx: 5,
  },
  {
    farm: "LLANOS",
    topic: "gestion",
    title: "Llevar costos por actividad (leche y cría)",
    detail: "Separar en Economía los gastos de cada actividad para calcular el costo por litro.",
    indicator: null,
    due: -5,
    status: "descartada",
  },
  {
    farm: "SABANA",
    topic: "reproduccion",
    title: "Edad al primer servicio de novillas: 15 meses con 320 kg",
    detail: "Pesar cada mes las novillas de levante y servir al llegar al peso.",
    indicator: "edadPrimerParto",
    due: 60,
    status: "pendiente",
  },
];

async function extension(
  q: Q,
  today: string,
  orgId: string,
  userId: string,
  staffId: string,
  farmOf: (code: string) => string | null,
): Promise<void> {
  const [has] = await q("SELECT 1 FROM tech_case WHERE organization_id = $1 LIMIT 1", [orgId]);
  if (has) return;
  const caseIds: string[] = [];
  for (const c of CASES) {
    const [row] = await q<{ id: string }>(
      `INSERT INTO tech_case (organization_id, farm_id, created_by, topic, question, ai_answer, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
      [orgId, farmOf(c.farm), userId, c.topic, c.question, c.ai, c.status, at(today, c.days, 8)],
    );
    const id = row?.id as string;
    caseIds.push(id);
    for (const m of c.replies) {
      await q(
        `INSERT INTO tech_message (case_id, author_id, from_staff, body, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, m.staff ? staffId : userId, m.staff, m.body, at(today, m.days, m.staff ? 14 : 18)],
      );
    }
  }
  for (const [i, r] of RECOS.entries()) {
    const created = Math.max(1, 60 - i * 5);
    const adopted = r.status === "adoptada";
    await q(
      `INSERT INTO recommendation (organization_id, farm_id, case_id, author_id, from_staff, topic, title, detail,
         indicator, due_on, status, adopted_at, verified_at, verified_by, verification_note, created_at, updated_at)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
      [
        orgId,
        farmOf(r.farm),
        r.caseIdx !== undefined ? caseIds[r.caseIdx] : null,
        staffId,
        r.topic,
        r.title,
        r.detail,
        r.indicator,
        ago(today, -r.due),
        r.status,
        adopted ? at(today, Math.max(1, -r.due), 10) : null,
        r.verified ? at(today, 3, 11) : null,
        r.verified ? staffId : null,
        r.verified ?? null,
        at(today, created, 9),
      ],
    );
  }
}

/* ───────────── Comunidad: vecinos que preguntan y responden ───────────── */

const NEIGHBORS = [
  ["Rubén Castillo", "Casanare"],
  ["Luz Marina Pérez", "Meta"],
  ["Jairo Mendoza", "Arauca"],
  ["Sandra Gutiérrez", "Córdoba"],
  ["Óscar Rincón", "Santander"],
  ["Doris Calderón", "Antioquia"],
] as const;

interface PostSeed {
  by: number;
  topic: string;
  title: string;
  body: string;
  days: number;
  replies: { by: number | "yo"; body: string; days: number }[];
}

const POSTS: PostSeed[] = [
  {
    by: 0,
    topic: "pasturas",
    title: "¿Humidicola o decumbens para los bajos que se encharcan?",
    body: "Tengo unas 60 ha de bajo que se inundan en invierno. La decumbens se me muere. ¿A alguien le ha ido bien con humidicola o con otra?",
    days: 3,
    replies: [
      {
        by: "yo",
        body: "En Los Llanos sembramos humidicola en los bajos hace 3 años y aguanta el encharcamiento. Tarda en establecerse, tenga paciencia el primer año.",
        days: 2,
      },
      { by: 2, body: "Yo probé Tanner y también va bien en suelos húmedos.", days: 2 },
    ],
  },
  {
    by: 1,
    topic: "sanidad",
    title: "Garrapata resistente: ¿qué les está funcionando?",
    body: "Ya rotamos tres productos y la garrapata sigue. El veterinario habla de prueba de resistencia. ¿Alguien la hizo?",
    days: 6,
    replies: [
      {
        by: 3,
        body: "La hicimos con el ICA. Salió resistencia a amidinas. Cambiamos de grupo y bajó mucho.",
        days: 5,
      },
      {
        by: 5,
        body: "Además del producto, el descanso de potreros de 45 días corta el ciclo.",
        days: 4,
      },
      {
        by: "yo",
        body: "Nosotros bañamos solo los animales con más carga y rotamos cada 3 meses. Va mejor que bañar a todos.",
        days: 4,
      },
    ],
  },
  {
    by: 2,
    topic: "bufalos",
    title: "Precio de la leche de búfala en Arauca",
    body: "¿A cuánto les están pagando el litro de leche de búfala? Aquí la quesera paga 3.400 con bonificación por grasa.",
    days: 9,
    replies: [
      {
        by: "yo",
        body: "En Yopal nos pagan 3.600 más bonificación por sólidos. Vale la pena medir grasa y proteína.",
        days: 8,
      },
      { by: 0, body: "Aquí 3.500. Depende mucho de la quesera.", days: 7 },
    ],
  },
  {
    by: 3,
    topic: "reproduccion",
    title: "IATF en vacas de cría: ¿vale la pena?",
    body: "Me ofrecen IATF a 95.000 por vaca. Tengo monta natural y natalidad de 58 %. ¿Les ha mejorado?",
    days: 12,
    replies: [
      {
        by: 4,
        body: "Subimos a 72 % en dos años, pero hay que tener la condición corporal bien.",
        days: 11,
      },
      {
        by: "yo",
        body: "La usamos en las vacas con más de 120 días abiertos. Sola no hace milagros: primero nutrición.",
        days: 10,
      },
    ],
  },
  {
    by: 4,
    topic: "leche",
    title: "Recuento de células somáticas alto en verano",
    body: "Cada verano el recuento se dispara. Ya cambiamos pezoneras. ¿Qué más revisan?",
    days: 15,
    replies: [
      {
        by: "yo",
        body: "A nosotros nos ayudó el CMT semanal y la terapia de secado. Bajamos de 480 mil a 210 mil.",
        days: 14,
      },
      { by: 1, body: "Revise la presión de vacío del equipo, a nosotros era eso.", days: 13 },
    ],
  },
  {
    by: 5,
    topic: "mercado",
    title: "Precio del ganado gordo esta semana",
    body: "En la subasta de Medellín el macho cebado estuvo a 9.300 el kilo. ¿Cómo está en los Llanos?",
    days: 1,
    replies: [{ by: 0, body: "En la subasta de Yopal, 9.050 para machos de 450 kg.", days: 1 }],
  },
  {
    by: 0,
    topic: "experiencias",
    title: "Cerca eléctrica solar: un año después",
    body: "Pasamos de alambre de púas a cerca eléctrica con panel solar en 120 ha. Menos costo y la rotación es más fácil. Les cuento si les sirve.",
    days: 20,
    replies: [
      { by: 2, body: "¿Cuánto le costó el energizador y cuántos km cubre?", days: 19 },
      {
        by: 0,
        body: "Uno de 12 julios, cubre unos 25 km de una línea. Con panel y batería salió en 3,8 millones.",
        days: 19,
      },
    ],
  },
  {
    by: 1,
    topic: "carne",
    title: "Suplementación de levante en verano",
    body: "Con sal mineralizada y melaza los novillos apenas mantienen peso en verano. ¿Qué les dan ustedes?",
    days: 24,
    replies: [
      {
        by: "yo",
        body: "Bloque nutricional y heno de reserva. Ganamos unos 350 g/día en pleno verano.",
        days: 23,
      },
      { by: 3, body: "Nosotros silo de maíz, pero hay que tener la maquinaria.", days: 22 },
    ],
  },
  {
    by: 2,
    topic: "tecnologia",
    title: "¿Alguien usa bastón lector de chip?",
    body: "Estoy pensando en identificar con chip y bastón. ¿Funciona en el corral con el ganado bravo?",
    days: 28,
    replies: [
      {
        by: "yo",
        body: "Usamos bastón con la app y se lee a 30 cm. En la manga funciona bien; en el potrero no.",
        days: 27,
      },
    ],
  },
  {
    by: 3,
    topic: "experiencias",
    title: "Sistema silvopastoril con leucaena",
    body: "Llevamos 2 años con leucaena en surcos y la producción de leche subió 15 %. Las vacas buscan la sombra en las horas de calor.",
    days: 33,
    replies: [
      { by: 5, body: "¿Qué distancia entre surcos usó?", days: 32 },
      { by: 3, body: "1,6 m entre surcos de leucaena y pasto en medio.", days: 31 },
    ],
  },
  {
    by: 4,
    topic: "sanidad",
    title: "Vacunación de aftosa: ¿ya les llegó el ciclo?",
    body: "El vacunador viene la otra semana. Recuerden tener el registro al día para la guía de movilización.",
    days: 36,
    replies: [{ by: 0, body: "Aquí pasó la semana pasada. Todo en orden.", days: 35 }],
  },
  {
    by: 5,
    topic: "pasturas",
    title: "Aforo de potreros: ¿con marco o a ojo?",
    body: "Quiero calcular bien la carga. ¿Cómo hacen el aforo? ¿Marco de un metro y pesar?",
    days: 40,
    replies: [
      {
        by: "yo",
        body: "Marco de 1 m², 10 lanzamientos por potrero, cortamos y pesamos. La app calcula la oferta de forraje.",
        days: 39,
      },
    ],
  },
];

async function community(q: Q, today: string, userId: string, unusable: string): Promise<void> {
  const emails = NEIGHBORS.map((_, i) => `demo-vecino-${i + 1}@${DOMAIN}`);
  const [has] = await q(
    "SELECT 1 FROM community_post p JOIN app_user u ON u.id = p.author_id WHERE u.email = ANY($1) LIMIT 1",
    [emails],
  );
  if (has) return;
  const ids: string[] = [];
  for (const [i, [name]] of NEIGHBORS.entries()) {
    const [found] = await q<{ id: string }>("SELECT id FROM app_user WHERE email = $1", [
      emails[i],
    ]);
    const [u] = found
      ? [found]
      : await q<{ id: string }>(
          "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
          [emails[i], `${name} (muestra)`, unusable],
        );
    ids.push(u?.id as string);
  }
  for (const p of POSTS) {
    const [row] = await q<{ id: string }>(
      `INSERT INTO community_post (author_id, topic, title, body, region, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ids[p.by], p.topic, p.title, p.body, NEIGHBORS[p.by]?.[1] ?? null, at(today, p.days, 7)],
    );
    for (const r of p.replies) {
      await q(
        "INSERT INTO community_reply (post_id, author_id, body, created_at) VALUES ($1,$2,$3,$4)",
        [row?.id, r.by === "yo" ? userId : ids[r.by], r.body, at(today, r.days, 16)],
      );
    }
  }
}

/* ───────────── Bodega: insumos, lotes y consumos en las tres fincas ───────────── */

type Cat = "alimento" | "medicamento" | "suplemento" | "fertilizante" | "material";
type Unit = "kg" | "L" | "dosis" | "bulto" | "unidad";

/**
 * [nombre, categoría, unidad, mínimo, costo unitario, compra típica, consumo semanal, días de vida,
 * proveedor, fincas que lo usan (índices)]. Lo lechero no va a la finca de carne; fertilizantes y
 * materiales se guardan en la bodega central (Los Llanos).
 */
const CATALOG: [string, Cat, Unit, number, number, number, number, number, string, number[]][] = [
  [
    "Sal mineralizada 8 %",
    "suplemento",
    "bulto",
    30,
    98_000,
    60,
    9,
    540,
    "Agroinsumos del Llano",
    [0, 1, 2],
  ],
  [
    "Concentrado lechero 18 %",
    "alimento",
    "bulto",
    80,
    82_000,
    200,
    45,
    120,
    "Agroinsumos del Llano",
    [0, 1],
  ],
  [
    "Bloque nutricional",
    "suplemento",
    "unidad",
    40,
    46_000,
    120,
    22,
    365,
    "Nutrición Animal Yopal",
    [0, 1, 2],
  ],
  ["Silo de maíz", "alimento", "kg", 8_000, 420, 30_000, 5_200, 240, "Producción propia", [0, 1]],
  ["Heno de pangola", "alimento", "unidad", 150, 18_000, 600, 70, 300, "Producción propia", [0, 2]],
  [
    "Vacuna triple (carbón y edema)",
    "medicamento",
    "dosis",
    100,
    1_900,
    500,
    60,
    300,
    "Veterinaria El Cebú",
    [0, 1, 2],
  ],
  [
    "Vacuna brucelosis RB51",
    "medicamento",
    "dosis",
    20,
    6_500,
    60,
    6,
    180,
    "Veterinaria El Cebú",
    [0, 1],
  ],
  [
    "Oxitetraciclina LA 20 %",
    "medicamento",
    "L",
    2,
    185_000,
    6,
    0.6,
    540,
    "Veterinaria El Cebú",
    [0, 1, 2],
  ],
  ["Albendazol 10 %", "medicamento", "L", 3, 92_000, 10, 1.1, 720, "Veterinaria El Cebú", [0, 2]],
  [
    "Sellador de pezones yodado",
    "medicamento",
    "L",
    20,
    28_000,
    80,
    9,
    365,
    "Lechería Insumos",
    [0, 1],
  ],
  ["Urea 46 %", "fertilizante", "bulto", 15, 165_000, 40, 3, 720, "Agroinsumos del Llano", [0]],
  ["NPK 15-15-15", "fertilizante", "bulto", 10, 182_000, 30, 2, 720, "Agroinsumos del Llano", [0]],
  [
    "Alambre de púas calibre 12",
    "material",
    "unidad",
    10,
    285_000,
    25,
    1.5,
    3_650,
    "Ferretería La Llanera",
    [0],
  ],
  [
    "Aretes de identificación",
    "material",
    "unidad",
    100,
    3_200,
    400,
    18,
    3_650,
    "Identificación Animal SAS",
    [0],
  ],
  [
    "Jeringas desechables 10 mL",
    "material",
    "unidad",
    200,
    650,
    1_000,
    120,
    1_095,
    "Lechería Insumos",
    [0],
  ],
];

/** Cada cuántos días se anota un consumo (suma lo de esas semanas). */
const EVERY = 21;

async function supplies(
  db: Db,
  orgId: string,
  today: string,
  spec: DemoSpec,
  farmOf: (code: string) => string | null,
): Promise<unknown[]> {
  const existing = await db.tenant(orgId, (q) =>
    q<{ name: string }>("SELECT lower(name) AS name FROM supply"),
  );
  const have = new Set(existing.map((r) => r.name));
  const env = (type: string, payload: Record<string, unknown>) => ({
    id: uuidv7(),
    type,
    clientTs: new Date().toISOString(),
    payload,
  });
  const farmIds = spec.farms.map((f) => farmOf(f.code));
  const cmds: unknown[] = [];
  for (const [k, row] of CATALOG.entries()) {
    const [name, category, unit, minStock, cost, buy, weekly, life, supplier, uses] = row;
    if (have.has(name.toLowerCase())) continue;
    const id = uuidv7();
    cmds.push(env("supply.create", { id, name, category, unit, minStock }));
    for (const fi of uses) {
      const farmId = farmIds[fi];
      if (!farmId) continue;
      const share = fi === 0 ? 1 : fi === 1 ? 0.7 : 0.45;
      const qty = Math.max(1, Math.round(buy * share));
      const lot = (n: number) =>
        `${name.slice(0, 2).toUpperCase()}-26${String(k).padStart(2, "0")}${fi}${n}`;
      // Dos compras: una vieja (la primera en vencer) y una reciente; cada finca en otra semana.
      const first = 110 - fi * 7 - (k % 5) * 3;
      const second = 35 - fi * 4 - (k % 4) * 2;
      const exp1 = life - first;
      cmds.push(
        env("stock.receive", {
          supplyId: id,
          farmId,
          quantity: qty,
          occurredOn: ago(today, first),
          lotCode: lot(1),
          expiresOn: ago(today, -exp1),
          unitCost: cost,
          supplier,
        }),
        env("stock.receive", {
          supplyId: id,
          farmId,
          quantity: qty,
          occurredOn: ago(today, second),
          lotCode: lot(2),
          expiresOn: ago(today, -(life - second)),
          unitCost: Math.round(cost * 1.04),
          supplier,
        }),
      );
      // Consumos desde la primera compra; los de uso alto (k % 3 = 0) quedan bajo el mínimo.
      const heavy = k % 3 === 0;
      const reserve = heavy ? 0 : minStock * share;
      let used = 0;
      for (let d = first - 3; d > 0; d -= EVERY) {
        const use = Math.round(((weekly * share * EVERY) / 7) * (heavy ? 1.6 : 1) * 10) / 10;
        const available = qty * 2 - used;
        if (use <= 0 || use > available - reserve) break;
        used += use;
        cmds.push(
          env("stock.consume", {
            supplyId: id,
            farmId,
            quantity: use,
            occurredOn: ago(today, d),
            target: {
              kind: "lote",
              label: ["Vacas en ordeño", "Levante", "Cría", "Potreros"][d % 4],
            },
          }),
        );
      }
    }
  }
  return cmds;
}

/**
 * Lotes que se ven en las alertas de la bodega: uno vencido y varios por vencer. Se reciben
 * después de los consumos para que el primero en vencer no se gaste antes de mostrarse.
 * [insumo, finca, cantidad, recibido hace (días), vence en (días; negativo = ya venció), lote]
 */
const ALERT_LOTS: [string, number, number, number, number, string][] = [
  ["Vacuna triple (carbón y edema)", 0, 80, 200, -12, "VT-2604-V"],
  ["Oxitetraciclina LA 20 %", 1, 2, 20, 18, "OX-2611-P"],
  ["Sellador de pezones yodado", 0, 30, 15, 25, "SE-2611-L"],
  ["Vacuna brucelosis RB51", 1, 20, 40, 9, "RB-2610-P"],
];

async function alertLots(
  db: Db,
  orgId: string,
  today: string,
  spec: DemoSpec,
  farmOf: (code: string) => string | null,
): Promise<unknown[]> {
  const ids = await db.tenant(orgId, (q) =>
    q<{ id: string; name: string }>("SELECT id, name FROM supply"),
  );
  const lots = await db.tenant(orgId, (q) =>
    q<{ lot_code: string }>(
      "SELECT DISTINCT lot_code FROM stock_movement WHERE lot_code IS NOT NULL",
    ),
  );
  const have = new Set(lots.map((l) => l.lot_code));
  const cmds: unknown[] = [];
  for (const [name, fi, quantity, received, expires, lotCode] of ALERT_LOTS) {
    const supplyId = ids.find((s) => s.name === name)?.id;
    const code = spec.farms[fi]?.code;
    const farmId = code ? farmOf(code) : null;
    if (!supplyId || !farmId || have.has(lotCode)) continue;
    cmds.push({
      id: uuidv7(),
      type: "stock.receive",
      clientTs: new Date().toISOString(),
      payload: {
        supplyId,
        farmId,
        quantity,
        occurredOn: ago(today, received),
        lotCode,
        expiresOn: ago(today, -expires),
        unitCost: 0,
        supplier: "Veterinaria El Cebú",
      },
    });
  }
  return cmds;
}

/* ───────────── Linderos y potreros de las tres fincas ───────────── */

const FORAGES = [
  "Brachiaria decumbens",
  "Brachiaria humidicola",
  "Brachiaria brizantha Toledo",
  "Pasto estrella",
  "Guinea Mombasa",
  "Angleton",
  "Llanero",
  "Bosque de galería",
];

async function maps(
  db: Db,
  orgId: string,
  spec: DemoSpec,
  farmOf: (code: string) => string | null,
): Promise<unknown[]> {
  const withMap = await db.tenant(orgId, (q) =>
    q<{ farm_id: string }>("SELECT farm_id FROM farm_map"),
  );
  const has = new Set(withMap.map((r) => r.farm_id));
  const cmds: unknown[] = [];
  for (const f of spec.farms) {
    const farmId = farmOf(f.code);
    if (!farmId || has.has(farmId)) continue;
    cmds.push({
      id: uuidv7(),
      type: "farm.map.save",
      clientTs: new Date().toISOString(),
      payload: { farmId, baseRevision: 0, ...layout(f) },
    });
  }
  return cmds;
}

/** Lindero rectangular del tamaño de la finca y potreros en cuadrícula (4 × 2). */
export function layout(f: DemoFarmSpec) {
  const sideM = Math.sqrt(f.totalHa * 10_000);
  const dLat = sideM / 2 / 111_320;
  const dLng = sideM / 2 / (111_320 * Math.cos((f.lat * Math.PI) / 180));
  const ring = (la0: number, lo0: number, la1: number, lo1: number): [number, number][] => [
    [f.lat + la0, f.lng + lo0],
    [f.lat + la0, f.lng + lo1],
    [f.lat + la1, f.lng + lo1],
    [f.lat + la1, f.lng + lo0],
  ];
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const round = (pts: [number, number][]) =>
    pts.map(([a, b]) => [r6(a), r6(b)] as [number, number]);
  const paddocks = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const n = row * 4 + col;
      const la0 = -dLat + (row * 2 * dLat) / 2;
      const lo0 = -dLng + (col * 2 * dLng) / 4;
      paddocks.push({
        id: `${f.prefix}-P${n + 1}`,
        name: n === 7 ? "Reserva de bosque" : `Potrero ${n + 1}`,
        forage: FORAGES[(n + f.prefix.length) % 7] as string,
        points: round(ring(la0, lo0, la0 + dLat, lo0 + dLng / 2)),
      });
    }
  }
  const last = paddocks[7];
  if (last) last.forage = "Bosque de galería";
  return { boundary: round(ring(-dLat, -dLng, dLat, dLng)), paddocks };
}

/* ───────────── Revisión de bosque desde 2021 ───────────── */

async function forest(
  db: Db,
  orgId: string,
  userId: string,
  spec: DemoSpec,
  farmOf: (code: string) => string | null,
): Promise<void> {
  await db.admin(async (q) => {
    for (const [i, f] of spec.farms.entries()) {
      const farmId = farmOf(f.code);
      if (!farmId) continue;
      const [map] = await q<{ boundary: unknown }>(
        "SELECT boundary FROM farm_map WHERE farm_id = $1 AND boundary IS NOT NULL",
        [farmId],
      );
      if (!map) continue;
      const [done] = await q("SELECT 1 FROM forest_check WHERE farm_id = $1 LIMIT 1", [farmId]);
      if (done) continue;
      const before = [0.8, 0, 2.4][i] ?? 0;
      await q(
        `INSERT INTO forest_check (organization_id, farm_id, checked_by, boundary, area_ha, loss_after_cutoff_ha, result, checked_at)
         VALUES ($1,$2,$3,$4,$5,0,$6, now() - interval '${12 + i * 9} days')`,
        [
          orgId,
          farmId,
          userId,
          JSON.stringify(map.boundary),
          f.totalHa,
          JSON.stringify({
            areaHa: f.totalHa,
            lossAfterCutoffHa: 0,
            lossBeforeCutoffHa: before,
            byYear: { "2021": 0, "2022": 0, "2023": 0, "2024": 0, "2025": 0 },
            source:
              "Global Forest Watch · pérdida de cobertura arbórea (Hansen/UMD/Google/USGS/NASA)",
            version: "v1.12",
            pixelHa: 0.0763,
          }),
        ],
      );
    }
  });
}
