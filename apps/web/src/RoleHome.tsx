import type { Role } from "@ganaderia/contracts";
import { ROLE_LABEL } from "@ganaderia/domain";
import {
  Baby,
  BarChart3,
  Bell,
  FolderOpen,
  type LucideIcon,
  Milk,
  Package,
  PawPrint,
  Scale,
  ShieldPlus,
  Sprout,
  Stethoscope,
  Trees,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAlerts } from "./Alerts";
import { AssistantCard } from "./Assistant";
import { FarmIntel } from "./FarmIntel";
import { useActiveFarm } from "./animals";
import { PageHead } from "./components";
import { todayLocal } from "./labels";
import { type HomeStats, homeStats } from "./lib/homeStats";
import { localdb } from "./lib/localdb";
import { type ModuleKey, canSeeModule } from "./modules";
import { useApp } from "./state";

/**
 * Inicio según el rol: cada persona ve su trabajo del día. El propietario y el administrador
 * conservan el Inicio completo; aquí van el mayordomo, el veterinario, el operario y el asesor.
 */

export const HAS_ROLE_HOME: readonly Role[] = ["mayordomo", "veterinario", "operario", "tecnico"];

interface Action {
  module: ModuleKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const ACTIONS: Record<string, Action[]> = {
  mayordomo: [
    { module: "produccion", label: "Ordeño y peso", hint: "Registre el día", icon: Milk },
    { module: "animales", label: "Animales", hint: "Hato y novedades", icon: PawPrint },
    { module: "pasturas", label: "Potreros", hint: "Rotación y descanso", icon: Sprout },
    { module: "compras", label: "Bodega", hint: "Insumos y consumos", icon: Package },
    { module: "reproduccion", label: "Reproducción", hint: "Celos y partos", icon: Baby },
    { module: "sanidad", label: "Sanidad", hint: "Vacunas y tratamientos", icon: ShieldPlus },
  ],
  veterinario: [
    {
      module: "sanidad",
      label: "Historia clínica",
      hint: "Tratamientos y vacunas",
      icon: Stethoscope,
    },
    { module: "reproduccion", label: "Diagnóstico", hint: "Palpaciones y partos", icon: Baby },
    { module: "animales", label: "Buscar animal", hint: "Hoja de vida", icon: PawPrint },
    { module: "asistencia", label: "Recomendaciones", hint: "Asistencia técnica", icon: Users },
  ],
  operario: [
    { module: "produccion", label: "Ordeño y peso", hint: "Anote lo de hoy", icon: Milk },
    { module: "animales", label: "Mis animales", hint: "Buscar por arete", icon: PawPrint },
    {
      module: "sanidad",
      label: "Novedad sanitaria",
      hint: "Animal enfermo o tratado",
      icon: ShieldPlus,
    },
    { module: "reproduccion", label: "Celos y partos", hint: "Avisar lo que vio", icon: Baby },
  ],
  tecnico: [
    { module: "expediente", label: "Expediente", hint: "Línea base de la finca", icon: FolderOpen },
    { module: "trazabilidad", label: "Trazabilidad", hint: "Lindero y bosque", icon: Trees },
    { module: "asistencia", label: "Asistencia", hint: "Consultas y recomendaciones", icon: Users },
    { module: "produccion", label: "Producción", hint: "Indicadores", icon: BarChart3 },
  ],
};

const TITLE: Record<string, string> = {
  mayordomo: "El trabajo de la finca hoy",
  veterinario: "Pacientes y reproducción",
  operario: "Su trabajo de hoy",
  tecnico: "Acompañamiento de la finca",
};

interface Figures {
  total: number;
  retiro: number;
  stats: HomeStats | null;
}

/** Animales en retiro de leche o carne por un tratamiento reciente. */
export function inWithdrawal(
  events: { animalId: string; type: string; occurredOn: string; data: unknown }[],
  today: string,
): number {
  const set = new Set<string>();
  for (const e of events) {
    if (e.type !== "salud") continue;
    const d = e.data as { milkWithdrawalDays?: number; meatWithdrawalDays?: number };
    const days = Math.max(d.milkWithdrawalDays ?? 0, d.meatWithdrawalDays ?? 0);
    if (days <= 0) continue;
    const end = new Date(Date.parse(e.occurredOn) + days * 86_400_000).toISOString().slice(0, 10);
    if (e.occurredOn <= today && end >= today) set.add(e.animalId);
  }
  return set.size;
}

export function RoleHome(props: { onOpenSync(): void; onModule(m: ModuleKey): void }) {
  const { orgId, role, session, dataVersion } = useApp();
  const active = useActiveFarm();
  const alerts = useAlerts(props.onOpenSync, props.onModule);
  const [fig, setFig] = useState<Figures | null>(null);
  const key = role ?? "operario";

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void Promise.all([localdb.herdAnimals(orgId), localdb.listAnimalEvents(orgId)]).then(
      ([h, e]) => {
        const herd = active ? h.filter((a) => a.farmId === active) : h;
        const events = active ? e.filter((x) => x.farmId === active) : e;
        const today = todayLocal();
        setFig({
          total: herd.length,
          retiro: inWithdrawal(events, today),
          stats: homeStats(herd, events, today),
        });
      },
    );
  }, [orgId, dataVersion, active]);

  const first = (session?.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const actions = (ACTIONS[key] ?? []).filter((a) => canSeeModule(a.module, role));
  const st = fig?.stats;
  const tiles: { label: string; value: string; icon: LucideIcon; warn?: boolean }[] =
    key === "veterinario"
      ? [
          {
            label: "En retiro",
            value: String(fig?.retiro ?? "—"),
            icon: ShieldPlus,
            warn: (fig?.retiro ?? 0) > 0,
          },
          {
            label: "Por palpar",
            value: String(st?.toPalpate ?? "—"),
            icon: Stethoscope,
            warn: (st?.toPalpate ?? 0) > 0,
          },
          { label: "Preñadas", value: String(st?.pregnant ?? "—"), icon: Baby },
          { label: "Hembras", value: String(st?.females ?? "—"), icon: PawPrint },
        ]
      : [
          { label: "Animales", value: String(fig?.total ?? "—"), icon: PawPrint },
          {
            label: "Leche 7 días",
            value: st ? `${Math.round(st.milk7).toLocaleString("es-CO")} L` : "—",
            icon: Milk,
          },
          {
            label: "En retiro",
            value: String(fig?.retiro ?? "—"),
            icon: ShieldPlus,
            warn: (fig?.retiro ?? 0) > 0,
          },
          ...(key === "operario"
            ? []
            : [{ label: "Por palpar", value: String(st?.toPalpate ?? "—"), icon: Scale }]),
        ];

  return (
    <section className="page page-home page-rolehome">
      <PageHead
        kicker={`${first ? `Hola, ${first}` : "Hola"} · ${role ? ROLE_LABEL[role] : ""}`}
        title={TITLE[key] ?? "Inicio"}
        lead={session?.memberships[0]?.organizationName ?? ""}
      />

      <nav className="role-actions" aria-label="Acciones de su rol">
        {actions.map((a) => (
          <button
            key={a.module}
            type="button"
            className="role-action"
            onClick={() => props.onModule(a.module)}
          >
            <span className="role-ic">
              <a.icon size={24} aria-hidden="true" />
            </span>
            <strong>{a.label}</strong>
            <small>{a.hint}</small>
          </button>
        ))}
      </nav>

      <dl className="role-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={t.warn ? "warn" : ""}>
            <dt>
              <t.icon size={16} aria-hidden="true" /> {t.label}
            </dt>
            <dd>{t.value}</dd>
          </div>
        ))}
      </dl>

      <article className="card role-todo">
        <h2>
          <Bell size={18} aria-hidden="true" /> Por atender
        </h2>
        {alerts.length === 0 ? (
          <p className="hint">Todo en orden por ahora.</p>
        ) : (
          <ul className="alert-rows">
            {alerts.map((a) => (
              <li key={a.title}>
                <span className={`ar-icon ar-${a.tone}`}>{a.icon}</span>
                <div className="ar-text">
                  <strong>{a.title}</strong>
                  <p>{a.text}</p>
                </div>
                {a.go && (
                  <button
                    type="button"
                    className="ar-go"
                    aria-label={`Abrir: ${a.title}`}
                    onClick={a.go}
                  >
                    ›
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </article>

      {(key === "mayordomo" || key === "tecnico") && <FarmIntel />}
      {key !== "operario" && <AssistantCard />}
    </section>
  );
}
