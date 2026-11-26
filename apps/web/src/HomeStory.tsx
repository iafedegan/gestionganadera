import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  Banknote,
  Bell,
  type LucideIcon,
  Milk,
  PawPrint,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { type AlertItem, AlertsSheet } from "./Alerts";
import { CountUp } from "./components";
import { moneyM } from "./kit";
import { num } from "./labels";
import { type HomeStats, sparkPath } from "./lib/homeStats";
import type { ModuleKey } from "./modules";
import { haptic } from "./native";

/**
 * Inicio del propietario: un tablero pequeño que explica de un vistazo cómo va la finca.
 * Una barra de estado general (cuántas cosas van bien y cuántas piden revisión) y seis
 * recuadros —animales, leche, preñeces, plata, clima y avisos—, cada uno con una cifra,
 * una mini gráfica, una frase corta y un punto de semáforo. Lo demás vive en los módulos.
 */

export type DashState = "ok" | "warn" | "bad" | "none";
const STATE_TEXT: Record<DashState, string> = {
  ok: "va bien",
  warn: "para revisar",
  bad: "urgente",
  none: "",
};

export function DashTile(props: {
  icon: LucideIcon;
  tone: "verde" | "azul" | "ambar" | "violeta" | "rojo" | "sol";
  label: string;
  value: ReactNode;
  note: string;
  state: DashState;
  /** Mini gráfica entre la cifra y la frase. */
  viz?: ReactNode;
  loading?: boolean;
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      className={`dash-tile dt-${props.tone} dts-${props.state}${props.loading ? " dt-loading" : ""}`}
      onClick={() => {
        haptic(8);
        props.onClick();
      }}
    >
      <span className="dt-head">
        <span className="dt-ic" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="dt-label">{props.label}</span>
        {props.state !== "none" && (
          <span className={`dt-dot st-${props.state}`}>
            <span className="vh">{STATE_TEXT[props.state]}</span>
          </span>
        )}
      </span>
      <strong className="dt-value">{props.value}</strong>
      {props.viz}
      <span className="dt-note">{props.note}</span>
    </button>
  );
}

/** Línea de los últimos días con su área sombreada; se dibuja al aparecer. */
function Spark({ values }: { values: number[] }) {
  const id = useId();
  const line = sparkPath(values, 140, 34);
  if (!line) return null;
  return (
    <svg className="dt-spark" viewBox="0 0 140 34" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="dt-spark-area" d={`${line} L140 34 L0 34 Z`} fill={`url(#${id})`} />
      <path className="dt-spark-line" d={line} pathLength={1} />
    </svg>
  );
}

/** Barra de proporción (una o dos partes). */
function Meter({ parts }: { parts: { pct: number; tone: string }[] }) {
  return (
    <span className="dt-meter" aria-hidden="true">
      {parts.map((p) => (
        <i key={p.tone} className={`m-${p.tone}`} style={{ width: `${Math.max(p.pct, 2)}%` }} />
      ))}
    </span>
  );
}

export interface HomeStoryProps {
  kicker: string;
  dateText: string;
  inv: { total: number; bovino: number; bufalino: number } | null;
  stats: HomeStats | null;
  /** null si el rol no ve la economía. */
  money: { count: number; balance: number } | null;
  alerts: AlertItem[];
  onModule(m: ModuleKey): void;
  /** Recuadro del clima (FarmIntel en modo recuadro). */
  weather: ReactNode;
  /** Semáforo del clima de hoy, para contarlo en el resumen. */
  weatherState: DashState;
  onAsk(): void;
}

const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

export function HomeStory(p: HomeStoryProps) {
  const [sheet, setSheet] = useState(false);

  const ordered = [
    ...p.alerts.filter((a) => a.tone === "error"),
    ...p.alerts.filter((a) => a.tone === "warn"),
    ...p.alerts.filter((a) => a.tone === "info"),
  ];
  const s = p.stats;
  const inv = p.inv;
  const top = ordered[0];
  const trend = s?.milkTrend ?? null;
  const milkDown = trend != null && trend < -10;

  const milkState: DashState = !s || s.milk7 === 0 ? "none" : milkDown ? "warn" : "ok";
  const pregState: DashState = !s?.hasRepro ? "none" : s.toPalpate > 0 ? "warn" : "ok";
  const moneyState: DashState =
    !p.money || p.money.count === 0 ? "none" : p.money.balance >= 0 ? "ok" : "warn";
  const alertState: DashState =
    ordered.length === 0 ? "ok" : ordered.some((a) => a.tone === "error") ? "bad" : "warn";
  const states = [milkState, pregState, moneyState, p.weatherState, alertState].filter(
    (x) => x !== "none",
  );
  const ok = states.filter((x) => x === "ok").length;
  const warn = states.filter((x) => x === "warn").length;
  const bad = states.filter((x) => x === "bad").length;

  const emptyHerd = inv !== null && inv.total === 0;
  const title = emptyHerd
    ? "Empecemos con su finca"
    : alertState === "bad"
      ? "Hay un aviso urgente por resolver"
      : p.weatherState === "bad"
        ? "Calor extremo hoy: cuide al ganado"
        : warn > 0
          ? "Su finca va bien, con algo por mirar"
          : "Su finca va muy bien";

  const pregPct = s?.hasRepro && s.females > 0 ? Math.round((s.pregnant / s.females) * 100) : 0;
  const bovPct = inv && inv.total > 0 ? Math.round((inv.bovino / inv.total) * 100) : 0;

  return (
    <section className="page page-home page-dash">
      <header className="dash-head">
        <div className="dash-titles">
          <p className="dash-kicker">{p.kicker}</p>
          <h1>{title}</h1>
          <p className="dash-date">{p.dateText}</p>
        </div>
        <button
          type="button"
          className="dash-ask"
          aria-label="Preguntarle a su finca"
          onClick={() => {
            haptic(8);
            p.onAsk();
          }}
        >
          <Sparkles size={20} aria-hidden="true" />
          <span className="da-text">Preguntar</span>
        </button>
      </header>

      {states.length > 0 && (
        <div className="dash-health">
          <span className="dh-bar" aria-hidden="true">
            {ok > 0 && <i className="h-ok" style={{ flexGrow: ok }} />}
            {warn > 0 && <i className="h-warn" style={{ flexGrow: warn }} />}
            {bad > 0 && <i className="h-bad" style={{ flexGrow: bad }} />}
          </span>
          <p className="dh-text">
            <span className="dh-chip c-ok">
              <b>{ok}</b> van bien
            </span>
            {warn > 0 && (
              <span className="dh-chip c-warn">
                <b>{warn}</b> por revisar
              </span>
            )}
            {bad > 0 && (
              <span className="dh-chip c-bad">
                <b>{bad}</b> {bad === 1 ? "urgente" : "urgentes"}
              </span>
            )}
          </p>
        </div>
      )}

      <div className="dash-grid">
        <DashTile
          icon={PawPrint}
          tone="verde"
          label="Animales"
          value={inv ? <CountUp value={inv.total} /> : "…"}
          loading={!inv}
          viz={
            inv && inv.total > 0 && inv.bufalino > 0 && inv.bovino > 0 ? (
              <Meter
                parts={[
                  { pct: bovPct, tone: "verde" },
                  { pct: 100 - bovPct, tone: "oro" },
                ]}
              />
            ) : undefined
          }
          note={
            !inv
              ? "Contando…"
              : inv.total === 0
                ? "Registre el primero"
                : inv.bovino > 0 && inv.bufalino > 0
                  ? `${plural(inv.bovino, "bovino", "bovinos")} y ${plural(inv.bufalino, "búfalo", "búfalos")}`
                  : inv.bufalino > 0
                    ? "Todos búfalos"
                    : "Todos bovinos"
          }
          state="none"
          onClick={() => p.onModule("animales")}
        />
        <DashTile
          icon={Milk}
          tone="azul"
          label="Leche, 7 días"
          value={
            s && s.milk7 > 0 ? (
              <>
                <CountUp value={Math.round(s.milk7)} /> L
              </>
            ) : (
              "0 L"
            )
          }
          loading={!s}
          viz={s && s.milk7 > 0 ? <Spark values={s.milkDaily} /> : undefined}
          note={
            !s || s.milk7 === 0
              ? "Sin ordeños esta semana"
              : trend == null || Math.abs(trend) <= 2
                ? "Igual que la semana pasada"
                : trend > 0
                  ? `Subió ${trend} % esta semana`
                  : `Bajó ${Math.abs(trend)} % esta semana`
          }
          state={milkState}
          onClick={() => p.onModule("produccion")}
        />
        <DashTile
          icon={Baby}
          tone="ambar"
          label="Preñadas"
          value={s?.hasRepro ? <CountUp value={s.pregnant} /> : "0"}
          loading={!s}
          viz={
            s?.hasRepro ? (
              <span className="dt-meter-row">
                <Meter parts={[{ pct: pregPct, tone: "ambar" }]} />
                <small>{pregPct} %</small>
              </span>
            ) : undefined
          }
          note={
            !s?.hasRepro
              ? "Sin servicios anotados"
              : s.toPalpate > 0
                ? `${plural(s.toPalpate, "espera", "esperan")} palpación`
                : `De ${plural(s.females, "hembra", "hembras")}`
          }
          state={pregState}
          onClick={() => p.onModule("reproduccion")}
        />
        {p.money && (
          <DashTile
            icon={Banknote}
            tone="violeta"
            label="Plata del mes"
            value={
              p.money.count === 0 ? (
                "$ 0"
              ) : (
                <span className="dt-money">
                  {p.money.balance >= 0 ? (
                    <ArrowUpRight size={22} aria-hidden="true" className="up" />
                  ) : (
                    <ArrowDownRight size={22} aria-hidden="true" className="down" />
                  )}
                  {moneyM(Math.abs(p.money.balance))}
                </span>
              )
            }
            note={
              p.money.count === 0
                ? "Sin gastos ni ventas"
                : p.money.balance >= 0
                  ? "Va ganando este mes"
                  : "Va perdiendo este mes"
            }
            state={moneyState}
            onClick={() => p.onModule("economia")}
          />
        )}
        {p.weather}
        <DashTile
          icon={Bell}
          tone="rojo"
          label="Avisos"
          value={<CountUp value={ordered.length} />}
          note={top ? top.title : "Todo en orden"}
          state={alertState}
          onClick={() => (ordered.length ? setSheet(true) : undefined)}
        />
      </div>

      {sheet && <AlertsSheet alerts={ordered} onClose={() => setSheet(false)} />}
    </section>
  );
}
