import { Baby, Banknote, Bell, type LucideIcon, Milk, PawPrint, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type AlertItem, AlertsSheet } from "./Alerts";
import { moneyM } from "./kit";
import { num } from "./labels";
import type { HomeStats } from "./lib/homeStats";
import type { ModuleKey } from "./modules";

/**
 * Inicio del propietario: un tablero pequeño que explica de un vistazo cómo va la finca.
 * Seis recuadros —animales, leche, preñeces, plata, clima y avisos—, cada uno con una
 * cifra, una frase corta y un punto de semáforo. Todo lo demás vive en los módulos.
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
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <button type="button" className={`dash-tile dt-${props.tone}`} onClick={props.onClick}>
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
      <span className="dt-note">{props.note}</span>
    </button>
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
  const urgent = p.alerts.filter((a) => a.tone !== "info").length;
  const s = p.stats;
  const trend = s?.milkTrend ?? null;
  const milkDown = trend != null && trend < -10;
  const watch =
    Number(milkDown) +
    Number((s?.toPalpate ?? 0) > 0) +
    Number(p.money != null && p.money.count > 0 && p.money.balance < 0);
  const emptyHerd = p.inv !== null && p.inv.total === 0;

  const title = emptyHerd
    ? "Empecemos con su finca"
    : urgent > 0
      ? `Hay ${urgent === 1 ? "una cosa" : `${urgent} cosas`} por revisar`
      : watch > 0
        ? "Su finca va bien, con algo por mirar"
        : "Su finca va bien";

  const inv = p.inv;
  const top = ordered[0];

  return (
    <section className="page page-home page-dash">
      <header className="dash-head">
        <div>
          <p className="dash-kicker">{p.kicker}</p>
          <h1>{title}</h1>
          <p className="dash-date">{p.dateText}</p>
        </div>
        <button type="button" className="dash-ask" onClick={p.onAsk}>
          <Sparkles size={18} aria-hidden="true" />
          <span>Preguntar</span>
        </button>
      </header>

      <div className="dash-grid">
        <DashTile
          icon={PawPrint}
          tone="verde"
          label="Animales"
          value={inv ? num(inv.total) : "…"}
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
          value={s && s.milk7 > 0 ? `${num(Math.round(s.milk7))} L` : "0 L"}
          note={
            !s || s.milk7 === 0
              ? "Sin ordeños esta semana"
              : trend == null || Math.abs(trend) <= 2
                ? "Igual que la semana pasada"
                : trend > 0
                  ? `Subió ${trend} %`
                  : `Bajó ${Math.abs(trend)} %`
          }
          state={!s || s.milk7 === 0 ? "none" : milkDown ? "warn" : "ok"}
          onClick={() => p.onModule("produccion")}
        />
        <DashTile
          icon={Baby}
          tone="ambar"
          label="Preñadas"
          value={s?.hasRepro ? num(s.pregnant) : "0"}
          note={
            !s?.hasRepro
              ? "Sin servicios anotados"
              : s.toPalpate > 0
                ? `${plural(s.toPalpate, "espera", "esperan")} palpación`
                : `De ${plural(s.females, "hembra", "hembras")}`
          }
          state={!s?.hasRepro ? "none" : s.toPalpate > 0 ? "warn" : "ok"}
          onClick={() => p.onModule("reproduccion")}
        />
        {p.money && (
          <DashTile
            icon={Banknote}
            tone="violeta"
            label="Plata del mes"
            value={
              p.money.count === 0
                ? "$ 0"
                : `${p.money.balance < 0 ? "−" : "+"}${moneyM(Math.abs(p.money.balance))}`
            }
            note={
              p.money.count === 0
                ? "Sin gastos ni ventas"
                : p.money.balance >= 0
                  ? "Va ganando este mes"
                  : "Va perdiendo este mes"
            }
            state={p.money.count === 0 ? "none" : p.money.balance >= 0 ? "ok" : "warn"}
            onClick={() => p.onModule("economia")}
          />
        )}
        {p.weather}
        <DashTile
          icon={Bell}
          tone="rojo"
          label="Avisos"
          value={num(ordered.length)}
          note={top ? top.title : "Todo en orden"}
          state={
            ordered.length === 0 ? "ok" : ordered.some((a) => a.tone === "error") ? "bad" : "warn"
          }
          onClick={() => (ordered.length ? setSheet(true) : undefined)}
        />
      </div>

      {sheet && <AlertsSheet alerts={ordered} onClose={() => setSheet(false)} />}
    </section>
  );
}
