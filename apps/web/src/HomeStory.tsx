import {
  Baby,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
  Milk,
  PawPrint,
  RefreshCw,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { type AlertItem, AlertsSheet } from "./Alerts";
import { moneyM } from "./kit";
import { num } from "./labels";
import type { HomeStats } from "./lib/homeStats";
import { plural, storySummary } from "./lib/storySummary";
import type { ModuleKey } from "./modules";

/**
 * Inicio del propietario contado como una historia corta del día, en el orden en que una
 * persona lo piensa: qué hago primero, cómo va mi finca, qué pasó hoy y qué tiempo hace.
 * Cada capítulo es una frase en palabras sencillas con una sola cifra grande y un color de
 * semáforo; el detalle vive en cada módulo, a un toque.
 */

type State = "ok" | "warn" | "bad" | "none";

export interface StoryAction {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
}

export interface HomeStoryProps {
  kicker: string;
  dateText: string;
  inv: { total: number; bovino: number; bufalino: number } | null;
  stats: HomeStats | null;
  /** null si el rol no ve la economía. */
  money: { count: number; balance: number } | null;
  alerts: AlertItem[];
  actions: StoryAction[];
  pending: number;
  syncing: boolean;
  onSync(): void;
  onModule(m: ModuleKey): void;
  /** Clima compacto. */
  weather: ReactNode;
  /** Asistente compacto. */
  assistant: ReactNode;
  /** Lo que no es del día a día: diagnóstico, noticias, dispositivo… */
  more: ReactNode;
}

function Chapter(props: { n: number; title: string; children: ReactNode; className?: string }) {
  return (
    <section
      className={`story-ch ${props.className ?? ""}`}
      aria-labelledby={`story-ch-${props.n}`}
    >
      <h2 id={`story-ch-${props.n}`} className="story-h">
        <span className="story-n" aria-hidden="true">
          {props.n}
        </span>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

const STATE_LABEL: Record<State, string> = {
  ok: "Bien",
  warn: "Atención",
  bad: "Urgente",
  none: "",
};

function Row(props: {
  icon: LucideIcon;
  tone: "verde" | "azul" | "ambar" | "violeta";
  kicker: string;
  title: ReactNode;
  sub?: string;
  state: State;
  badge?: string;
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <li>
      <button type="button" className="story-row" onClick={props.onClick}>
        <span className={`sr-ic sr-${props.tone}`} aria-hidden="true">
          <Icon size={26} />
        </span>
        <span className="sr-text">
          <small>{props.kicker}</small>
          <strong>{props.title}</strong>
          {props.sub && <span className="sr-sub">{props.sub}</span>}
        </span>
        {props.state !== "none" && (
          <span className={`sr-state st-${props.state}`}>
            <span className="sr-dot" aria-hidden="true" />
            {props.badge ?? STATE_LABEL[props.state]}
          </span>
        )}
        <ChevronRight size={20} className="sr-go" aria-hidden="true" />
      </button>
    </li>
  );
}

const big = (v: string) => <b className="sr-num">{v}</b>;

export function HomeStory(p: HomeStoryProps) {
  const [sheet, setSheet] = useState(false);
  const [more, setMore] = useState(false);

  const ordered = [
    ...p.alerts.filter((a) => a.tone === "error"),
    ...p.alerts.filter((a) => a.tone === "warn"),
    ...p.alerts.filter((a) => a.tone === "info"),
  ];
  const top = ordered[0] ?? null;
  const urgent = p.alerts.filter((a) => a.tone !== "info").length;
  const emptyHerd = p.inv !== null && p.inv.total === 0;
  const summary = storySummary(p);
  const s = p.stats;
  const trend = s?.milkTrend ?? null;
  // Capítulos en ámbar: la leche cae fuerte, hay vacas por palpar o el mes va en contra.
  const watch =
    Number(trend != null && trend < -10) +
    Number((s?.toPalpate ?? 0) > 0) +
    Number(p.money != null && p.money.count > 0 && p.money.balance < 0);

  const title = emptyHerd
    ? "Empecemos con su finca"
    : urgent > 0
      ? `Hoy hay ${urgent === 1 ? "una cosa" : `${urgent} cosas`} por revisar`
      : watch > 0
        ? "Su finca va bien, con algo por mirar"
        : "Hoy su finca va bien";

  return (
    <section className="page page-home page-story">
      <header className="story-hero">
        <p className="story-kicker">{p.kicker}</p>
        <h1>{title}</h1>
        {summary && <p className="story-summary">{summary}</p>}
        <p className="story-date">{p.dateText}</p>
      </header>

      <Chapter n={1} title="Lo primero">
        {top ? (
          <article className={`story-first sf-${top.tone}`}>
            <span className="sf-ic" aria-hidden="true">
              {top.icon}
            </span>
            <div className="sf-text">
              <strong>{top.title}</strong>
              <p>{top.text}</p>
            </div>
            <div className="sf-actions">
              {top.go && (
                <button type="button" className="btn btn-primary" onClick={top.go}>
                  {top.tone === "error" ? "Resolver ahora" : "Revisar ahora"}
                </button>
              )}
              {ordered.length > 1 && (
                <button type="button" className="btn btn-ghost" onClick={() => setSheet(true)}>
                  Ver{" "}
                  {ordered.length - 1 === 1
                    ? "el otro aviso"
                    : `los otros ${ordered.length - 1} avisos`}
                </button>
              )}
            </div>
          </article>
        ) : (
          <article className="story-first sf-ok">
            <span className="sf-ic" aria-hidden="true">
              <CheckCircle2 size={26} />
            </span>
            <div className="sf-text">
              <strong>No hay nada urgente</strong>
              <p>Puede seguir con su día. Si algo cambia, se lo contamos aquí y en la campana.</p>
            </div>
          </article>
        )}
      </Chapter>

      <Chapter n={2} title="Cómo va su finca">
        <ul className="story-rows">
          <Row
            icon={PawPrint}
            tone="verde"
            kicker="Sus animales"
            title={
              p.inv ? (
                p.inv.total > 0 ? (
                  <>
                    Tiene {big(num(p.inv.total))} {p.inv.total === 1 ? "animal" : "animales"}
                  </>
                ) : (
                  "Aún no ha registrado animales"
                )
              ) : (
                "Contando…"
              )
            }
            sub={
              p.inv && p.inv.total > 0
                ? p.inv.bufalino > 0 && p.inv.bovino > 0
                  ? `${plural(p.inv.bovino, "bovino", "bovinos")} y ${plural(p.inv.bufalino, "búfalo", "búfalos")}`
                  : p.inv.bufalino > 0
                    ? "Todos búfalos"
                    : "Todos bovinos"
                : "Toque aquí para registrar el primero"
            }
            state="none"
            onClick={() => p.onModule("animales")}
          />
          <Row
            icon={Milk}
            tone="azul"
            kicker="La leche"
            title={
              s && s.milk7 > 0 ? (
                <>Esta semana ordeñó {big(`${num(Math.round(s.milk7))} L`)}</>
              ) : (
                "Esta semana no hay ordeños anotados"
              )
            }
            sub={
              s && s.milk7 > 0
                ? `Unos ${num(Math.round(s.milk7 / 7))} litros al día${
                    trend == null
                      ? ""
                      : Math.abs(trend) <= 2
                        ? ", casi igual que la semana pasada"
                        : trend > 0
                          ? `, ${trend} % más que la semana pasada`
                          : `, ${Math.abs(trend)} % menos que la semana pasada`
                  }`
                : "Toque aquí para anotar el ordeño"
            }
            state={!s || s.milk7 === 0 ? "none" : trend != null && trend < -10 ? "warn" : "ok"}
            badge={
              trend == null || Math.abs(trend) <= 2 ? "Estable" : trend > 0 ? "Subiendo" : "Bajando"
            }
            onClick={() => p.onModule("produccion")}
          />
          <Row
            icon={Baby}
            tone="ambar"
            kicker="Las crías que vienen"
            title={
              s?.hasRepro ? (
                <>
                  {big(num(s.pregnant))} {s.pregnant === 1 ? "vaca preñada" : "vacas preñadas"}
                </>
              ) : (
                "Aún no hay servicios anotados"
              )
            }
            sub={
              s?.hasRepro
                ? `De ${plural(s.females, "hembra", "hembras")}${
                    s.toPalpate > 0
                      ? `. ${plural(s.toPalpate, "espera", "esperan")} que el veterinario la${s.toPalpate === 1 ? "" : "s"} palpe`
                      : ""
                  }`
                : "Toque aquí para anotar celos, servicios y partos"
            }
            state={!s?.hasRepro ? "none" : s.toPalpate > 0 ? "warn" : "ok"}
            badge={s && s.toPalpate > 0 ? `${num(s.toPalpate)} por palpar` : "Al día"}
            onClick={() => p.onModule("reproduccion")}
          />
          {p.money && (
            <Row
              icon={Banknote}
              tone="violeta"
              kicker="La plata del mes"
              title={
                p.money.count === 0 ? (
                  "Aún no hay gastos ni ventas este mes"
                ) : p.money.balance >= 0 ? (
                  <>Va ganando {big(moneyM(p.money.balance))}</>
                ) : (
                  <>Va perdiendo {big(moneyM(Math.abs(p.money.balance)))}</>
                )
              }
              sub={
                p.money.count === 0
                  ? "Toque aquí para anotar lo que entra y lo que sale"
                  : `Según ${plural(p.money.count, "movimiento anotado", "movimientos anotados")}`
              }
              state={p.money.count === 0 ? "none" : p.money.balance >= 0 ? "ok" : "warn"}
              badge={p.money.balance >= 0 ? "A favor" : "En contra"}
              onClick={() => p.onModule("economia")}
            />
          )}
        </ul>
      </Chapter>

      {p.actions.length > 0 && (
        <Chapter n={3} title="¿Qué pasó hoy en la finca?">
          <p className="story-lead">Toque lo que hizo y anótelo en un momento.</p>
          <div className="story-acts">
            {p.actions.map((a) => (
              <button
                key={a.key}
                type="button"
                className="story-act"
                onClick={() => p.onModule(a.key)}
              >
                <a.icon size={26} aria-hidden="true" />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
          {p.pending > 0 && (
            <p className="story-sync">
              <span>
                {p.pending === 1
                  ? "1 anotación está guardada en el celular y falta enviarla."
                  : `${num(p.pending)} anotaciones están guardadas en el celular y falta enviarlas.`}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={p.syncing}
                onClick={p.onSync}
              >
                <RefreshCw size={16} aria-hidden="true" className={p.syncing ? "spin" : ""} />
                {p.syncing ? "Enviando…" : "Enviar ahora"}
              </button>
            </p>
          )}
        </Chapter>
      )}

      <Chapter n={p.actions.length > 0 ? 4 : 3} title="El tiempo y su ganado">
        {p.weather}
      </Chapter>

      {p.assistant}

      <button
        type="button"
        className="story-more-btn"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
      >
        {more ? "Mostrar menos" : "Más de su finca: diagnóstico, noticias y este celular"}
        <ChevronDown size={20} aria-hidden="true" className={more ? "rot" : ""} />
      </button>
      {more && <div className="story-more">{p.more}</div>}

      {sheet && <AlertsSheet alerts={ordered} onClose={() => setSheet(false)} />}
    </section>
  );
}
