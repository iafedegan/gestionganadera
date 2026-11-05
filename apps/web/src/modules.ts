import {
  Baby,
  BarChart3,
  Calculator,
  CalendarDays,
  ClipboardList,
  Coins,
  Dna,
  Droplets,
  FileText,
  Home,
  Leaf,
  type LucideIcon,
  Map as MapIcon,
  Milk,
  Package,
  PawPrint,
  Scale,
  Scan,
  Settings,
  ShieldCheck,
  Sprout,
  Stethoscope,
  Store,
  Tractor,
  TrendingUp,
  Users,
  UsersRound,
  VenusAndMars,
  Wheat,
} from "lucide-react";

import type { Role } from "@ganaderia/contracts";
import { type Permission, can } from "@ganaderia/domain";

export type ModuleKey =
  | "inicio"
  | "animales"
  | "produccion"
  | "reproduccion"
  | "sanidad"
  | "pasturas"
  | "economia"
  | "asistencia"
  | "configuracion"
  | "compras"
  | "ventas"
  | "personal"
  | "activos"
  | "contabilidad";

export interface PreviewCard {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Cuándo llega según el plan de desarrollo. */
  when: string;
  tone: "verde" | "azul" | "ambar" | "violeta";
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Grupo de la navegación: operación del hato (por defecto) o gestión empresarial (ERP). */
  group?: "erp";
  /** Semana o fase del plan en que se activa; vacío si ya está disponible. */
  phase?: string;
  title?: string;
  lead?: string;
  note?: string;
  cards?: PreviewCard[];
}

export const MODULES: ModuleDef[] = [
  { key: "inicio", label: "Inicio", short: "Inicio", icon: Home },
  { key: "animales", label: "Animales", short: "Animales", icon: PawPrint },
  {
    key: "produccion",
    label: "Producción",
    short: "Producción",
    icon: BarChart3,
    phase: "Semana 6",
    title: "Producción y crecimiento",
    lead: "Registro, calidad y destino de la leche; control de peso y seguimiento del crecimiento.",
    note: "La leche se registra en litros y los pesos en kilogramos. Un total colectivo nunca se suma a los controles individuales.",
    cards: [
      {
        icon: Milk,
        title: "Leche y lactancias",
        text: "Ordeños por animal o por lote, leche descartada con su motivo y destino de la producción.",
        when: "Semana 6",
        tone: "azul",
      },
      {
        icon: Scale,
        title: "Carne y crecimiento",
        text: "Pesajes medidos o estimados y ganancia diaria calculada solo con intervalos válidos.",
        when: "Semana 6",
        tone: "verde",
      },
      {
        icon: Baby,
        title: "Crías y reemplazos",
        text: "Nacimiento, alimentación, desarrollo y destete de cada cría.",
        when: "Fase 2",
        tone: "ambar",
      },
    ],
  },
  {
    key: "reproduccion",
    label: "Reproducción",
    short: "Reproducción",
    icon: VenusAndMars,
    phase: "Semana 7",
    title: "Agenda reproductiva",
    lead: "Visualice y gestione los eventos reproductivos de sus animales.",
    note: "Bovinos y bufalinos usan parámetros distintos, aprobados por el responsable técnico. Las fechas estimadas se identifican como tales.",
    cards: [
      {
        icon: CalendarDays,
        title: "Eventos programados y recientes",
        text: "Servicio, diagnóstico, parto, aborto y secado, con el próximo control de cada animal.",
        when: "Semana 7",
        tone: "violeta",
      },
      {
        icon: Baby,
        title: "Parto y cría vinculada",
        text: "Un parto crea la cría una sola vez y conserva el vínculo con su madre.",
        when: "Semana 7",
        tone: "verde",
      },
      {
        icon: Dna,
        title: "Recursos genéticos",
        text: "Existencias de semen y embriones y propuestas de apareamiento revisables.",
        when: "Fase 2",
        tone: "ambar",
      },
    ],
  },
  {
    key: "sanidad",
    label: "Sanidad",
    short: "Sanidad",
    icon: ShieldCheck,
    phase: "Semana 8",
    title: "Prevención, atención y seguimiento",
    lead: "Registre, planifique y dé seguimiento a los eventos sanitarios para promover el bienestar.",
    note: "Una alerta no equivale a un diagnóstico: la decisión sanitaria requiere revisión profesional.",
    cards: [
      {
        icon: Stethoscope,
        title: "Casos y controles",
        text: "Observaciones, vacunaciones y tratamientos, individuales o por selección de animales.",
        when: "Semana 8",
        tone: "azul",
      },
      {
        icon: ShieldCheck,
        title: "Períodos de retiro",
        text: "Retiro de leche y de carne por animal; advertencia antes de vender o destinar la leche.",
        when: "Semana 8",
        tone: "ambar",
      },
      {
        icon: ClipboardList,
        title: "Planes preventivos",
        text: "Vacunación, exámenes, bioseguridad y bienestar.",
        when: "Fase 2",
        tone: "verde",
      },
    ],
  },
  {
    key: "pasturas",
    label: "Pasturas y alimentación",
    short: "Pasturas",
    icon: Sprout,
    phase: "Fase 2",
    title: "Planifique recursos y compare la ejecución",
    lead: "Potreros, oferta forrajera y alimentación del lote. Hoy los potreros se manejan solo por nombre y área.",
    note: "Los cálculos mostrarán siempre sus supuestos y se distinguirán de lo medido.",
    cards: [
      {
        icon: MapIcon,
        title: "Mapa de potreros",
        text: "Uso, descanso y áreas restringidas de cada potrero.",
        when: "Fase 2",
        tone: "verde",
      },
      {
        icon: Wheat,
        title: "Presupuesto forrajero",
        text: "Oferta de materia seca, demanda del lote y días de cobertura.",
        when: "Fase 2",
        tone: "ambar",
      },
      {
        icon: Droplets,
        title: "Agua y clima",
        text: "Disponibilidad de agua y condiciones climáticas.",
        when: "Fase 2",
        tone: "azul",
      },
    ],
  },
  {
    key: "economia",
    label: "Economía",
    short: "Economía",
    icon: Coins,
    phase: "Semana 11",
    title: "Resultados de la finca",
    lead: "Ingresos y egresos registrados manualmente, con sus soportes.",
    note: "La diferencia se llamará «saldo de movimientos registrados»: no es utilidad, margen ni saldo bancario.",
    cards: [
      {
        icon: Coins,
        title: "Ingresos y egresos",
        text: "Movimientos por finca, categoría y período, con soporte opcional y correcciones trazables.",
        when: "Semana 11",
        tone: "verde",
      },
      {
        icon: TrendingUp,
        title: "Costos y márgenes",
        text: "Costos por actividad, márgenes y escenarios de decisión.",
        when: "Fase 2",
        tone: "violeta",
      },
      {
        icon: BarChart3,
        title: "Presupuesto y ejecución",
        text: "Comparación del presupuesto con lo ejecutado por rubro.",
        when: "Fase 2",
        tone: "azul",
      },
    ],
  },
  {
    key: "asistencia",
    label: "Asistencia técnica",
    short: "Asistencia",
    icon: Users,
    phase: "Fase 2",
    title: "Visitas, recomendaciones y compromisos",
    lead: "Registre y dé seguimiento a las visitas técnicas y los compromisos para fortalecer la gestión.",
    note: "El acceso del asesor es solo a las fincas, módulos y fechas que usted autorice.",
    cards: [
      {
        icon: CalendarDays,
        title: "Agenda de visitas",
        text: "Visitas programadas, pendientes y realizadas.",
        when: "Fase 2",
        tone: "azul",
      },
      {
        icon: FileText,
        title: "Informe de visita",
        text: "Objetivo, hallazgos, recomendaciones y soportes.",
        when: "Fase 2",
        tone: "verde",
      },
      {
        icon: Scan,
        title: "Acceso compartido",
        text: "Permisos por módulo con vigencia, revocables en cualquier momento.",
        when: "Fase 2",
        tone: "ambar",
      },
    ],
  },
  { key: "configuracion", label: "Configuración", short: "Config.", icon: Settings },
  {
    key: "compras",
    label: "Compras e insumos",
    short: "Compras",
    icon: Package,
    group: "erp",

    title: "Compras, proveedores e insumos",
    lead: "Controle lo que entra a la finca: alimentos, medicamentos, sales y materiales, con lote y vencimiento.",
    note: "Cada consumo se asigna a un lote o actividad, nunca a un animal individual si no se midió así.",
    cards: [
      {
        icon: Package,
        title: "Inventario de insumos",
        text: "Existencias por bodega con lote de producto, vencimiento y costo promedio.",
        when: "ERP 1",
        tone: "verde",
      },
      {
        icon: Store,
        title: "Proveedores y órdenes de compra",
        text: "Cotización, orden, recepción y soporte; aprobación por monto.",
        when: "ERP 1",
        tone: "azul",
      },
      {
        icon: ShieldCheck,
        title: "Consumo trazable",
        text: "Vincula la aplicación de un medicamento con su lote de producto y su retiro.",
        when: "ERP 1",
        tone: "ambar",
      },
    ],
  },
  {
    key: "ventas",
    label: "Ventas y clientes",
    short: "Ventas",
    icon: Store,
    group: "erp",
    phase: "ERP 2",
    title: "Ventas, clientes y entregas",
    lead: "Animales, leche y otros productos: cliente, precio, entrega y cobro en un solo flujo.",
    note: "Una venta con retiro de carne activo exige revisión autorizada antes de confirmarse.",
    cards: [
      {
        icon: Users,
        title: "Clientes y compradores",
        text: "Plantas de beneficio, subastas, acopiadores y queserías, con su historial.",
        when: "ERP 2",
        tone: "violeta",
      },
      {
        icon: Milk,
        title: "Entrega y liquidación de leche",
        text: "Volumen entregado, calidad y conciliación contra lo ordeñado.",
        when: "ERP 2",
        tone: "azul",
      },
      {
        icon: Coins,
        title: "Cuentas por cobrar",
        text: "Saldos por cliente, vencimientos y recaudos vinculados a cada venta.",
        when: "ERP 2",
        tone: "verde",
      },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    short: "Personal",
    icon: UsersRound,
    group: "erp",
    phase: "ERP 3",
    title: "Personal, turnos y jornales",
    lead: "Quién trabaja en cada finca, en qué turno y qué tareas tiene asignadas.",
    note: "La liquidación legal de nómina queda fuera del alcance actual y se evaluará con un proveedor especializado.",
    cards: [
      {
        icon: UsersRound,
        title: "Trabajadores y turnos",
        text: "Fichas, vinculación, turnos de ordeño y asignación a fincas.",
        when: "ERP 3",
        tone: "verde",
      },
      {
        icon: ClipboardList,
        title: "Jornales y labores",
        text: "Registro de labores por lote o actividad y su costo de mano de obra.",
        when: "ERP 3",
        tone: "ambar",
      },
      {
        icon: FileText,
        title: "Capacitaciones y dotación",
        text: "Cursos, certificados con vencimiento y entregas de dotación.",
        when: "ERP 3",
        tone: "azul",
      },
    ],
  },
  {
    key: "activos",
    label: "Maquinaria y activos",
    short: "Activos",
    icon: Tractor,
    group: "erp",
    phase: "ERP 3",
    title: "Maquinaria, equipos e infraestructura",
    lead: "Tractores, equipos de ordeño, cercas, pozos y bebederos, con su mantenimiento.",
    cards: [
      {
        icon: Tractor,
        title: "Hoja de vida del equipo",
        text: "Ficha, horas de uso, combustible y costo por equipo.",
        when: "ERP 3",
        tone: "ambar",
      },
      {
        icon: CalendarDays,
        title: "Mantenimiento programado",
        text: "Plan preventivo con alertas por fecha o por horas de uso.",
        when: "ERP 3",
        tone: "azul",
      },
      {
        icon: MapIcon,
        title: "Infraestructura",
        text: "Cercas, corrales, bebederos y pozos asociados a cada potrero.",
        when: "ERP 3",
        tone: "verde",
      },
    ],
  },
  {
    key: "contabilidad",
    label: "Contabilidad y fiscal",
    short: "Contabilidad",
    icon: Calculator,
    group: "erp",
    phase: "ERP 4",
    title: "Contabilidad, impuestos y facturación",
    lead: "Cuentas por pagar y cobrar, centros de costo, cierres y exportación a su contador.",
    note: "La facturación electrónica y la contabilidad tributaria completa requieren un proveedor autorizado; se evalúa como integración, no como desarrollo propio.",
    cards: [
      {
        icon: Calculator,
        title: "Plan de cuentas y cierres",
        text: "Centros de costo, cierres versionados y exportación para el contador.",
        when: "ERP 4",
        tone: "violeta",
      },
      {
        icon: FileText,
        title: "Facturación electrónica",
        text: "Emisión a través de un proveedor tecnológico autorizado.",
        when: "ERP 4",
        tone: "azul",
      },
      {
        icon: TrendingUp,
        title: "Costos y rentabilidad",
        text: "Costo por animal, lote, litro y kilogramo, con fórmula, período y datos visibles.",
        when: "ERP 4",
        tone: "verde",
      },
    ],
  },
];

export const moduleByKey = (k: ModuleKey) => MODULES.find((m) => m.key === k) as ModuleDef;

/**
 * Módulos que exigen un permiso para verse. Un veterinario o un empleado no ve costos,
 * contabilidad ni la gestión de la empresa; el servidor igual rechaza esos datos.
 */
const REQUIRES: Partial<Record<ModuleKey, Permission>> = {
  economia: "economy.read",
  contabilidad: "economy.read",
  ventas: "economy.read",
  compras: "supply.write",
  personal: "team.manage",
  activos: "farm.write",
};

export const canSeeModule = (k: ModuleKey, role: Role | null): boolean => {
  const need = REQUIRES[k];
  return !need || (role !== null && can(role, need));
};

export const modulesFor = (role: Role | null): ModuleDef[] =>
  MODULES.filter((m) => canSeeModule(m.key, role));

export { Leaf };
