import { can } from "@ganaderia/domain";
import { Baby, Calendar, Droplets, Info, Milk, PiggyBank, TrendingUp } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFarms } from "./animals";
import { PageHead } from "./components";
import { MOV_SEED, type Mov, PARAMS, type Species } from "./herd";
import { type RealAnimal, useHerdData } from "./herdData";
import { Panel, Stat, Timeline, type Tone, moneyM, num, useStore } from "./kit";
import { todayLocal } from "./labels";
import {
  type MilkPoint,
  type MonthBirths,
  type Upcoming,
  type UpcomingKind,
  project,
} from "./lib/projection";
import { useApp } from "./state";

/**
 * Proyección: lo que probablemente viene en la finca —partos, secados, leche y plata— calculado
 * con lo que se ha registrado. Cada cifra dice que es una estimación y cómo se sacó.
 */

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const monthName = (m: string, long = false) =>
  (long ? MONTHS_LONG : MONTHS)[Number(m.slice(5, 7)) - 1] ?? m;
const liters = (n: number) => `${num(Math.round(n), 0)} L`;

/** Tope redondo del eje, cercano al dato para que la línea use el alto de la gráfica. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x) ?? 10;
  return step * p;
}

const UPCOMING: Record<UpcomingKind, { title: string; tone: Tone }> = {
  parto: { title: "Parto probable", tone: "verde" },
  secado: { title: "Secado", tone: "azul" },
  palpar: { title: "Palpar", tone: "ambar" },
  destete: { title: "Destete", tone: "violeta" },
};

export function ProyeccionScreen() {
  const { role } = useApp();
  const herd = useHerdData();
  const farms = useFarms();
  const canMoney = role !== null && can(role, "economy.read");
  const [movs] = useStore<Mov>("movs-eco", MOV_SEED);
  const today = todayLocal();

  const p = useMemo(() => {
    const farmOf = new Map(
      herd.real ? (herd.animals as RealAnimal[]).map((a) => [a.tag, a.farmId]) : [],
    );
    const speciesOf = new Map(herd.animals.map((a) => [a.tag, a.species]));
    return project({
      today,
      animals: herd.animals.map((a) => ({
        tag: a.tag,
        species: a.species,
        sex: a.sex,
        cat: a.cat,
        bornDays: a.born,
        milk: a.milk,
      })),
      events: herd.rep,
      milkHistory: herd.milkDays.map((d) => ({
        fecha: d.fecha,
        litros: Object.values(d.litros).reduce((s, v) => s + v, 0),
      })),
      rules: PARAMS,
      dryOffDays: herd.dryOffDays,
      weaningMonths: (tag) => {
        const farm = farms.find((f) => f.id === farmOf.get(tag));
        const sp = speciesOf.get(tag) as Species | undefined;
        return (sp && farm?.speciesSettings[sp]?.weaningMonths) ?? null;
      },
      ...(canMoney ? { money: movs } : {}),
    });
  }, [herd, farms, movs, canMoney, today]);

  const possible90 = Math.round(p.births.possible90);
  const items = upcomingItems(p.upcoming);
  const shown = items.slice(0, 14);

  return (
    <section className="page page-proj">
      <PageHead
        kicker="Proyección"
        icon={<TrendingUp size={30} aria-hidden="true" />}
        title="Lo que viene en la finca"
        lead="Partos, secados, leche y plata de los próximos meses, calculados con lo que se ha registrado. Son estimaciones: se ajustan solas a medida que anota."
      />
      {!herd.real && <p className="hint proj-demo">Con el hato de ejemplo.</p>}

      <div className="kit-stats">
        <Stat
          tone="azul"
          icon={<Milk size={18} />}
          label="Leche, próximos 30 días"
          value={p.milk.perDayNow > 0 ? liters(p.milk.next30) : "—"}
          meta={
            p.milk.perDayNow > 0
              ? `Entre ${liters(p.milk.next30Min)} y ${liters(p.milk.next30Max)} · hoy ${liters(p.milk.perDayNow)}/día`
              : "Sin ordeños en la última semana"
          }
        />
        <Stat
          tone="verde"
          icon={<Baby size={18} />}
          label="Partos en 90 días"
          value={String(p.births.next90)}
          meta={
            possible90 > 0
              ? `y unos ${possible90} posibles de las servidas`
              : "Con preñez confirmada"
          }
        />
        <Stat
          tone="ambar"
          icon={<Droplets size={18} />}
          label="Secados en 90 días"
          value={String(p.dryOffs90)}
          meta="Vacas que dejan el ordeño"
        />
        <Stat
          tone="violeta"
          icon={<Calendar size={18} />}
          label="Crías en 6 meses"
          value={String(p.calves6m)}
          meta="Si no hay pérdidas"
        />
        {p.money && (
          <Stat
            tone={p.money.monthClose >= 0 ? "verde" : "rojo"}
            icon={<PiggyBank size={18} />}
            label="Plata al cierre del mes"
            value={moneyM(p.money.monthClose)}
            meta={`Va ${moneyM(p.money.soFar)} · próximos 3 meses ${moneyM(p.money.next3Months)}`}
          />
        )}
      </div>

      <div className="kit-grid2">
        <Panel
          title="Leche por día"
          sub={
            p.milk.perDayNow > 0
              ? "Lo registrado en las últimas semanas y lo estimado para los próximos 90 días"
              : "Sin ordeños en la última semana: no hay con qué proyectar"
          }
          icon={<Milk size={20} />}
        >
          {p.milk.perDayNow > 0 && (
            <>
              <MilkChart series={p.milk.series} />
              <details className="proj-table">
                <summary>Ver la tabla</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Mes</th>
                      <th scope="col">Litros estimados</th>
                      <th scope="col">Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.milk.months.map((m) => (
                      <tr key={m.month}>
                        <th scope="row">{monthName(m.month, true)}</th>
                        <td>{liters(m.litros)}</td>
                        <td>
                          {liters(m.min)} a {liters(m.max)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </Panel>
        <Panel
          title="Partos por mes"
          sub="Confirmados por diagnóstico y posibles de las vacas servidas"
          icon={<Baby size={20} />}
        >
          <BirthsChart months={p.births.months} />
          <details className="proj-table">
            <summary>Ver la tabla</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">Confirmados</th>
                  <th scope="col">Posibles</th>
                </tr>
              </thead>
              <tbody>
                {p.births.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row">
                      {monthName(m.month, true)} {m.month.slice(0, 4)}
                    </th>
                    <td>
                      {m.confirmed}
                      {m.tags.length > 0
                        ? ` (${m.tags.slice(0, 8).join(", ")}${m.tags.length > 8 ? "…" : ""})`
                        : ""}
                    </td>
                    <td>{m.possible >= 0.5 ? `~${Math.round(m.possible)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Panel>
      </div>

      <div className="kit-grid2">
        <Panel
          title="Próximos 30 días"
          sub="Lo que toca hacer, por fecha"
          icon={<Calendar size={20} />}
        >
          {shown.length === 0 ? (
            <p className="hint">Nada programado en los próximos 30 días.</p>
          ) : (
            <Timeline items={shown} />
          )}
          {items.length > shown.length && (
            <p className="hint">Y {items.length - shown.length} más en el mes.</p>
          )}
        </Panel>
        <Panel title="Cómo se calcula" icon={<Info size={20} />}>
          <ul className="proj-how">
            <li>
              <b>Partos:</b> fecha del servicio más la gestación de la especie (
              {PARAMS.bovino.gestacion} días en bovinos, {PARAMS.bufalino.gestacion} en búfalas),
              solo con preñez confirmada. Las servidas sin diagnóstico cuentan como posibles con una
              tasa de preñez del {Math.round(p.births.conceptionRate * 100)} %
              {p.births.rateFromFarm
                ? ", la de sus diagnósticos del último año."
                : " (de referencia: aún hay pocos diagnósticos)."}
            </li>
            <li>
              <b>Leche:</b> cada vaca sigue con su promedio de la última semana, baja cerca de 7 %
              al mes después del pico y deja de dar al secarse. Las que paren entran con lo que dan
              las recién paridas de la finca. El rango se abre a medida que se mira más lejos.
            </li>
            <li>
              <b>Secados:</b> {PARAMS.bovino.secarAntes} días antes del parto o, en las vacías, a
              los días de lactancia que definió la finca.
            </li>
            {p.money && (
              <li>
                <b>Plata:</b> el saldo del mes más lo que la finca dejó por día en los últimos 90
                días.
              </li>
            )}
            <li>No cuenta ventas, muertes ni compras futuras.</li>
          </ul>
        </Panel>
      </div>
    </section>
  );
}

const LATE_GROUP: Record<UpcomingKind, [string, string]> = {
  parto: ["parto atrasado, sin registrar", "partos atrasados, sin registrar"],
  palpar: ["palpación atrasada", "palpaciones atrasadas"],
  secado: ["secado atrasado", "secados atrasados"],
  destete: ["destete atrasado", "destetes atrasados"],
};

/**
 * Lo atrasado va primero y agrupado (una línea por tipo, con los animales); después lo que viene,
 * por fecha. Así lo pendiente no tapa lo próximo.
 */
function upcomingItems(list: Upcoming[]) {
  const late = new Map<UpcomingKind, Upcoming[]>();
  for (const u of list.filter((x) => x.late)) late.set(u.kind, [...(late.get(u.kind) ?? []), u]);
  const groups = [...late.entries()].map(([kind, us]) => {
    const [one, many] = LATE_GROUP[kind];
    const tags = us.map((u) => u.tag);
    return {
      date: us[0]?.fecha ?? "",
      title:
        us.length === 1
          ? `${one[0]?.toUpperCase()}${one.slice(1)} · ${tags[0]}`
          : `${us.length} ${many}`,
      ...(us.length > 1
        ? { text: `${tags.slice(0, 6).join(", ")}${tags.length > 6 ? "…" : ""}` }
        : {}),
      tone: "rojo" as Tone,
    };
  });
  const next = list
    .filter((x) => !x.late)
    .map((u) => ({
      date: u.fecha,
      title: `${UPCOMING[u.kind].title} · ${u.tag}`,
      tone: UPCOMING[u.kind].tone,
    }));
  return [...groups, ...next];
}

/* ───────────── Leche: registrado + estimado con su rango ───────────── */

/** Ancho real de la gráfica: se dibuja a su tamaño para que el texto no se encoja en el celular. */
function useWidth(ref: RefObject<HTMLDivElement | null>, fallback = 640): number {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setW(Math.max(280, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const H = 230;
const PAD = { l: 52, r: 16, t: 14, b: 30 };

function MilkChart({ series }: { series: MilkPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const n = series.length;
  const todayIdx = series.findIndex((s) => s.estimado) - 1;
  const top = niceMax(Math.max(...series.map((s) => s.max ?? s.litros)) * 1.05);
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const path = (pts: { i: number; v: number }[]) =>
    pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");

  const actual = series.flatMap((s, i) => (s.estimado ? [] : [{ i, v: s.litros }]));
  const est = series.flatMap((s, i) => (s.estimado ? [{ i, v: s.litros }] : []));
  const lastActual = actual.at(-1);
  const estLine = path([...(lastActual ? [lastActual] : []), ...est]);
  const band =
    est.length > 0
      ? `${path(est.map(({ i }) => ({ i, v: series[i]?.max ?? 0 })))} ${est
          .slice()
          .reverse()
          .map(({ i }) => `L${x(i).toFixed(1)} ${y(series[i]?.min ?? 0).toFixed(1)}`)
          .join(" ")} Z`
      : "";
  const ticks = [0, top / 2, top];
  // Fechas del eje sin pisarse: «Hoy» primero; las demás solo si quedan a distancia.
  const xTicks: number[] = [];
  for (const i of [todayIdx, n - 1, 0, todayIdx + 30, todayIdx + 60]) {
    if (i < 0 || i >= n || xTicks.some((t) => Math.abs(x(t) - x(i)) < 48)) continue;
    xTicks.push(i);
  }
  const last = series[n - 1];

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 7 : 1;
    setHover((h) =>
      Math.min(n - 1, Math.max(0, (h ?? todayIdx) + (e.key === "ArrowRight" ? step : -step))),
    );
  };
  const h = hover !== null ? series[hover] : null;

  return (
    <div
      ref={box}
      className="proj-chart"
      // Se recorre día por día con las flechas, como un deslizador sobre las fechas.
      role="slider"
      tabIndex={0}
      aria-label="Leche por día. Use las flechas para recorrer los días."
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={hover ?? Math.max(0, todayIdx)}
      aria-valuetext={tipText(series[hover ?? Math.max(0, todayIdx)])}
      onPointerMove={pick}
      onPointerLeave={() => setHover(null)}
      onFocus={() => setHover((v) => v ?? todayIdx)}
      onBlur={() => setHover(null)}
      onKeyDown={key}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Hoy ${liters(series[todayIdx]?.litros ?? 0)} por día; en 90 días cerca de ${liters(last?.litros ?? 0)} por día.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="pc-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="pc-axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">
              {num(t, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text
            key={i}
            className="pc-axis"
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          >
            {i === todayIdx ? "Hoy" : shortDate(series[i]?.fecha ?? "")}
          </text>
        ))}
        {band && <path className="pc-band" d={band} />}
        {todayIdx >= 0 && (
          <line className="pc-today" x1={x(todayIdx)} x2={x(todayIdx)} y1={PAD.t} y2={H - PAD.b} />
        )}
        <path className="pc-line" d={path(actual)} />
        <path className="pc-line pc-est" d={estLine} />
        {last && (
          <>
            <circle className="pc-dot" cx={x(n - 1)} cy={y(last.litros)} r={4} />
            <text className="pc-end" x={x(n - 1) - 8} y={y(last.litros) - 10} textAnchor="end">
              ~{liters(last.litros)}/día
            </text>
          </>
        )}
        {h && hover !== null && (
          <>
            <line className="pc-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />
            <circle className="pc-dot" cx={x(hover)} cy={y(h.litros)} r={4} />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pc-tip"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > n * 0.6 ? "-105%" : "5%"})`,
          }}
          aria-live="polite"
        >
          <strong>{liters(h.litros)}</strong>
          <span>
            {h.estimado
              ? `Estimado · entre ${liters(h.min ?? 0)} y ${liters(h.max ?? 0)}`
              : "Registrado"}
          </span>
          <small>{shortDate(h.fecha)}</small>
        </div>
      )}
    </div>
  );
}

/** Lo que dice la ayuda de un día, también para lectores de pantalla. */
function tipText(h: MilkPoint | undefined): string {
  if (!h) return "";
  return `${shortDate(h.fecha)}: ${liters(h.litros)}${h.estimado ? `, estimado entre ${liters(h.min ?? 0)} y ${liters(h.max ?? 0)}` : ", registrado"}`;
}

/* ───────────── Partos por mes: confirmados y posibles ───────────── */

const BH = 200;
const BPAD = { l: 8, r: 8, t: 22, b: 26 };

function BirthsChart({ months }: { months: MonthBirths[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = useWidth(box);
  const totals = months.map((m) => m.confirmed + m.possible);
  const top = Math.max(1, ...totals.map((t) => Math.ceil(t)));
  const slot = (W - BPAD.l - BPAD.r) / months.length;
  const bw = Math.min(24, slot * 0.5);
  const yh = (v: number) => (v / top) * (BH - BPAD.t - BPAD.b);
  const base = BH - BPAD.b;
  const hv = hover !== null ? months[hover] : null;

  return (
    <div className="proj-chart" ref={box}>
      <div className="pc-legend">
        <span>
          <i className="lg-conf" /> Confirmados
        </span>
        <span>
          <i className="lg-pos" /> Posibles
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${BH}`}
        role="img"
        aria-label="Partos por mes, confirmados y posibles."
      >
        <defs>
          <pattern
            id="pc-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="pc-pos-fill" />
            <line x1="0" y1="0" x2="0" y2="6" className="pc-hatch" />
          </pattern>
        </defs>
        <line className="pc-grid" x1={BPAD.l} x2={W - BPAD.r} y1={base} y2={base} />
        {months.map((m, i) => {
          const cx = BPAD.l + slot * i + slot / 2;
          const hc = yh(m.confirmed);
          const hp = yh(m.possible);
          const total = Math.round(m.confirmed + m.possible);
          const gap = hc > 0 && hp > 0 ? 2 : 0;
          return (
            <g
              key={m.month}
              className={hover === i ? "pc-col on" : "pc-col"}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <rect
                className="pc-hit"
                x={cx - slot / 2}
                y={BPAD.t - 18}
                width={slot}
                height={BH - BPAD.t}
              />
              {hc > 0 && (
                <Bar x={cx - bw / 2} y={base - hc} w={bw} h={hc} cls="pc-conf" round={hp === 0} />
              )}
              {hp > 0 && (
                <Bar x={cx - bw / 2} y={base - hc - gap - hp} w={bw} h={hp} cls="pc-pos" round />
              )}
              {total > 0 && (
                <text className="pc-cap" x={cx} y={base - hc - gap - hp - 6} textAnchor="middle">
                  {m.possible >= 0.5 ? `~${total}` : total}
                </text>
              )}
              <text className="pc-axis" x={cx} y={BH - 8} textAnchor="middle">
                {monthName(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
      {hv && hover !== null && (
        <div
          className="pc-tip"
          style={{
            left: `${((BPAD.l + slot * hover + slot / 2) / W) * 100}%`,
            transform: `translateX(${hover > months.length * 0.6 ? "-105%" : "5%"})`,
          }}
          aria-live="polite"
        >
          <strong>
            {hv.confirmed} confirmado{hv.confirmed === 1 ? "" : "s"}
          </strong>
          {hv.possible >= 0.5 && <span>y unos {Math.round(hv.possible)} posibles</span>}
          {hv.tags.length > 0 && (
            <small>
              {hv.tags.slice(0, 6).join(", ")}
              {hv.tags.length > 6 ? "…" : ""}
            </small>
          )}
          <small>
            {monthName(hv.month, true)} {hv.month.slice(0, 4)}
          </small>
        </div>
      )}
    </div>
  );
}

/** Columna con la punta redondeada (4 px) y la base recta. */
function Bar(props: { x: number; y: number; w: number; h: number; cls: string; round: boolean }) {
  const r = props.round ? Math.min(4, props.h, props.w / 2) : 0;
  const { x, y, w, h } = props;
  const d = `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`;
  return <path className={props.cls} d={d} />;
}
