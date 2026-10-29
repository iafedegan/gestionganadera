import type { ReactNode } from "react";

export function PageHead(props: {
  kicker: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="kicker">{props.kicker}</p>
        <h1>{props.title}</h1>
        {props.lead && <p className="lead">{props.lead}</p>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </header>
  );
}

export type Tone = "verde" | "azul" | "ambar" | "violeta";

export function Kpi(props: {
  tone: Tone;
  icon: ReactNode;
  label: string;
  value: string;
  meta: string;
  source?: string;
  soon?: string;
  children?: ReactNode;
}) {
  return (
    <article className={`kpi tone-${props.tone}`}>
      <div className="kpi-top">
        <span className="kpi-icon">{props.icon}</span>
        <span className="kpi-label">{props.label}</span>
      </div>
      <p className={props.soon ? "figure figure-muted" : "figure"}>{props.value}</p>
      <p className="kpi-meta">{props.meta}</p>
      {props.soon && <span className="chip chip-soon kpi-soon">Disponible en {props.soon}</span>}
      {props.children}
      {props.source && <p className="card-source">{props.source}</p>}
    </article>
  );
}
