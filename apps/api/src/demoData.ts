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
    milkDays: 21,
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

    // Reproducción y ordeño de las hembras adultas.
    for (const cow of dams) {
      const calf = calves.find((c) => c.motherId === cow.id);
      const lactating = Boolean(calf) || rnd() < 0.55;
      const calfAge = calf
        ? Math.round((Date.parse(today) - Date.parse(calf.birthDate)) / 864e5)
        : null;
      const partoDays = calfAge === null ? between(20, 260) : Math.max(15, Math.min(240, calfAge));
      if (lactating) {
        push(cow, "parto", ago(partoDays), {
          ...(calf
            ? { calfTag: calf.tag, calfSex: calf.sex === "hembra" ? "Hembra" : "Macho" }
            : {}),
          birthWeightKg: between(28, 42),
          ease: "Normal",
        });
        const base = cow.species === "bufalino" ? between(4, 8) : between(9, 20);
        for (let d = 0; d < spec.milkDays; d++) {
          if (d > partoDays) break;
          const liters = Math.max(2, Math.round(base * (0.9 + rnd() * 0.2) * 10) / 10);
          push(cow, "leche", ago(d), { liters, shift: "Mañana" });
        }
        if (partoDays > 70) {
          const sv = partoDays - between(60, 95);
          push(cow, "servicio", ago(sv), { via: rnd() < 0.5 ? "IA" : "Monta", sire: "HOL-221" });
          if (sv > 35) {
            const open = rnd() < 0.25;
            push(cow, "dx", ago(sv - 35), {
              result: open ? "Vacía" : "Preñada",
              method: rnd() < 0.5 ? "Ecografía" : "Palpación rectal",
            });
          }
        }
        if (rnd() < 0.08) {
          push(cow, "cmt", ago(between(1, 6)), { AI: rnd() < 0.5 ? 3 : 1, AD: 0, PI: 0, PD: 1 });
        }
      } else if (rnd() < 0.4) {
        push(cow, "servicio", ago(between(5, 40)), { via: "IA", sire: "GIR-310" });
      }
    }

    // Crecimiento: dos pesajes de las crías, novillas y novillos.
    for (const a of animals.filter(
      (x) => x.farm === farm && ["ternero", "novilla", "novillo"].includes(x.category),
    )) {
      const age = (Date.parse(today) - Date.parse(a.birthDate)) / 864e5;
      const kg = (days: number) => Math.round(35 + days * (a.category === "ternero" ? 0.7 : 0.52));
      if (age > 90) push(a, "peso", ago(60), { kg: kg(age - 60), method: "Báscula" });
      push(a, "peso", ago(between(1, 6)), {
        kg: kg(age),
        method: rnd() < 0.7 ? "Báscula" : "Cinta",
      });
    }

    // Sanidad: vacunación a una parte del hato y algunos tratamientos con retiro vigente.
    for (const a of animals.filter((x) => x.farm === farm)) {
      if (rnd() < 0.45) {
        push(a, "salud", ago(between(15, 95)), {
          kind: "Vacunación",
          product: "Vacuna antiaftosa",
          reason: "Ciclo nacional",
          dose: "2 mL SC",
          responsible: "Veterinario de la finca",
          cost: 3800,
          milkWithdrawalDays: 0,
          meatWithdrawalDays: 0,
        });
      }
    }
    for (const cow of vacas.slice(0, 2)) {
      push(cow, "salud", ago(between(1, 4)), {
        kind: "Tratamiento",
        product: "Oxitetraciclina larga acción",
        reason: "Mastitis",
        dose: "1 mL por 10 kg IM",
        responsible: "Veterinario de la finca",
        cost: 45000,
        milkWithdrawalDays: 7,
        meatWithdrawalDays: 28,
      });
    }
  });

  return { animals, events };
}
