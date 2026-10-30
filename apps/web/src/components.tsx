import { type ReactNode, useEffect, useState } from "react";

export function PageHead(props: {
  /** Solo se muestra en celular, como etiqueta sobre el título. */
  kicker?: string;
  title: string;
  lead?: string;
  /** Ícono del encabezado (cuadro redondeado a la izquierda del título). */
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="ph-main">
        {props.icon && <span className="ph-icon">{props.icon}</span>}
        <div>
          {props.kicker && <p className="kicker">{props.kicker}</p>}
          <h1>{props.title}</h1>
          {props.lead && <p className="lead">{props.lead}</p>}
        </div>
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </header>
  );
}

/** Encabezado de tarjeta: ícono, título, subtítulo y una acción opcional a la derecha. */
export function CardHead(props: {
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <header className="ch">
      <span className="ch-icon">{props.icon}</span>
      <div className="ch-text">
        <h2>{props.title}</h2>
        {props.sub && <p>{props.sub}</p>}
      </div>
      {props.action && <div className="ch-action">{props.action}</div>}
    </header>
  );
}

const SPARK: Record<string, string> = {
  verde: "M0 34 C30 30 40 14 70 18 S110 28 140 8",
  azul: "M0 32 C20 28 40 30 60 20 S100 14 140 6",
  ambar: "M0 30 C25 24 45 26 70 16 S110 22 140 10",
  violeta: "M0 28 C25 30 45 18 70 20 S110 10 140 6",
};

/** Mosaico de resumen con ilustración, como en la pantalla de Inicio de referencia. */
export function Tile(props: {
  tone: "verde" | "azul" | "ambar" | "violeta";
  art: string;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  meta?: string | undefined;
  /** Módulo aún sin datos: se muestra una curva fantasma y la etiqueta «Pronto». */
  soon?: string;
  onGo?: () => void;
  children?: ReactNode;
}) {
  return (
    <article className={`tile tile-${props.tone}`}>
      <img className="tile-art" src={props.art} alt="" />
      <div className="tile-body">
        <p className="tile-label">{props.label}</p>
        <div className="tile-row">
          <span className="tile-icon">{props.icon}</span>
          <strong className={props.soon ? "tile-value muted" : "tile-value"}>{props.value}</strong>
        </div>
        {props.meta && <p className="tile-meta">{props.meta}</p>}
        {props.children}
        {props.soon && (
          <svg className="spark" viewBox="0 0 140 40" aria-hidden="true" focusable="false">
            <path d={SPARK[props.tone]} />
          </svg>
        )}
      </div>
      {props.soon ? (
        <span className="chip chip-soon tile-chip">{props.soon}</span>
      ) : (
        props.onGo && (
          <button
            type="button"
            className="tile-go"
            aria-label={`Ver ${props.label}`}
            onClick={props.onGo}
          >
            ›
          </button>
        )
      )}
    </article>
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

/** Número que sube hasta su valor (da vida a las cifras); sin movimiento si el usuario lo pide. */
export function CountUp({ value, ms = 900 }: { value: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      setN(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      setN(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{new Intl.NumberFormat("es-CO").format(n)}</>;
}
