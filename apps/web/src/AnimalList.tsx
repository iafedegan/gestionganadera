import {
  Baby,
  ChevronRight,
  CloudOff,
  type LucideIcon,
  Milk,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CountUp } from "./components";
import { CATEGORY_LABEL, STATUS_LABEL, num, todayLocal } from "./labels";
import { type AnimalInfo, FLAG_LABEL, type Flag, ageText } from "./lib/animalTags";
import type { LocalAnimal } from "./lib/localdb";
import { haptic } from "./native";

/**
 * La pantalla de Animales en piezas: el resumen del hato (que también filtra), las vistas
 * rápidas por estado y la lista de animales con lo que le pasa hoy a cada uno.
 */

const CATEGORY_ORDER = ["vaca", "novilla", "ternero", "novillo", "toro", "otro"];
const PLURAL: Record<string, string> = {
  vaca: "Vacas",
  novilla: "Novillas",
  ternero: "Terneros",
  novillo: "Novillos",
  toro: "Toros",
  otro: "Otros",
};

const count = <T,>(list: T[], key: (x: T) => string) =>
  list.reduce<Record<string, number>>((m, x) => {
    m[key(x)] = (m[key(x)] ?? 0) + 1;
    return m;
  }, {});

export function HerdSummary(props: {
  /** Animales activos de la finca elegida (todas las especies). */
  herd: { species: string; category: string }[];
  species: string;
  category: string;
  onSpecies(v: string): void;
  onCategory(v: string): void;
  pending: number;
}) {
  const bySpecies = count(props.herd, (a) => a.species);
  const scope = props.species ? props.herd.filter((a) => a.species === props.species) : props.herd;
  const byCategory = count(scope, (a) => a.category);
  const cats = CATEGORY_ORDER.filter((c) => byCategory[c]);
  const both = (bySpecies.bovino ?? 0) > 0 && (bySpecies.bufalino ?? 0) > 0;
  const shown = props.category ? (byCategory[props.category] ?? 0) : scope.length;
  const noun = props.category
    ? (PLURAL[props.category] ?? "").toLowerCase()
    : props.species === "bufalino"
      ? "búfalos"
      : props.species === "bovino"
        ? "bovinos"
        : "animales";

  return (
    <section className="herd-sum" aria-label="Resumen del hato">
      {both && (
        // biome-ignore lint/a11y/useSemanticElements: grupo de botones segmentados
        <div className="herd-seg" role="group" aria-label="Especie">
          {(
            [
              ["", "Todos", props.herd.length],
              ["bovino", "Bovinos", bySpecies.bovino ?? 0],
              ["bufalino", "Búfalos", bySpecies.bufalino ?? 0],
            ] as const
          ).map(([v, label, n]) => (
            <button
              key={label}
              type="button"
              aria-pressed={props.species === v}
              className={props.species === v ? "on" : ""}
              onClick={() => {
                haptic(8);
                props.onSpecies(v);
              }}
            >
              <span>{label}</span>
              <b>{num(n)}</b>
            </button>
          ))}
        </div>
      )}
      <p className="herd-total">
        <strong>
          <CountUp value={shown} ms={600} />
        </strong>
        <span>{noun} en la finca</span>
        {props.pending > 0 && (
          <small>
            <CloudOff size={14} aria-hidden="true" /> {props.pending} sin enviar
          </small>
        )}
      </p>
      {scope.length > 0 && (
        <>
          <div className="herd-bar" aria-hidden="true">
            {cats.map((c) => (
              <i
                key={c}
                className={`cat-${c}${props.category && props.category !== c ? " dim" : ""}`}
                style={{ flexGrow: byCategory[c] }}
              />
            ))}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: grupo de filtros por categoría */}
          <div className="herd-legend" role="group" aria-label="Categoría">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={props.category === c}
                className={`cat-${c}${props.category === c ? " on" : ""}`}
                onClick={() => {
                  haptic(8);
                  props.onCategory(props.category === c ? "" : c);
                }}
              >
                <span className="hl-dot" aria-hidden="true" />
                {PLURAL[c]} <b>{num(byCategory[c] ?? 0)}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const FLAG_ICON: Record<Flag, LucideIcon> = {
  retiro: ShieldAlert,
  palpar: Stethoscope,
  prenada: Baby,
  ordeno: Milk,
};

/** En las vistas rápidas se habla de varias. */
const VIEW_LABEL: Record<Flag, string> = {
  ordeno: "Ordeñadas",
  prenada: "Preñadas",
  palpar: "Por palpar",
  retiro: "En retiro",
};

export function QuickViews(props: {
  counts: Record<Flag, number>;
  value: Flag | "";
  onChange(v: Flag | ""): void;
}) {
  const items = (["ordeno", "prenada", "palpar", "retiro"] as const).filter(
    (f) => props.counts[f] > 0 || props.value === f,
  );
  if (items.length === 0) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: grupo de filtros rápidos
    <div className="herd-views" role="group" aria-label="Ver solo">
      {items.map((f) => {
        const Icon = FLAG_ICON[f];
        const on = props.value === f;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            className={`hv hv-${f}${on ? " on" : ""}`}
            onClick={() => {
              haptic(8);
              props.onChange(on ? "" : f);
            }}
          >
            <span className="hv-ic" aria-hidden="true">
              <Icon size={18} />
            </span>
            <b>{num(props.counts[f])}</b>
            <span>{VIEW_LABEL[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

const STEP = 40;

export function AnimalList(props: {
  rows: LocalAnimal[];
  info: Map<string, AnimalInfo>;
  births: Map<string, string | null>;
  farmName(id: string): string;
  /** Agrupa por finca cuando se ven varias a la vez. */
  grouped: boolean;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const [limit, setLimit] = useState(STEP);
  const more = useRef<HTMLButtonElement>(null);
  const today = todayLocal();
  const sorted = props.grouped
    ? [...props.rows].sort(
        (a, b) =>
          props.farmName(a.farmId).localeCompare(props.farmName(b.farmId), "es") ||
          a.tag.localeCompare(b.tag, "es", { numeric: true }),
      )
    : props.rows;
  const visible = sorted.slice(0, limit);
  const perFarm = count(props.rows, (r) => r.farmId);

  // Carga más filas al acercarse al final.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se observa de nuevo al crecer la lista
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + STEP);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, props.rows.length]);

  const groups: { farmId: string; rows: LocalAnimal[] }[] = [];
  for (const r of visible) {
    const last = groups.at(-1);
    if (last && (!props.grouped || last.farmId === r.farmId)) last.rows.push(r);
    else groups.push({ farmId: r.farmId, rows: [r] });
  }

  return (
    <div className="herd-list">
      {groups.map((g) => (
        <section key={g.farmId}>
          {props.grouped && (
            <h2 className="herd-farm">
              {props.farmName(g.farmId)} <span>{num(perFarm[g.farmId] ?? 0)}</span>
            </h2>
          )}
          <ul>
            {g.rows.map((r) => {
              const i = props.info.get(r.id);
              const age = ageText(props.births.get(r.id), today);
              const out = r.status !== "activo";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={r.id === props.selected ? "herd-row on" : "herd-row"}
                    onClick={() => {
                      haptic(8);
                      props.onSelect(r.id);
                    }}
                  >
                    <span className={`herd-av cat-${r.category}`} aria-hidden="true">
                      {(CATEGORY_LABEL[r.category] ?? "?").slice(0, 2)}
                      {r.species === "bufalino" && <small>Bú</small>}
                    </span>
                    <span className="herd-main">
                      <strong>{r.tag}</strong>
                      <span className="herd-sub">
                        {[
                          CATEGORY_LABEL[r.category],
                          age,
                          props.grouped ? "" : props.farmName(r.farmId),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {(out || r.syncState !== "sincronizado" || (i?.flags.length ?? 0) > 0) && (
                        <span className="herd-flags">
                          {out && <em className="f-out">{STATUS_LABEL[r.status]}</em>}
                          {!out &&
                            i?.flags.map((f) => (
                              <em key={f} className={`f-${f}`}>
                                {FLAG_LABEL[f]}
                              </em>
                            ))}
                          {r.syncState !== "sincronizado" && <em className="f-sync">Sin enviar</em>}
                        </span>
                      )}
                    </span>
                    {i?.last && !out && (
                      <span className="herd-val">
                        <b>
                          {num(i.last.value)} <small>{i.last.unit}</small>
                        </b>
                        <small>{i.last.unit === "L" ? "de leche" : "de peso"}</small>
                      </span>
                    )}
                    <ChevronRight size={18} aria-hidden="true" className="herd-go" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {visible.length < sorted.length && (
        <button
          ref={more}
          type="button"
          className="btn btn-ghost herd-more"
          onClick={() => setLimit((l) => l + STEP)}
        >
          Ver más animales ({num(sorted.length - visible.length)})
        </button>
      )}
    </div>
  );
}
