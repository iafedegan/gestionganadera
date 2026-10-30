import { RotateCcw } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { CardHead, Kpi, PageHead } from "./components";
import { type ModuleKey, moduleByKey } from "./modules";
import { type Action, type Column, type KpiDef, PROTO, type Row } from "./protoData";
import { useApp } from "./state";

const KEY = (m: string) => `gg.proto.${m}`;

function load(m: string): Record<string, Row[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(m)) ?? "{}") as Record<string, Row[]>;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function save(m: string, v: Record<string, Row[]>) {
  try {
    localStorage.setItem(KEY(m), JSON.stringify(v));
  } catch {
    /* sin almacenamiento: los registros viven solo en pantalla */
  }
}

const money = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;
const num = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

function cell(c: Column, v: string | number | undefined) {
  if (v === undefined || v === "") return "—";
  if (c.kind === "money") return money(Number(v));
  if (c.kind === "num") return num(Number(v));
  if (c.kind === "date") return fmtDate(String(v));
  if (c.kind === "chip") return <span className="chip">{v}</span>;
  return v;
}

function Bars(props: { title: string; unit: string; labels: string[]; values: number[] }) {
  const max = Math.max(...props.values, 1);
  return (
    <article className="card">
      <CardHead
        title={props.title}
        icon={<span aria-hidden="true">▮</span>}
        sub="Datos de ejemplo"
      />
      <div className="bars" role="img" aria-label={props.title}>
        {props.values.map((v, i) => (
          <div key={props.labels[i]} className="bar-col">
            <span className="bar-val">{num(v)}</span>
            <span className="bar" style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
            <span className="bar-lab">{props.labels[i]}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function ModuleProto({ module }: { module: ModuleKey }) {
  const def = PROTO[module];
  const m = moduleByKey(module);
  const { notify } = useApp();
  const [extra, setExtra] = useState<Record<string, Row[]>>(() => load(module));
  const [tab, setTab] = useState(def?.lists[0]?.key ?? "");
  const [action, setAction] = useState<Action | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  if (!def) return null;
  const Icon = m.icon;

  const rowsOf = (key: string): Row[] => [
    ...(extra[key] ?? []),
    ...(def.lists.find((l) => l.key === key)?.rows ?? []),
  ];

  function kpiValue(k: KpiDef): string {
    if (k.value) return k.value;
    let n = 0;
    if (k.count) n = rowsOf(k.count).length;
    if (k.sum) {
      const { list, field, where } = k.sum;
      n = rowsOf(list)
        .filter((r) => !where || r[where[0]] === where[1])
        .reduce((a, r) => a + (Number(r[field]) || 0), 0);
    }
    return k.money ? money(n) : `${num(n)}${k.unit ? ` ${k.unit}` : ""}`;
  }

  function run(a: Action) {
    if (a.view) {
      setTab(a.view);
      return;
    }
    if (a.toast) {
      notify(a.toast, "info");
      return;
    }
    setAction(a);
    ref.current?.showModal();
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!action?.list) return;
    const fd = new FormData(e.currentTarget);
    const row: Row = { ...(action.defaults ?? {}) };
    for (const f of action.fields ?? []) {
      const raw = String(fd.get(f.name) ?? "").trim();
      row[f.name] = f.type === "number" ? Number(raw) : raw;
    }
    const list = action.list;
    const next = { ...extra, [list]: [row, ...(extra[list] ?? [])] };
    setExtra(next);
    save(module, next);
    setTab(list);
    ref.current?.close();
    notify("Registro agregado (prototipo, guardado en este navegador).", "ok");
  }

  const active = def.lists.find((l) => l.key === tab) ?? def.lists[0];

  return (
    <section className="page">
      <PageHead
        kicker={m.label}
        icon={<Icon size={30} aria-hidden="true" />}
        title={m.title ?? m.label}
        {...(m.lead ? { lead: m.lead } : {})}
        actions={def.actions.map((a, i) => (
          <button
            key={a.label}
            type="button"
            className={i === 0 ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => run(a)}
          >
            {a.label}
          </button>
        ))}
      />
      <div className="banner banner-info">
        <span>
          <strong>Prototipo con datos de ejemplo.</strong> Lo que registre aquí se guarda solo en
          este navegador y todavía no se sincroniza con el servidor.
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setExtra({});
            save(module, {});
            notify("Se restablecieron los datos de ejemplo.", "info");
          }}
        >
          <RotateCcw size={14} aria-hidden="true" /> Restablecer
        </button>
      </div>

      <div className="kpi-row">
        {def.kpis.map((k) => (
          <Kpi
            key={k.label}
            tone={k.tone}
            icon={<Icon size={20} aria-hidden="true" />}
            label={k.label}
            value={kpiValue(k)}
            meta={k.meta}
          />
        ))}
      </div>

      {def.chart && <Bars {...def.chart} />}

      <article className="card">
        <div className="seg-row proto-tabs" role="tablist">
          {def.lists.map((l) => (
            <button
              key={l.key}
              type="button"
              role="tab"
              aria-selected={l.key === active?.key}
              className={l.key === active?.key ? "seg-opt on" : "seg-opt"}
              onClick={() => setTab(l.key)}
            >
              {l.title}
              <small> {rowsOf(l.key).length}</small>
            </button>
          ))}
        </div>
        {active && (
          <>
            <p className="hint">{active.sub}</p>
            <div className="ptable-wrap">
              <table className="ptable">
                <thead>
                  <tr>
                    {active.columns.map((c) => (
                      <th key={c.key} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsOf(active.key).map((r, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: filas de ejemplo sin identificador
                    <tr key={i}>
                      {active.columns.map((c) => (
                        <td key={c.key} data-label={c.label}>
                          {cell(c, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <dialog ref={ref} className="dialog dialog-form" aria-labelledby="proto-title">
        <form onSubmit={submit}>
          <header className="dialog-head">
            <button
              type="button"
              className="icon-btn"
              aria-label="Cerrar"
              onClick={() => ref.current?.close()}
            >
              ✕
            </button>
            <h2 id="proto-title">{action?.title ?? action?.label}</h2>
          </header>
          <div className="dialog-body">
            <section className="fsec">
              {action?.fields?.map((f) => (
                <label key={f.name} htmlFor={`pf-${f.name}`}>
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      id={`pf-${f.name}`}
                      name={f.name}
                      required
                      defaultValue={f.options?.[0]}
                    >
                      {f.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`pf-${f.name}`}
                      name={f.name}
                      required
                      type={f.type}
                      step={f.type === "number" ? "any" : undefined}
                      min={f.type === "number" ? 0 : undefined}
                      defaultValue={f.type === "date" ? today() : undefined}
                      placeholder={f.placeholder}
                      autoComplete="off"
                    />
                  )}
                </label>
              ))}
            </section>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
