import { Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { VoiceAssistant } from "./VoiceAssistant";
import { CardHead } from "./components";
import type { VoiceField } from "./lib/voice";

/* ───────────── Utilidades de fecha y número ───────────── */

export const DAY = 864e5;
export const today = () => new Date(new Date().toDateString());
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const ago = (days: number) => iso(new Date(today().getTime() - days * DAY));
export const addDays = (s: string, n: number) =>
  iso(new Date(new Date(`${s}T12:00:00`).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY);
export const daysFromNow = (s: string) => daysBetween(iso(today()), s);
export const fmtDate = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
export const money = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;
export const moneyM = (n: number) =>
  Math.abs(n) >= 1e6
    ? `$ ${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`
    : money(n);
export const num = (n: number, d = 1) => n.toLocaleString("es-CO", { maximumFractionDigits: d });

export type Tone = "verde" | "azul" | "ambar" | "violeta" | "rojo" | "gris";
export const COLOR: Record<Tone, string> = {
  verde: "#1f7a4d",
  azul: "#0f6bc4",
  ambar: "#c98a12",
  violeta: "#7a5bb5",
  rojo: "#c0392b",
  gris: "#7b857f",
};

/* ───────────── Almacenamiento del prototipo ───────────── */

export function useStore<T>(key: string, seed: T[]): [T[], (r: T) => void, () => void] {
  const [extra, setExtra] = useState<T[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(`gg.kit.${key}`) ?? "[]") as T[];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  const persist = (v: T[]) => {
    try {
      localStorage.setItem(`gg.kit.${key}`, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  };
  return [
    [...extra, ...seed],
    (r) =>
      setExtra((p) => {
        const n = [r, ...p];
        persist(n);
        return n;
      }),
    () => {
      setExtra([]);
      persist([]);
    },
  ];
}

/* ───────────── Estructura ───────────── */

export function Tabs<K extends string>(props: {
  tabs: { key: K; label: string; badge?: number | string }[];
  value: K;
  onChange(k: K): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // La pestaña activa siempre queda a la vista en la barra desplazable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se recalcula al cambiar de pestaña
  useEffect(() => {
    const bar = ref.current;
    const on = bar?.querySelector<HTMLElement>(".kit-tab.on");
    if (bar && on)
      bar.scrollTo({
        left: on.offsetLeft - bar.clientWidth / 2 + on.offsetWidth / 2,
        behavior: "smooth",
      });
  }, [props.value]);
  return (
    <div className="kit-tabs" role="tablist" ref={ref}>
      {props.tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === props.value}
          className={t.key === props.value ? "kit-tab on" : "kit-tab"}
          onClick={() => props.onChange(t.key)}
        >
          {t.label}
          {t.badge !== undefined && <span className="kit-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export type SpeciesF = "todos" | "bovino" | "bufalino";
export function SpeciesFilter(props: { value: SpeciesF; onChange(v: SpeciesF): void }) {
  const opts: [SpeciesF, string][] = [
    ["todos", "Todo el hato"],
    ["bovino", "Bovinos"],
    ["bufalino", "Bufalinos"],
  ];
  return (
    // biome-ignore lint/a11y/useSemanticElements: grupo de botones segmentados
    <div className="kit-seg" role="group" aria-label="Especie">
      {opts.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={props.value === v}
          className={props.value === v ? "on" : ""}
          onClick={() => props.onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Panel(props: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={props.wide ? "card kit-panel wide" : "card kit-panel"}>
      <CardHead
        icon={props.icon ?? <span className="ch-none" aria-hidden="true" />}
        title={props.title}
        {...(props.sub ? { sub: props.sub } : {})}
        {...(props.action ? { action: props.action } : {})}
      />
      {props.children}
    </article>
  );
}

export function Stat(props: {
  label: string;
  value: ReactNode;
  meta?: string;
  tone?: Tone;
  icon?: ReactNode;
  goal?: string;
}) {
  return (
    <article className={`kit-stat t-${props.tone ?? "verde"}`}>
      <div className="ks-top">
        {props.icon && <span className="ks-icon">{props.icon}</span>}
        <span className="ks-label">{props.label}</span>
      </div>
      <strong className="ks-value">{props.value}</strong>
      {props.meta && <small className="ks-meta">{props.meta}</small>}
      {props.goal && <span className="ks-goal">Meta {props.goal}</span>}
    </article>
  );
}

export function Badge({ tone = "gris", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`kbadge b-${tone}`}>{children}</span>;
}

export interface AlertItem {
  tone: Tone;
  title: string;
  text: string;
  action?: { label: string; run(): void };
}
export function Alerts({ items, empty }: { items: AlertItem[]; empty?: string }) {
  if (items.length === 0) return <p className="hint">{empty ?? "Sin alertas por ahora."}</p>;
  return (
    <ul className="kit-alerts">
      {items.map((a, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista derivada sin identificador
        <li key={i} className={`al-${a.tone}`}>
          <span className="al-dot" />
          <span className="al-text">
            <strong>{a.title}</strong>
            <small>{a.text}</small>
          </span>
          {a.action && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={a.action.run}>
              {a.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Progress(props: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: string;
  right?: string;
}) {
  const pct = Math.max(0, Math.min(100, (props.value / (props.max ?? 100)) * 100));
  return (
    <div className="kit-progress">
      {(props.label || props.right) && (
        <div className="kp-top">
          <span>{props.label}</span>
          <span>{props.right ?? `${Math.round(pct)} %`}</span>
        </div>
      )}
      <div className="kp-track">
        <span style={{ width: `${pct}%`, background: COLOR[props.tone ?? "verde"] }} />
      </div>
    </div>
  );
}

export function Timeline({
  items,
}: { items: { date: string; title: string; text?: string; tone?: Tone }[] }) {
  if (items.length === 0) return <p className="hint">Sin eventos registrados.</p>;
  return (
    <ol className="kit-timeline">
      {items.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: línea de tiempo derivada
        <li key={i}>
          <span className="tl-dot" style={{ background: COLOR[e.tone ?? "verde"] }} />
          <div>
            <strong>{e.title}</strong>
            <small>
              {fmtDate(e.date)}
              {e.text ? ` · ${e.text}` : ""}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── Tabla con búsqueda y orden ───────────── */

export interface Col<T> {
  key: string;
  label: string;
  render?(r: T): ReactNode;
  sort?(r: T): string | number;
  align?: "right";
}
export function DataTable<T>(props: {
  cols: Col<T>[];
  rows: T[];
  search?: (r: T) => string;
  placeholder?: string;
  empty?: string;
  onRow?(r: T): void;
  toolbar?: ReactNode;
  pageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [limit, setLimit] = useState(props.pageSize ?? 12);
  const rows = useMemo(() => {
    let r = props.rows;
    if (q && props.search) {
      const s = q.toLowerCase();
      const f = props.search;
      r = r.filter((x) => f(x).toLowerCase().includes(s));
    }
    const col = props.cols.find((c) => c.key === sortKey);
    if (col?.sort) {
      const g = col.sort;
      r = [...r].sort((a, b) => {
        const x = g(a);
        const y = g(b);
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    return r;
  }, [props.rows, props.cols, props.search, q, sortKey, dir]);
  return (
    <div className="kit-table">
      {(props.search || props.toolbar) && (
        <div className="kt-bar">
          {props.search && (
            <label className="kt-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={q}
                placeholder={props.placeholder ?? "Buscar…"}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar"
              />
            </label>
          )}
          {props.toolbar}
        </div>
      )}
      <div className="ptable-wrap">
        <table className="ptable">
          <thead>
            <tr>
              {props.cols.map((c) => (
                <th key={c.key} scope="col" className={c.align === "right" ? "r" : ""}>
                  {c.sort ? (
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => {
                        if (sortKey === c.key) setDir((d) => (d === 1 ? -1 : 1));
                        else {
                          setSortKey(c.key);
                          setDir(1);
                        }
                      }}
                    >
                      {c.label}
                      {sortKey === c.key ? (dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: filas derivadas sin identificador
                key={i}
                className={props.onRow ? "clickable" : ""}
                {...(props.onRow
                  ? {
                      onClick: () => props.onRow?.(r),
                      onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && props.onRow?.(r),
                      tabIndex: 0,
                    }
                  : {})}
              >
                {props.cols.map((c) => (
                  <td key={c.key} data-label={c.label} className={c.align === "right" ? "r" : ""}>
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hint">{props.empty ?? "Sin resultados."}</p>}
      </div>
      {rows.length > limit && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setLimit((l) => l + 12)}
        >
          Ver más ({rows.length - limit})
        </button>
      )}
    </div>
  );
}

/* ───────────── Formulario en diálogo, con vista previa en vivo ───────────── */

export interface FField {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  value?: string;
  /** Al dictar: mayúsculas y cifras, para aretes y códigos. */
  spokenAsTag?: boolean;
  step?: string;
  required?: boolean;
  help?: string;
}
export function FormDialog(props: {
  open: boolean;
  title: string;
  sub?: string;
  fields: FField[];
  submitLabel?: string;
  /** Revisión por voz con los datos de la finca: lo que no cuadre se avisa antes de guardar. */
  voiceReview?(v: Record<string, string>): string | null;
  preview?(v: Record<string, string>): ReactNode;
  onSubmit(v: Record<string, string>): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const init = () =>
    Object.fromEntries(
      props.fields.map((f) => [
        f.name,
        f.value ?? (f.type === "date" ? iso(today()) : (f.options?.[0] ?? "")),
      ]),
    );
  const [vals, setVals] = useState<Record<string, string>>(init);
  const [voiceField, setVoiceField] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const voiceFields: VoiceField[] = props.fields.map((f) => ({
    name: f.name,
    label: f.label,
    type: f.spokenAsTag ? ("tag" as const) : f.type,
    ...(f.options ? { choices: f.options.map((o) => ({ value: o, label: o })) } : {}),
    // Las notas nunca son obligatorias; el resto sigue la misma regla del formulario.
    required: f.type === "textarea" ? false : f.required !== false,
  }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: se reinicia solo al abrir
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) {
      setVals(init());
      d.showModal();
    }
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="kf-title"
    >
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(vals);
        }}
      >
        <header className="dialog-head">
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={props.onClose}>
            ✕
          </button>
          <h2 id="kf-title">{props.title}</h2>
        </header>
        <div className="dialog-body">
          <section className="fsec">
            {props.sub && <p className="hint">{props.sub}</p>}
            {props.open && (
              <VoiceAssistant
                {...(props.voiceReview ? { review: props.voiceReview } : {})}
                fields={voiceFields}
                values={vals}
                onChange={(name, value) => {
                  setVals((p) => ({ ...p, [name]: value }));
                  return undefined;
                }}
                onActive={setVoiceField}
                onConfirm={() => formRef.current?.requestSubmit()}
              />
            )}
            <div className="kf-grid">
              {props.fields.map((f) => (
                <label
                  key={f.name}
                  htmlFor={`kf-${f.name}`}
                  className={[
                    f.type === "textarea" ? "span2" : "",
                    voiceField === f.name ? "voice-field" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      id={`kf-${f.name}`}
                      value={vals[f.name] ?? ""}
                      onChange={(e) => setVals((p) => ({ ...p, [f.name]: e.target.value }))}
                    >
                      {f.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      id={`kf-${f.name}`}
                      rows={2}
                      value={vals[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setVals((p) => ({ ...p, [f.name]: e.target.value }))}
                    />
                  ) : (
                    <input
                      id={`kf-${f.name}`}
                      type={f.type}
                      required={f.required !== false}
                      step={f.type === "number" ? (f.step ?? "any") : undefined}
                      min={f.type === "number" ? 0 : undefined}
                      value={vals[f.name] ?? ""}
                      placeholder={f.placeholder}
                      autoComplete="off"
                      onChange={(e) => setVals((p) => ({ ...p, [f.name]: e.target.value }))}
                    />
                  )}
                  {f.help && <small className="field-help">{f.help}</small>}
                </label>
              ))}
            </div>
          </section>
          {props.preview && <section className="fsec kf-preview">{props.preview(vals)}</section>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {props.submitLabel ?? "Guardar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/* ───────────── Gráficas SVG ───────────── */

export function LineChart(props: {
  labels: string[];
  series: { name: string; tone: Tone; points: number[]; dashed?: boolean }[];
  unit?: string;
  height?: number;
  goal?: { value: number; label: string };
}) {
  const W = 640;
  const H = props.height ?? 220;
  const pad = { l: 40, r: 14, t: 14, b: 28 };
  const all = props.series.flatMap((s) => s.points).concat(props.goal ? [props.goal.value] : []);
  const max = Math.max(...all, 1) * 1.1;
  const min = Math.min(0, ...all);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, props.labels.length - 1);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  return (
    <div className="kit-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={props.series.map((s) => s.name).join(", ")}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="ax">
              {num(t, t < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {props.goal && (
          <g>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(props.goal.value)}
              y2={y(props.goal.value)}
              className="goal"
            />
            <text x={W - pad.r} y={y(props.goal.value) - 5} textAnchor="end" className="ax">
              {props.goal.label}
            </text>
          </g>
        )}
        {props.labels.map((l, i) => (
          <text key={l + String(i)} x={x(i)} y={H - 8} textAnchor="middle" className="ax">
            {l}
          </text>
        ))}
        {props.series.map((s) => (
          <g key={s.name}>
            <path
              d={s.points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={COLOR[s.tone]}
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "6 5" : undefined}
              className="line-draw"
            />
            {s.points.map((v, i) => (
              <circle
                key={`${s.name}${i}`}
                cx={x(i)}
                cy={y(v)}
                r="3.4"
                fill="#fff"
                stroke={COLOR[s.tone]}
                strokeWidth="2"
              />
            ))}
          </g>
        ))}
      </svg>
      {props.series.length > 1 && (
        <ul className="kit-legend">
          {props.series.map((s) => (
            <li key={s.name}>
              <i style={{ background: COLOR[s.tone] }} /> {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BarChart(props: {
  labels: string[];
  series: { name: string; tone: Tone; values: number[] }[];
  unit?: string;
  height?: number;
  stacked?: boolean;
}) {
  const H = props.height ?? 200;
  const totals = props.labels.map((_, i) =>
    props.stacked
      ? props.series.reduce((a, s) => a + (s.values[i] ?? 0), 0)
      : Math.max(...props.series.map((s) => s.values[i] ?? 0)),
  );
  const max = Math.max(...totals, 1);
  return (
    <div className="kit-chart">
      <div
        className="kit-bars"
        style={{ height: H }}
        role="img"
        aria-label={props.series.map((s) => s.name).join(", ")}
      >
        {props.labels.map((l, i) => (
          <div key={l + String(i)} className="kb-col">
            <span className="kb-val">{num(totals[i] ?? 0, 1)}</span>
            <div
              className={props.stacked ? "kb-stack" : "kb-group"}
              style={{ height: `${Math.max(4, ((totals[i] ?? 0) / max) * 100)}%` }}
            >
              {props.series.map((s) => (
                <span
                  key={s.name}
                  className="kb-bar"
                  title={`${s.name}: ${num(s.values[i] ?? 0)}`}
                  style={{
                    background: COLOR[s.tone],
                    ...(props.stacked
                      ? { flex: `${s.values[i] ?? 0} 0 0` }
                      : { height: `${((s.values[i] ?? 0) / Math.max(totals[i] ?? 1, 1)) * 100}%` }),
                  }}
                />
              ))}
            </div>
            <span className="kb-lab">{l}</span>
          </div>
        ))}
      </div>
      {props.series.length > 1 && (
        <ul className="kit-legend">
          {props.series.map((s) => (
            <li key={s.name}>
              <i style={{ background: COLOR[s.tone] }} /> {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Donut(props: {
  slices: { label: string; value: number; tone: Tone }[];
  center?: ReactNode;
  format?: (n: number) => string;
}) {
  const total = props.slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="kit-donut">
      <div className="kd-ring">
        <svg viewBox="0 0 140 140" role="img" aria-label="Distribución">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef1ed" strokeWidth="18" />
          {props.slices.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={COLOR[s.tone]}
                strokeWidth="18"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="kd-center">{props.center}</div>
      </div>
      <ul className="kit-legend col">
        {props.slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: COLOR[s.tone] }} /> {s.label}
            <b>
              {props.format ? props.format(s.value) : `${Math.round((s.value / total) * 100)} %`}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Exportación ───────────── */

/** Descarga un CSV (separado por punto y coma, como lo abre Excel en español). */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    // Evita inyección de fórmulas al abrir en hojas de cálculo.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = `﻿${[header, ...rows].map((r) => r.map(esc).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${iso(today())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
