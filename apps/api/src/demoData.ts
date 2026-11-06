import { FarmProfile, type FarmProfileInput } from "@ganaderia/contracts";
import { uuidv7 } from "@ganaderia/domain";

/**
 * Perfiles de muestra y el generador de su hato. Todo es ficticio y determinista: el mismo perfil
 * produce los mismos animales y eventos, salvo los identificadores.
 */

export type DemoKey = "sin_datos" | "pequeno" | "mediano" | "grande" | "completo";

export interface DemoFarmSpec {
  code: string;
  name: string;
  municipality: string;
  prefix: string;
  focus: "leche" | "carne" | "doble_proposito";
  system: "extensivo" | "rotacional" | "semiestabulado" | "estabulado";
  totalHa: number;
  livestockHa: number;
  lat: number;
  lng: number;
  vacas: number;
  novillas: number;
  terneros: number;
  novillos: number;
  toros: number;
  bufalas: number;
}

export interface DemoTeamMember {
  email: string;
  displayName: string;
  role: "admin_entidad" | "operario" | "tecnico";
  /** Índice de la finca a la que queda limitado; null = todas. */
  farm: number | null;
}

export interface DemoSpec {
  key: DemoKey;
  label: string;
  description: string;
  email: string;
  displayName: string;
  orgName: string;
  orgKind: "persona_natural" | "empresa" | "asociacion" | "cooperativa";
  department: string;
  municipality: string;
  /** Cuenta recién creada: el asistente inicial todavía la espera. */
  onboardingPending: boolean;
  farms: DemoFarmSpec[];
  milkDays: number;
  supplies: boolean;
  map: boolean;
  team: DemoTeamMember[];
  pendingInvitation: boolean;
  profile: FarmProfileInput | null;
}

const farm = (
  f: Partial<DemoFarmSpec> & Pick<DemoFarmSpec, "code" | "name" | "prefix">,
): DemoFarmSpec => ({
  municipality: "Montería",
  focus: "doble_proposito",
  system: "rotacional",
  totalHa: 60,
  livestockHa: 48,
  lat: 8.75,
  lng: -75.88,
  vacas: 0,
  novillas: 0,
  terneros: 0,
  novillos: 0,
  toros: 0,
  bufalas: 0,
  ...f,
});

const DOMAIN = "demo.ganaderia.local";

export const DEMO_SPECS: DemoSpec[] = [
  {
    key: "sin_datos",
    label: "Sin datos",
    description: "Cuenta nueva y vacía: empieza por el asistente inicial.",
    email: `demo-sin-datos@${DOMAIN}`,
    displayName: "Usuario nuevo (muestra)",
    orgName: "Cuenta nueva (muestra)",
    orgKind: "persona_natural",
    department: "",
    municipality: "",
    onboardingPending: true,
    farms: [],
    milkDays: 0,
    supplies: false,
    map: false,
    team: [],
    pendingInvitation: false,
    profile: null,
  },
  {
    key: "pequeno",
    label: "Ganadero pequeño",
    description: "Lechería familiar con unos 25 animales y una sola finca.",
    email: `demo-pequeno@${DOMAIN}`,
    displayName: "Ganadero pequeño (muestra)",
    orgName: "La Esperanza (muestra)",
    orgKind: "persona_natural",
    department: "Antioquia",
    municipality: "San Pedro de los Milagros",
    onboardingPending: false,
    farms: [
      farm({
        code: "ESPERANZA",
        name: "La Esperanza",
        prefix: "LE",
        municipality: "San Pedro de los Milagros",
        focus: "leche",
        system: "rotacional",
        totalHa: 14,
        livestockHa: 11,
        lat: 6.46,
        lng: -75.56,
        vacas: 11,
        novillas: 4,
        terneros: 6,
        toros: 1,
      }),
    ],
    milkDays: 14,
    supplies: false,
    map: false,
    team: [],
    pendingInvitation: false,
    profile: {
      level: "rapido",
      goals: ["leche", "costos"],
      focus: "leche",
      heads: 22,
      cows: 11,
      areaHa: 11,
      system: "rotacional",
      records: "cuaderno",
      breeding: "ia",
      pregCheck: "a_veces",
      vet: "problemas",
      knowsCost: "no",
      milking: 9,
      milkLitersDay: 150,
    },
  },
  {
    key: "mediano",
    label: "Ganadero mediano",
    description: "Doble propósito con unos 120 animales, dos fincas y un operario.",
    email: `demo-mediano@${DOMAIN}`,
    displayName: "Ganadero mediano (muestra)",
    orgName: "Hacienda El Roble (muestra)",
    orgKind: "persona_natural",
    department: "Córdoba",
    municipality: "Montería",
    onboardingPending: false,
    farms: [
      farm({
        code: "ROBLE",
        name: "El Roble",
        prefix: "ER",
        totalHa: 90,
        livestockHa: 75,
        vacas: 38,
        novillas: 12,
        terneros: 16,
        novillos: 8,
        toros: 2,
      }),
      farm({
        code: "LOMA",
        name: "La Loma",
        prefix: "LL",
        totalHa: 55,
        livestockHa: 46,
        lat: 8.7,
        lng: -75.8,
        vacas: 22,
        novillas: 8,
        terneros: 9,
        novillos: 4,
        toros: 1,
      }),
    ],
    milkDays: 14,
    supplies: true,
    map: false,
    team: [
      {
        email: `demo-mediano-operario@${DOMAIN}`,
        displayName: "Luis Pérez (operario)",
        role: "operario",
        farm: null,
      },
    ],
    pendingInvitation: false,
    profile: {
      level: "completo",
      goals: ["reproduccion", "peso", "costos"],
      focus: "doble_proposito",
      heads: 122,
      cows: 60,
      areaHa: 121,
      system: "rotacional",
      records: "excel",
      breeding: "mixta",
      pregCheck: "regular",
      vet: "periodico",
      knowsCost: "aprox",
      milking: 38,
      milkLitersDay: 420,
      workers: 3,
      calvingIntervalMonths: 15,
      supplements: ["sal_mineral", "concentrado"],
      paddocks: 18,
      restDays: 28,
      saleWeightKg: 430,
      saleAgeMonths: 26,
    },
  },
  {
    key: "grande",
    label: "Ganadero grande",
    description:
      "Más de 450 animales, bovinos y búfalos, tres fincas y un equipo de tres personas.",
    email: `demo-grande@${DOMAIN}`,
    displayName: "Ganadero grande (muestra)",
    orgName: "Agropecuaria Los Llanos (muestra)",
    orgKind: "empresa",
    department: "Casanare",
    municipality: "Yopal",
    onboardingPending: false,
    farms: [
      farm({
        code: "LLANOS",
        name: "Los Llanos",
        prefix: "LLA",
        municipality: "Yopal",
        system: "extensivo",
        totalHa: 620,
        livestockHa: 560,
        lat: 5.34,
        lng: -72.4,
        vacas: 120,
        novillas: 40,
        terneros: 50,
        novillos: 60,
        toros: 5,
        bufalas: 20,
      }),
      farm({
        code: "PALMAR",
        name: "El Palmar",
        prefix: "PAL",
        municipality: "Yopal",
        focus: "leche",
        system: "semiestabulado",
        totalHa: 210,
        livestockHa: 180,
        lat: 5.4,
        lng: -72.35,
        vacas: 70,
        novillas: 25,
        terneros: 28,
        toros: 2,
        bufalas: 25,
      }),
      farm({
        code: "SABANA",
        name: "La Sabana",
        prefix: "SAB",
        municipality: "Paz de Ariporo",
        focus: "carne",
        system: "extensivo",
        totalHa: 380,
        livestockHa: 340,
        lat: 5.88,
        lng: -71.89,
        vacas: 30,
        novillas: 12,
        terneros: 14,
        novillos: 30,
        toros: 3,
      }),
    ],
    milkDays: 14,
    supplies: true,
    map: false,
    team: [
      {
        email: `demo-grande-admin@${DOMAIN}`,
        displayName: "Marta Rojas (administradora)",
        role: "admin_entidad",
        farm: null,
      },
      {
        email: `demo-grande-operario@${DOMAIN}`,
        displayName: "Pedro Silva (operario)",
        role: "operario",
        farm: 0,
      },
      {
        email: `demo-grande-vet@${DOMAIN}`,
        displayName: "Dra. Camila Torres (veterinaria)",
        role: "tecnico",
        farm: null,
      },
    ],
    pendingInvitation: false,
    profile: {
      level: "completo",
      goals: ["reproduccion", "sanidad", "trazabilidad"],
      focus: "doble_proposito",
      heads: 486,
      cows: 240,
      areaHa: 1080,
      system: "extensivo",
      records: "software",
      breeding: "mixta",
      pregCheck: "regular",
      vet: "periodico",
      knowsCost: "si",
      milking: 120,
      milkLitersDay: 1350,
      workers: 14,
      calvingIntervalMonths: 14,
      supplements: ["sal_mineral", "concentrado", "ensilaje"],
      paddocks: 64,
      restDays: 35,
      saleWeightKg: 460,
      saleAgeMonths: 28,
      qualityPay: "si",
      certifications: ["bpg", "libre_brucelosis"],
    },
  },
  {
    key: "completo",
    label: "Con todos los datos",
    description:
      "Tres fincas con mapa y potreros, hato con historial, insumos, equipo completo, invitación pendiente y plan de exportación.",
    email: `demo-completo@${DOMAIN}`,
    displayName: "Cuenta completa (muestra)",
    orgName: "Ganadería Integral Sinú (muestra)",
    orgKind: "cooperativa",
    department: "Córdoba",
    municipality: "Cereté",
    onboardingPending: false,
    farms: [
      farm({
        code: "SINU",
        name: "El Sinú",
        prefix: "SI",
        municipality: "Cereté",
        focus: "leche",
        system: "semiestabulado",
        totalHa: 70,
        livestockHa: 62,
        lat: 8.89,
        lng: -75.79,
        vacas: 40,
        novillas: 14,
        terneros: 18,
        toros: 2,
        bufalas: 12,
      }),
      farm({
        code: "CEIBA",
        name: "La Ceiba",
        prefix: "CE",
        municipality: "Montería",
        focus: "carne",
        totalHa: 150,
        livestockHa: 132,
        lat: 8.76,
        lng: -75.88,
        vacas: 25,
        novillas: 10,
        terneros: 14,
        novillos: 45,
        toros: 3,
      }),
      farm({
        code: "PORVENIR",
        name: "El Porvenir",
        prefix: "PO",
        municipality: "Planeta Rica",
        totalHa: 100,
        livestockHa: 88,
        lat: 8.41,
        lng: -75.58,
        vacas: 30,
        novillas: 10,
        terneros: 12,
        novillos: 12,
        toros: 2,
      }),
    ],
    milkDays: 30,
    supplies: true,
    map: true,
    team: [
      {
        email: `demo-completo-admin@${DOMAIN}`,
        displayName: "Andrea Gómez (administradora)",
        role: "admin_entidad",
        farm: null,
      },
      {
        email: `demo-completo-operario@${DOMAIN}`,
        displayName: "Carlos Ruiz (operario)",
        role: "operario",
        farm: 0,
      },
      {
        email: `demo-completo-ordeno@${DOMAIN}`,
        displayName: "Rosa Díaz (operaria)",
        role: "operario",
        farm: 2,
      },
      {
        email: `demo-completo-vet@${DOMAIN}`,
        displayName: "Dr. Julián Mora (veterinario)",
        role: "tecnico",
        farm: null,
      },
    ],
    pendingInvitation: true,
    profile: {
      level: "completo",
      goals: ["exportar", "reproduccion", "trazabilidad"],
      focus: "doble_proposito",
      heads: 237,
      cows: 107,
      areaHa: 282,
      system: "rotacional",
      records: "software",
      breeding: "mixta",
      pregCheck: "regular",
      vet: "periodico",
      knowsCost: "si",
      milking: 62,
      milkLitersDay: 780,
      workers: 9,
      calvingIntervalMonths: 13,
      supplements: ["sal_mineral", "concentrado"],
      paddocks: 42,
      restDays: 30,
      saleWeightKg: 440,
      saleAgeMonths: 24,
      qualityPay: "si",
      certifications: ["bpg", "libre_brucelosis", "libre_tuberculosis"],
      exportPlan: {
        products: ["ganado_pie"],
        country: "Irak",
        docs: {
          "ganado_pie.predio": "si",
          "ganado_pie.orejera": "si",
          "ganado_pie.establecimiento": "tramite",
          "ganado_pie.requisitos_pais": "no",
          "ganado_pie.permiso_importacion": "no",
          "ganado_pie.vacunas": "si",
        },
      },
    },
  },
];

export const demoSpec = (key: string) => DEMO_SPECS.find((s) => s.key === key);

/**
 * Perfil de la finca con los totales del hato generado, para que el diagnóstico y el inventario
 * digan lo mismo. Se valida contra el esquema real: un perfil inválido no llega a la base.
 */
export function demoProfile(
  spec: DemoSpec,
  herd?: { animals: { category: string; sex: string }[] },
): FarmProfile | null {
  if (!spec.profile) return null;
  const raw = { ...spec.profile } as Record<string, unknown>;
  if (herd) {
    const cows = herd.animals.filter((a) => a.category === "vaca").length;
    raw.heads = herd.animals.length;
    raw.cows = cows;
    raw.areaHa = Math.round(spec.farms.reduce((sum, f) => sum + f.livestockHa, 0));
    if (typeof raw.milking === "number") {
      raw.milking = Math.min(raw.milking, cows);
      raw.milkLitersDay = Math.round((raw.milking as number) * (spec.key === "pequeno" ? 14 : 11));
    }
  }
  return FarmProfile.parse(raw);
}

/* ───────────── Hato y eventos ───────────── */

export interface DemoAnimal {
  id: string;
  farm: number;
  tag: string;
  species: "bovino" | "bufalino";
  sex: "hembra" | "macho";
  category: "ternero" | "novilla" | "novillo" | "vaca" | "toro";
  birthDate: string;
  motherId: string | null;
  fatherId: string | null;
  entryDate: string;
}

export interface DemoEvent {
  id: string;
  animalId: string;
  farm: number;
  type: string;
  occurredOn: string;
  data: Record<string, unknown>;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Genera animales y eventos coherentes: edades, sexos, partos, ordeños, pesos y sanidad. */
export function buildHerd(spec: DemoSpec, today: string, seed = 7) {
  const rnd = mulberry32(seed);
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const animals: DemoAnimal[] = [];
  const events: DemoEvent[] = [];
  const ago = (days: number) => shift(today, -days);

  spec.farms.forEach((f, farm) => {
    let n = 0;
    const tag = () => `${f.prefix}-${String(++n).padStart(3, "0")}`;
    const toros: DemoAnimal[] = [];
    const vacas: DemoAnimal[] = [];
    const make = (
      species: DemoAnimal["species"],
      sex: DemoAnimal["sex"],
      category: DemoAnimal["category"],
      ageDays: number,
      mother: DemoAnimal | null,
      father: DemoAnimal | null,
    ): DemoAnimal => {
      const a: DemoAnimal = {
        id: uuidv7(),
        farm,
        tag: tag(),
        species,
        sex,
        category,
        birthDate: ago(ageDays),
        motherId: mother?.id ?? null,
        fatherId: father?.id ?? null,
        entryDate: ago(Math.max(1, Math.min(ageDays, between(30, 400)))),
      };
      animals.push(a);
      return a;
    };

    for (let i = 0; i < f.toros; i++)
      toros.push(make("bovino", "macho", "toro", between(1500, 2600), null, null));
    for (let i = 0; i < f.vacas; i++)
      vacas.push(make("bovino", "hembra", "vaca", between(1100, 3300), null, null));
    const buf: DemoAnimal[] = [];
    if (f.bufalas > 0) {
      toros.push(make("bufalino", "macho", "toro", 2000, null, null));
      for (let i = 0; i < f.bufalas; i++)
        buf.push(make("bufalino", "hembra", "vaca", between(1200, 3000), null, null));
    }
    const dams = [...vacas, ...buf];
    for (let i = 0; i < f.novillas; i++)
      make("bovino", "hembra", "novilla", between(450, 900), null, null);
    for (let i = 0; i < f.novillos; i++)
      make("bovino", "macho", "novillo", between(450, 1000), null, null);
    const calves: DemoAnimal[] = [];
    for (let i = 0; i < f.terneros; i++) {
      const dam = dams[i % Math.max(1, dams.length)] ?? null;
      const sire = toros.find((t) => t.species === (dam?.species ?? "bovino")) ?? null;
      calves.push(
        make(
          dam?.species ?? "bovino",
          rnd() < 0.5 ? "hembra" : "macho",
          "ternero",
          between(20, 230),
          dam,
          sire,
        ),
      );
    }

    const push = (
      a: DemoAnimal,
      type: string,
      occurredOn: string,
      data: Record<string, unknown>,
    ) => {
      if (occurredOn < a.birthDate || occurredOn > today) return;
      events.push({ id: uuidv7(), animalId: a.id, farm, type, occurredOn, data });
    };

    const vet =
      spec.team.find((t) => t.role === "tecnico")?.displayName.replace(/ \(.*\)$/, "") ??
      "Veterinario de la finca";
    const staff = "Operario de la finca";
    const mine = animals.filter((x) => x.farm === farm);
    const daysOld = (a: DemoAnimal) =>
      Math.round((Date.parse(today) - Date.parse(a.birthDate)) / 864e5);

    type Extra = {
      dose?: string;
      cost?: number | null;
      milk?: number;
      meat?: number;
      who?: string;
    };
    const health = (
      a: DemoAnimal,
      daysAgo: number,
      kind: string,
      product: string,
      reason: string,
      o: Extra = {},
    ) =>
      push(a, "salud", ago(daysAgo), {
        kind,
        product,
        reason,
        ...(o.dose ? { dose: o.dose } : {}),
        responsible: o.who ?? vet,
        cost: o.cost === undefined ? null : o.cost,
        milkWithdrawalDays: o.milk ?? 0,
        meatWithdrawalDays: o.meat ?? 0,
      });

    // Escenarios clínicos y reproductivos: cada uno se reparte entre las vacas del hato.
    type Scenario =
      | "mastitis_clinica"
      | "mastitis_subclinica"
      | "mastitis_recurrente"
      | "seca"
      | "repetidora"
      | "prenez_media"
      | "retiro_leche"
      | "aborto"
      | "distocia"
      | "retencion"
      | "hipocalcemia"
      | "cojera"
      | "babesiosis"
      | "mellizos"
      | "descarte";
    const SCENARIOS: { name: Scenario; calf: boolean }[] = [
      { name: "mastitis_clinica", calf: true },
      { name: "seca", calf: false },
      { name: "repetidora", calf: false },
      { name: "mastitis_subclinica", calf: true },
      { name: "retiro_leche", calf: true },
      { name: "mastitis_recurrente", calf: false },
      { name: "aborto", calf: false },
      { name: "retencion", calf: true },
      { name: "prenez_media", calf: true },
      { name: "distocia", calf: true },
      { name: "hipocalcemia", calf: true },
      { name: "cojera", calf: false },
      { name: "babesiosis", calf: false },
      { name: "mellizos", calf: true },
      { name: "descarte", calf: false },
    ];
    const scen = new Map<string, Scenario>();
    {
      const withCalf = dams.filter((c) => calves.some((k) => k.motherId === c.id));
      const without = dams.filter((c) => !calves.some((k) => k.motherId === c.id));
      const total = Math.min(dams.length, Math.max(11, Math.round(dams.length * 0.35)));
      for (let j = 0; j < total; j++) {
        const sc = SCENARIOS[j % SCENARIOS.length] as (typeof SCENARIOS)[number];
        const pool = sc.calf ? withCalf : without;
        const cow = pool.shift() ?? (sc.calf ? without : withCalf).shift();
        if (cow) scen.set(cow.id, sc.name);
      }
    }

    // Reproducción, ordeño y sanidad de las hembras adultas.
    for (const cow of dams) {
      const calf = calves.find((c) => c.motherId === cow.id);
      const level = cow.species === "bufalino" ? between(4, 8) : between(9, 20);
      const calve = (
        d: number,
        ease: "Normal" | "Asistido" | "Distocia (cesárea)" = "Normal",
        sex?: "Mellizos",
      ) => {
        if (calf) {
          calf.birthDate = ago(d);
          calf.entryDate = ago(d);
        }
        push(cow, "parto", ago(d), {
          ...(calf
            ? { calfTag: calf.tag, calfSex: sex ?? (calf.sex === "hembra" ? "Hembra" : "Macho") }
            : {}),
          birthWeightKg: between(28, 42),
          ease,
        });
      };
      const milk = (since: number, f: (d: number) => number = () => 1) => {
        for (let d = 0; d < spec.milkDays && d <= since; d++) {
          const liters = Math.max(2, Math.round(level * (0.9 + rnd() * 0.2) * f(d) * 10) / 10);
          push(cow, "leche", ago(d), { liters, shift: "Mañana" });
          push(cow, "leche", ago(d), {
            liters: Math.max(1.5, Math.round(liters * 0.78 * 10) / 10),
            shift: "Tarde",
          });
        }
      };
      const cmt = (d: number, AI: number, AD: number, PI: number, PD: number) =>
        push(cow, "cmt", ago(d), { AI, AD, PI, PD });
      const service = (d: number, via: "IA" | "Monta" = "IA", sire = "HOL-221") =>
        push(cow, "servicio", ago(d), { via, sire });
      const heat = (d: number) =>
        push(cow, "celo", ago(d), { note: "Celo observado por el operario" });
      const dx = (d: number, result: "Preñada" | "Vacía" | "Dudosa", method = "Ecografía") =>
        push(cow, "dx", ago(d), { result, method });
      const tx = (d: number, product: string, reason: string, o: Extra) =>
        health(cow, d, "Tratamiento", product, reason, o);

      const sc = scen.get(cow.id);
      if (sc === "mastitis_clinica") {
        calve(95);
        milk(95, (d) => (d <= 5 ? 0.55 : 1));
        service(35);
        cmt(3, 0, 0, 4, 1);
        tx(2, "Cefquinoma intramamaria", "Mastitis clínica, cuarto posterior izquierdo", {
          dose: "1 jeringa cada 12 h por 3 días",
          cost: 38000,
          milk: 5,
          meat: 5,
        });
        tx(2, "Meloxicam", "Antiinflamatorio por mastitis", {
          dose: "0,5 mg/kg IM",
          cost: 22000,
          milk: 5,
          meat: 15,
        });
        cmt(1, 0, 0, 3, 1);
      } else if (sc === "mastitis_subclinica") {
        calve(130);
        milk(130, () => 0.92);
        service(50, "Monta", "BRA-114");
        cmt(8, 0, 2, 0, 3);
        cmt(1, 0, 3, 0, 3);
        health(
          cow,
          1,
          "Control",
          "Seguimiento de mastitis subclínica",
          "CMT positivo en dos cuartos, sin signos clínicos",
          { cost: 0 },
        );
      } else if (sc === "mastitis_recurrente") {
        calve(240);
        milk(240, () => 0.8);
        cmt(150, 4, 0, 0, 0);
        tx(149, "Cefquinoma intramamaria", "Mastitis clínica, cuarto anterior izquierdo", {
          cost: 38000,
          milk: 5,
          meat: 5,
        });
        cmt(100, 0, 0, 4, 0);
        tx(
          99,
          "Cefquinoma intramamaria",
          "Mastitis clínica recurrente, cuarto posterior izquierdo",
          { cost: 38000, milk: 5, meat: 5 },
        );
        health(
          cow,
          70,
          "Diagnóstico",
          "Cultivo de leche y antibiograma",
          "Mastitis recurrente · Staphylococcus aureus",
          { cost: 85000 },
        );
        cmt(40, 2, 0, 3, 0);
        tx(
          39,
          "Cloxacilina intramamaria",
          "Mastitis subclínica por S. aureus, tratamiento prolongado",
          {
            dose: "1 jeringa cada 24 h por 5 días",
            cost: 52000,
            milk: 6,
            meat: 30,
          },
        );
        cmt(5, 1, 0, 3, 0);
        health(
          cow,
          4,
          "Control",
          "Evaluación para descarte",
          "Mastitis crónica con producción en descenso",
          { cost: 0 },
        );
      } else if (sc === "seca") {
        calve(330);
        service(262);
        dx(225, "Preñada");
        push(cow, "secado", ago(39), { note: "Secado programado 60 días antes del parto" });
        tx(39, "Cloxacilina benzatínica (terapia de vaca seca)", "Secado", {
          cost: 30000,
          milk: 30,
          meat: 28,
        });
        health(
          cow,
          30,
          "Vacunación",
          "Vacuna reproductiva IBR/DVB/Leptospira",
          "Refuerzo preparto",
          { dose: "2 mL IM", cost: 9500 },
        );
      } else if (sc === "repetidora") {
        calve(200);
        milk(200, () => 0.95);
        heat(141);
        service(120);
        heat(99);
        service(98, "Monta", "BRA-114");
        dx(60, "Vacía");
        tx(55, "Cloprostenol (prostaglandina F2α)", "Anestro / vaca repetidora", {
          dose: "2 mL IM",
          cost: 18000,
          milk: 0,
          meat: 1,
        });
        health(
          cow,
          52,
          "Control",
          "Evaluación reproductiva",
          "Condición corporal 2,5; plan de suplementación",
          { cost: 0 },
        );
        heat(33);
        service(32, "IA", "GIR-310");
      } else if (sc === "prenez_media") {
        calve(150);
        milk(150);
        service(70);
        dx(30, "Preñada");
      } else if (sc === "retiro_leche") {
        calve(60);
        milk(60, (d) => (d <= 2 ? 0.7 : 1));
        health(cow, 2, "Diagnóstico", "Examen clínico", "Fiebre de 40,2 °C y tos", { cost: 0 });
        tx(2, "Oxitetraciclina larga acción", "Neumonía con fiebre", {
          dose: "1 mL por 10 kg IM",
          cost: 45000,
          milk: 4,
          meat: 28,
        });
      } else if (sc === "aborto") {
        calve(260);
        milk(260, () => 0.8);
        service(190);
        dx(155, "Preñada");
        push(cow, "aborto", ago(40), {
          note: "Aborto a los cinco meses; se tomó muestra para laboratorio",
        });
        health(
          cow,
          38,
          "Diagnóstico",
          "Panel de abortos (brucelosis, neosporosis, leptospira)",
          "Aborto sin causa conocida · resultado pendiente",
          { cost: 120000 },
        );
        tx(35, "Oxitocina y antibiótico uterino", "Limpieza posaborto", {
          cost: 30000,
          milk: 3,
          meat: 7,
        });
      } else if (sc === "distocia") {
        calve(25, "Distocia (cesárea)");
        milk(25, () => 0.9);
        tx(25, "Penicilina-estreptomicina", "Posoperatorio de cesárea", {
          dose: "1 mL por 20 kg IM por 5 días",
          cost: 420000,
          milk: 4,
          meat: 21,
        });
        tx(24, "Flunixin meglumine", "Dolor posquirúrgico", { cost: 20000, milk: 2, meat: 7 });
        health(
          cow,
          10,
          "Control",
          "Revisión posoperatoria",
          "Retiro de puntos; cicatrización buena",
          { cost: 0 },
        );
      } else if (sc === "retencion") {
        calve(12, "Asistido");
        milk(12, () => 0.8);
        tx(10, "Oxitocina y oxitetraciclina intrauterina", "Retención de placenta", {
          cost: 35000,
          milk: 4,
          meat: 14,
        });
        tx(6, "Ceftiofur", "Metritis puerperal", { cost: 48000, milk: 0, meat: 8 });
      } else if (sc === "hipocalcemia") {
        calve(8);
        milk(8, () => 0.7);
        health(cow, 7, "Diagnóstico", "Examen clínico", "Decúbito y extremidades frías", {
          cost: 0,
        });
        tx(7, "Borogluconato de calcio", "Hipocalcemia posparto (fiebre de leche)", {
          dose: "500 mL IV lento",
          cost: 60000,
        });
      } else if (sc === "cojera") {
        calve(180);
        milk(180);
        service(100);
        dx(65, "Preñada", "Palpación rectal");
        tx(14, "Corte de pezuña y oxitetraciclina tópica", "Cojera por dermatitis digital", {
          cost: 35000,
        });
        health(cow, 5, "Control", "Revisión de pezuña", "Mejora; continuar baño de pezuñas", {
          cost: 0,
        });
      } else if (sc === "babesiosis") {
        calve(140);
        milk(140);
        service(60);
        health(
          cow,
          10,
          "Diagnóstico",
          "Frotis sanguíneo",
          "Fiebre y orina oscura · hemoparásitos",
          { cost: 25000 },
        );
        tx(9, "Diminazeno", "Babesiosis (fiebre de garrapata)", {
          dose: "3,5 mg/kg IM",
          cost: 40000,
          milk: 3,
          meat: 14,
        });
        tx(9, "Complejo B y hematínico", "Apoyo por anemia", { cost: 18000 });
        health(cow, 7, "Control", "Baño garrapaticida", "Control de garrapatas", { cost: 15000 });
      } else if (sc === "mellizos") {
        calve(70, "Asistido", "Mellizos");
        milk(70);
      } else if (sc === "descarte") {
        calve(310);
        milk(310, () => 0.4);
        service(120);
        dx(20, "Vacía");
        health(
          cow,
          15,
          "Control",
          "Evaluación de descarte",
          "Baja producción y cuatro servicios sin preñez",
          { cost: 0 },
        );
      } else {
        const calfAge = calf ? daysOld(calf) : null;
        const lactating = Boolean(calf) || rnd() < 0.55;
        const partoDays =
          calfAge === null ? between(20, 260) : Math.max(15, Math.min(240, calfAge));
        if (lactating) {
          calve(partoDays);
          milk(partoDays);
          if (partoDays > 70) {
            const sv = partoDays - between(60, 95);
            if (rnd() < 0.4) heat(sv + 1);
            service(sv, rnd() < 0.5 ? "IA" : "Monta");
            if (sv > 35)
              dx(
                sv - 35,
                rnd() < 0.25 ? "Vacía" : "Preñada",
                rnd() < 0.5 ? "Ecografía" : "Palpación rectal",
              );
          }
        } else if (rnd() < 0.4) {
          heat(between(41, 50));
          service(between(5, 40), "IA", "GIR-310");
        }
      }
    }

    // Novillas: primera monta y celos.
    mine
      .filter((x) => x.category === "novilla")
      .forEach((nv, i) => {
        if (daysOld(nv) < 540) return;
        if (i % 3 === 0) {
          const d = between(40, 90);
          push(nv, "celo", ago(d + 1), { note: "Primer celo servido" });
          push(nv, "servicio", ago(d), { via: "IA", sire: "GIR-310" });
          push(nv, "dx", ago(d - 35), { result: "Preñada", method: "Ecografía" });
        } else if (i % 3 === 1) {
          push(nv, "celo", ago(between(2, 15)), { note: "En celo, lista para servir" });
        }
      });

    // Terneros enfermos.
    calves.forEach((c, i) => {
      if (daysOld(c) < 20) return;
      if (i % 4 === 0)
        health(c, between(3, 12), "Tratamiento", "Suero oral y enrofloxacina", "Diarrea neonatal", {
          dose: "5 mg/kg SC",
          cost: 24000,
          meat: 14,
          who: staff,
        });
      if (i % 7 === 1)
        health(c, between(8, 14), "Tratamiento", "Florfenicol", "Neumonía", {
          dose: "40 mg/kg SC",
          cost: 52000,
          meat: 28,
        });
    });

    // Sanidad preventiva y pruebas de todo el hato.
    for (const a of mine) {
      const age = daysOld(a);
      const adult = age > 700;
      const clinical = () => events.filter((e) => e.animalId === a.id && e.type === "salud").length;
      if (age < 200)
        health(
          a,
          age - 1,
          "Control",
          "Cuidado del recién nacido",
          "Desinfección de ombligo y calostro",
          { cost: 0, who: staff },
        );
      const c1 = between(8, 35);
      if (age > c1 + 100 && rnd() < 0.9)
        health(a, c1, "Vacunación", "Vacuna antiaftosa", "Ciclo nacional de vacunación", {
          dose: "2 mL SC",
          cost: 3800,
        });
      if (age > c1 + 190)
        health(
          a,
          c1 + between(170, 190),
          "Vacunación",
          "Vacuna antiaftosa",
          "Ciclo nacional de vacunación",
          { dose: "2 mL SC", cost: 3800 },
        );
      if (a.sex === "hembra" && age > 250)
        health(
          a,
          age - between(120, 240),
          "Vacunación",
          "Vacuna Brucella abortus cepa 19",
          "Prevención de brucelosis",
          { dose: "2 mL SC", cost: 6500 },
        );
      if (age > 120 && rnd() < 0.7)
        health(
          a,
          between(40, 300),
          "Vacunación",
          "Vacuna antirrábica",
          "Prevención de rabia paralítica bovina",
          { dose: "2 mL SC", cost: 3200 },
        );
      if (age > 90 && rnd() < 0.7)
        health(
          a,
          between(20, Math.max(21, Math.min(age - 45, 200))),
          "Vacunación",
          "Vacuna contra clostridiosis",
          "Carbón y edema maligno",
          { dose: "5 mL SC", cost: 3600 },
        );
      if (a.sex === "hembra" && age > 450 && rnd() < 0.7)
        health(
          a,
          between(25, 150),
          "Vacunación",
          "Vacuna reproductiva IBR/DVB/Leptospira",
          "Prevención de abortos",
          { dose: "2 mL IM", cost: 9500 },
        );
      if (age > 60 && rnd() < 0.85) {
        const young = age < 365;
        health(
          a,
          between(45, 150),
          "Desparasitación",
          young ? "Albendazol 10 %" : "Ivermectina 1 %",
          young ? "Parásitos gastrointestinales" : "Parásitos internos y externos",
          {
            dose: young ? "7,5 mg/kg VO" : "1 mL por 50 kg SC",
            cost: young ? 5200 : 7800,
            meat: young ? 14 : 35,
          },
        );
      }
      if (adult && rnd() < 0.6)
        health(
          a,
          between(30, 300),
          "Diagnóstico",
          "Prueba de brucelosis (Rosa de Bengala)",
          "Vigilancia del hato · resultado negativo",
          { cost: 18000 },
        );
      if (adult && rnd() < 0.4)
        health(
          a,
          between(30, 300),
          "Diagnóstico",
          "Tuberculina (prueba caudal)",
          "Vigilancia del hato · resultado negativo",
          { cost: 22000 },
        );
      if (a.category === "toro") {
        health(
          a,
          between(30, 200),
          "Control",
          "Examen andrológico",
          "Capacidad reproductiva satisfactoria",
          { cost: 60000 },
        );
        health(
          a,
          between(5, 60),
          "Control",
          "Control de condición corporal",
          "Condición 3,5 antes de la temporada de monta",
          { cost: 0, who: staff },
        );
      }
      if (clinical() === 0)
        health(
          a,
          Math.min(10, Math.max(1, age - 1)),
          "Control",
          "Revisión general",
          "Chequeo de rutina",
          { cost: 0, who: staff },
        );

      // Pesajes seriados.
      const step =
        a.category === "ternero" ? 45 : a.category === "vaca" || a.category === "toro" ? 110 : 75;
      const marks: number[] = [];
      for (let t = between(2, 6); t < age && marks.length < 8; t += step) marks.push(t);
      if (a.category === "ternero" && age > 3) marks.push(age - 1);
      const gain = a.category === "ternero" ? 0.7 : 0.55;
      for (const t of marks) {
        const grown = age - t;
        const kg =
          a.category === "vaca"
            ? (a.species === "bufalino" ? 520 : 430) + between(-25, 40)
            : a.category === "toro"
              ? 780 + between(-40, 80)
              : Math.round((35 + grown * gain) * (0.94 + rnd() * 0.12));
        push(a, "peso", ago(t), { kg, method: t % 3 === 0 ? "Cinta" : "Báscula" });
      }
    }
  });

  return { animals, events };
}
