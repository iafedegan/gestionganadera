import { Droplets, Milk, Scale, TestTube } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHead } from "./components";
import {
  GROWTH_REF,
  HERD,
  LACTATING,
  LACT_CURVE,
  PARAMS,
  QUALITY_SEED,
  REP_SEED,
  ageMonths,
  animalOf,
  milkHistory,
  repState,
} from "./herd";
import {
  type AlertItem,
  Alerts,
  Badge,
  BarChart,
  type Col,
  DataTable,
  Donut,
  FormDialog,
  LineChart,
  Panel,
  type SpeciesF,
  SpeciesFilter,
  Stat,
  Tabs,
  type Tone,
  ago,
  fmtDate,
  iso,
  moneyM,
  num,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "ordeno" | "lactancias" | "calidad" | "crecimiento" | "destino";
interface Ordeno {
  fecha: string;
  tag: string;
  litros: number;
  turno: string;
}
interface Q {
  fecha: string;
  muestra: string;
  especie: string;
  grasa: number;
  proteina: number;
  ccs: number;
  ufc: number;
  temp: number;
}
interface Peso {
  fecha: string;
  tag: string;
  peso: number;
  metodo: string;
}

const PRECIO = { bovino: 1980, bufalino: 3800 };
const interp = (xs: number[], ys: number[], x: number) => {
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1] as number;
    const x1 = xs[i] as number;
    if (x <= x1)
      return (
        (ys[i - 1] as number) + (((ys[i] as number) - (ys[i - 1] as number)) * (x - x0)) / (x1 - x0)
      );
  }
  return ys[ys.length - 1] as number;
};

const growth = HERD.filter((a) => a.lot === "Levante" || a.lot === "Crías");
const GROWTH_SEED: Peso[] = growth.map((a, i) => ({
  fecha: ago(3 + (i % 4)),
  tag: a.tag,
  peso: a.weight,
  metodo: i % 3 === 0 ? "Cinta" : "Báscula",
}));

export function ProduccionScreen() {
  const { notify } = useApp();
  const hist = useMemo(milkHistory, []);
  const [extra, addOrd, resetOrd] = useStore<Ordeno>("ord", []);
  const [quality, addQ, resetQ] = useStore<Q>("calidad", QUALITY_SEED);
  const [pesos, addPeso, resetPeso] = useStore<Peso>("pesos", GROWTH_SEED);
  const [tab, setTab] = useState<Tab>("panel");
  const [sp, setSp] = useState<SpeciesF>("todos");
  const [open, setOpen] = useState<"ordeno" | "calidad" | "peso" | null>(null);
  const [animal, setAnimal] = useState(LACTATING[0]?.tag ?? "");

  const sel = LACTATING.filter((a) => sp === "todos" || a.species === sp);
  const day = (i: number, filter?: (t: string) => boolean) => {
    const d = hist[i];
    if (!d) return 0;
    const base = Object.entries(d.litros)
      .filter(([t]) => (!filter || filter(t)) && sel.some((a) => a.tag === t))
      .reduce((a, [, v]) => a + v, 0);
    const more = extra
      .filter(
        (e) =>
          e.fecha === d.fecha && (!filter || filter(e.tag)) && sel.some((a) => a.tag === e.tag),
      )
      .reduce((a, e) => a + e.litros, 0);
    return base + more;
  };
  const last = hist.length - 1;
  const hoy = day(last);
  const sem = [0, 1, 2, 3, 4, 5, 6].reduce((a, k) => a + day(last - k), 0);
  const semPrev = [7, 8, 9, 10, 11, 12, 13].reduce((a, k) => a + day(last - k), 0);
  const delta = semPrev ? ((sem - semPrev) / semPrev) * 100 : 0;
  const mes = hist.reduce((_, __, i) => _ + day(i), 0);
  const porVaca = sel.length ? hoy / sel.length : 0;
  const isBuf = (t: string) => t.startsWith("BUF");

  const rows = sel.map((a) => {
    const h = hist.map((d) => d.litros[a.tag] ?? 0);
    const hoyL = h[last] ?? 0;
    const prom7 = h.slice(-8, -1).reduce((x, y) => x + y, 0) / 7;
    const rep = repState(a, REP_SEED);
    return {
      a,
      hoyL,
      prom7,
      cambio: prom7 ? ((hoyL - prom7) / prom7) * 100 : 0,
      del: rep.del,
      status: rep.status,
      proy: a.milk * 1.06 * PARAMS[a.species].lactanciaDias,
    };
  });
  const caidas = rows.filter((r) => r.cambio < -10);

  const labels = hist.map((d) =>
    new Date(`${d.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
  );
  const alerts: AlertItem[] = [
    ...caidas.map((r) => ({
      tone: "rojo" as Tone,
      title: `${r.a.tag} · baja ${num(Math.abs(r.cambio), 0)} % frente a su promedio`,
      text: "Revise mastitis (CMT), celo, estrés por calor, cambio de dieta o enfermedad metabólica.",
    })),
    ...quality
      .filter((q) => q.ccs > 300)
      .map((q) => ({
        tone: "ambar" as Tone,
        title: `${q.muestra} · células somáticas ${q.ccs} mil/mL`,
        text: "Por encima de lo recomendado: revise la rutina de ordeño y los casos subclínicos.",
      })),
    ...(delta < -5
      ? [
          {
            tone: "ambar" as Tone,
            title: `Producción semanal ${num(delta, 1)} %`,
            text: "Compare con pasturas, clima y número de vacas en ordeño.",
          },
        ]
      : []),
  ];

  const cols: Col<(typeof rows)[number]>[] = [
    {
      key: "t",
      label: "Animal",
      sort: (r) => r.a.tag,
      render: (r) => <b className="mono">{r.a.tag}</b>,
    },
    { key: "s", label: "Especie", render: (r) => PARAMS[r.a.species].label },
    { key: "h", label: "Hoy (L)", align: "right", sort: (r) => r.hoyL, render: (r) => num(r.hoyL) },
    {
      key: "p",
      label: "Prom. 7 días",
      align: "right",
      sort: (r) => r.prom7,
      render: (r) => num(r.prom7),
    },
    {
      key: "c",
      label: "Cambio",
      align: "right",
      sort: (r) => r.cambio,
      render: (r) => (
        <Badge tone={r.cambio < -10 ? "rojo" : r.cambio < -4 ? "ambar" : "verde"}>
          {r.cambio > 0 ? "+" : ""}
          {num(r.cambio, 0)} %
        </Badge>
      ),
    },
    {
      key: "d",
      label: "Días en leche",
      align: "right",
      sort: (r) => r.del ?? 0,
      render: (r) => r.del ?? "—",
    },
    {
      key: "y",
      label: "Proyección lactancia (L)",
      align: "right",
      sort: (r) => r.proy,
      render: (r) => num(r.proy, 0),
    },
  ];

  const top = [...rows].sort((a, b) => b.hoyL - a.hoyL).slice(0, 8);
  const delRows = rows.filter((r) => r.del !== null).sort((a, b) => (a.del ?? 0) - (b.del ?? 0));
  const cur = animalOf(animal);
  const curDel = cur ? (repState(cur, REP_SEED).del ?? 0) : 0;

  const bov = pesos.filter((p) => animalOf(p.tag)?.species === "bovino");
  const lastWeight = (tag: string) =>
    pesos.filter((p) => p.tag === tag).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
  const gRows = growth
    .filter((a) => sp === "todos" || a.species === sp)
    .map((a) => {
      const w = lastWeight(a.tag);
      const m = a.born / 30.4;
      const ref = interp(GROWTH_REF.months, GROWTH_REF[a.species], m);
      const wt = w?.peso ?? a.weight;
      const gdp = a.born > 0 ? ((wt - (a.species === "bovino" ? 38 : 35)) / a.born) * 1000 : 0;
      return { a, wt, m, ref, pct: (wt / ref) * 100, gdp, fecha: w?.fecha ?? ago(3) };
    });

  const dest = [
    { label: "Planta (bovina)", value: 62, tone: "azul" as Tone },
    { label: "Quesera (búfala)", value: 18, tone: "violeta" as Tone },
    { label: "Terneros", value: 9, tone: "verde" as Tone },
    { label: "Consumo en finca", value: 7, tone: "ambar" as Tone },
    { label: "Descartada", value: 4, tone: "rojo" as Tone },
  ];

  return (
    <section className="page">
      <PageHead
        kicker="Producción"
        icon={<Milk size={30} aria-hidden="true" />}
        title="Producción y crecimiento"
        lead="Leche por animal, lactancias, calidad y crecimiento de terneras, novillas y búfalas."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("ordeno")}>
              Registrar ordeño
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("calidad")}>
              Control de calidad
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("peso")}>
              Registrar peso
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <SpeciesFilter value={sp} onChange={setSp} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetOrd();
            resetQ();
            resetPeso();
            notify("Datos de ejemplo restablecidos.", "info");
          }}
        >
          Restablecer datos de ejemplo
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "panel", label: "Panel", badge: alerts.length },
          { key: "ordeno", label: "Ordeño por animal" },
          { key: "lactancias", label: "Lactancias" },
          { key: "calidad", label: "Calidad de la leche" },
          { key: "crecimiento", label: "Crecimiento" },
          { key: "destino", label: "Destino y ventas" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="azul"
              icon={<Milk size={18} />}
              label="Leche de hoy"
              value={`${num(hoy, 0)} L`}
              meta={`${sel.length} animales en ordeño`}
            />
            <Stat
              tone="verde"
              icon={<Droplets size={18} />}
              label="Promedio por animal"
              value={`${num(porVaca)} L`}
              meta="Litros por animal por día"
              goal={sp === "bufalino" ? "7 L" : "18 L"}
            />
            <Stat
              tone={delta >= 0 ? "verde" : "rojo"}
              label="Últimos 7 días"
              value={`${num(sem, 0)} L`}
              meta={`${delta >= 0 ? "+" : ""}${num(delta, 1)} % frente a la semana anterior`}
            />
            <Stat
              tone="violeta"
              label="Producción 21 días"
              value={`${num(mes, 0)} L`}
              meta={`≈ ${moneyM(hist.reduce((s, _, i) => s + day(i, (t) => !isBuf(t)) * PRECIO.bovino + day(i, isBuf) * PRECIO.bufalino, 0))} en ventas`}
            />
            <Stat
              tone="ambar"
              icon={<TestTube size={18} />}
              label="Grasa (último control)"
              value={`${num(quality[0]?.grasa ?? 0)} %`}
              meta="Tanque de bovinos"
            />
            <Stat
              tone="rojo"
              label="Animales con baja"
              value={caidas.length}
              meta="Más de 10 % bajo su promedio"
            />
          </div>
          <Panel
            title="Leche diaria"
            sub="Litros por día, últimos 21 días"
            icon={<Milk size={20} />}
            wide
          >
            <LineChart
              labels={labels.map((l, i) => (i % 3 === 0 ? l : ""))}
              series={[
                ...(sp !== "bufalino"
                  ? [
                      {
                        name: "Vacas",
                        tone: "azul" as Tone,
                        points: hist.map((_, i) => Math.round(day(i, (t) => !isBuf(t)) * 10) / 10),
                      },
                    ]
                  : []),
                ...(sp !== "bovino"
                  ? [
                      {
                        name: "Búfalas",
                        tone: "violeta" as Tone,
                        points: hist.map((_, i) => Math.round(day(i, isBuf) * 10) / 10),
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
          <div className="kit-grid2">
            <Panel title="Mayores productoras de hoy" sub="Litros del último ordeño">
              <BarChart
                labels={top.map((r) => r.a.tag.replace("BOV-", "B").replace("BUF-", "U"))}
                series={[
                  {
                    name: "Litros",
                    tone: "azul",
                    values: top.map((r) => Math.round(r.hoyL * 10) / 10),
                  },
                ]}
                height={190}
              />
            </Panel>
            <Panel title="Atención" sub="Cambios que merecen revisión">
              <Alerts items={alerts} empty="La producción está estable." />
            </Panel>
          </div>
        </>
      )}

      {tab === "ordeno" && (
        <Panel
          title="Ordeño por animal"
          sub="Hoy, promedio de 7 días y cambio. Una baja brusca suele anticipar un problema."
        >
          <DataTable cols={cols} rows={rows} search={(r) => r.a.tag} placeholder="Buscar animal…" />
        </Panel>
      )}

      {tab === "lactancias" && (
        <>
          <Panel
            title="Curva de lactancia de referencia"
            sub="Litros por día según el mes de lactancia; la búfala dura menos y produce menos, con más sólidos."
          >
            <LineChart
              labels={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]}
              series={[
                { name: "Vaca (305 días)", tone: "azul", points: LACT_CURVE.bovino },
                { name: "Búfala (270 días)", tone: "violeta", points: LACT_CURVE.bufalino },
              ]}
            />
            {cur &&
              (() => {
                const mes = Math.min(9, Math.floor(curDel / 30));
                const esperado = LACT_CURVE[cur.species][mes] ?? 0;
                const pct = esperado ? (cur.milk / esperado) * 100 : 0;
                return (
                  <div className={`kit-verdict ${pct >= 90 ? "ok" : "no"}`}>
                    <strong>
                      {cur.tag} · mes {mes + 1} de lactancia · {num(cur.milk)} L/día
                    </strong>
                    <span>
                      La curva de referencia espera {num(esperado)} L/día: va en {num(pct, 0)} % de
                      lo esperado.
                    </span>
                  </div>
                );
              })()}
            <div className="kf-grid">
              <label htmlFor="lc-a">
                Comparar animal
                <select id="lc-a" value={animal} onChange={(e) => setAnimal(e.target.value)}>
                  {LACTATING.map((a) => (
                    <option key={a.tag}>{a.tag}</option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>
          <Panel
            title="Lactancias en curso"
            sub="Proyección estimada a la duración típica de cada especie."
          >
            <DataTable
              cols={[
                {
                  key: "t",
                  label: "Animal",
                  sort: (r: (typeof delRows)[number]) => r.a.tag,
                  render: (r) => <b className="mono">{r.a.tag}</b>,
                },
                {
                  key: "d",
                  label: "Días en leche",
                  align: "right",
                  sort: (r) => r.del ?? 0,
                  render: (r) => r.del,
                },
                {
                  key: "l",
                  label: "Fase",
                  render: (r) =>
                    (r.del ?? 0) < 60 ? (
                      <Badge tone="azul">Pico</Badge>
                    ) : (r.del ?? 0) < 200 ? (
                      <Badge tone="verde">Media</Badge>
                    ) : (
                      <Badge tone="ambar">Final</Badge>
                    ),
                },
                {
                  key: "h",
                  label: "Hoy (L)",
                  align: "right",
                  sort: (r) => r.hoyL,
                  render: (r) => num(r.hoyL),
                },
                {
                  key: "y",
                  label: "Proyección (L)",
                  align: "right",
                  sort: (r) => r.proy,
                  render: (r) => num(r.proy, 0),
                },
                { key: "e", label: "Estado reproductivo", render: (r) => r.status },
              ]}
              rows={delRows}
            />
          </Panel>
        </>
      )}

      {tab === "calidad" && (
        <>
          <Panel
            title="Controles de calidad"
            sub="Verde dentro de lo esperado, ámbar por vigilar, rojo por corregir."
          >
            <DataTable
              cols={[
                {
                  key: "f",
                  label: "Fecha",
                  sort: (q: Q) => q.fecha,
                  render: (q) => fmtDate(q.fecha),
                },
                { key: "m", label: "Muestra", render: (q) => <b>{q.muestra}</b> },
                {
                  key: "g",
                  label: "Grasa",
                  align: "right",
                  render: (q) => (
                    <Badge
                      tone={
                        q.especie === "bufalino"
                          ? q.grasa >= 7
                            ? "verde"
                            : "ambar"
                          : q.grasa >= 3.5
                            ? "verde"
                            : "ambar"
                      }
                    >
                      {num(q.grasa)} %
                    </Badge>
                  ),
                },
                {
                  key: "p",
                  label: "Proteína",
                  align: "right",
                  render: (q) => (
                    <Badge
                      tone={
                        q.especie === "bufalino"
                          ? q.proteina >= 4
                            ? "verde"
                            : "ambar"
                          : q.proteina >= 3
                            ? "verde"
                            : "ambar"
                      }
                    >
                      {num(q.proteina)} %
                    </Badge>
                  ),
                },
                {
                  key: "c",
                  label: "Células (mil/mL)",
                  align: "right",
                  render: (q) => (
                    <Badge tone={q.ccs < 200 ? "verde" : q.ccs < 400 ? "ambar" : "rojo"}>
                      {q.ccs}
                    </Badge>
                  ),
                },
                {
                  key: "u",
                  label: "UFC (mil/mL)",
                  align: "right",
                  render: (q) => (
                    <Badge tone={q.ufc < 100 ? "verde" : q.ufc < 300 ? "ambar" : "rojo"}>
                      {q.ufc}
                    </Badge>
                  ),
                },
                {
                  key: "t",
                  label: "Temp. (°C)",
                  align: "right",
                  render: (q) => (
                    <Badge tone={q.temp <= 4 ? "verde" : "ambar"}>{num(q.temp)}</Badge>
                  ),
                },
              ]}
              rows={[...quality]
                .filter((q) => sp === "todos" || q.especie === sp)
                .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            />
          </Panel>
          <div className="kit-grid2">
            <Panel title="Grasa y proteína" sub="Tendencia de los controles">
              <LineChart
                labels={[...quality]
                  .filter((q) => q.especie === "bovino")
                  .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                  .map((q) => fmtDate(q.fecha))}
                series={[
                  {
                    name: "Grasa vaca",
                    tone: "azul",
                    points: [...quality]
                      .filter((q) => q.especie === "bovino")
                      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                      .map((q) => q.grasa),
                  },
                  {
                    name: "Proteína vaca",
                    tone: "verde",
                    points: [...quality]
                      .filter((q) => q.especie === "bovino")
                      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                      .map((q) => q.proteina),
                  },
                ]}
                height={180}
              />
            </Panel>
            <Panel
              title="Referencias por especie"
              sub="Valores típicos; confirme con su planta o quesera."
            >
              <ul className="kit-facts">
                <li>
                  <b>Vaca</b>: grasa 3,5–4,2 %, proteína 3,0–3,4 %, células menos de 200 mil/mL.
                </li>
                <li>
                  <b>Búfala</b>: grasa 7–8,5 %, proteína 4,0–4,6 %: por eso rinde más en quesos.
                </li>
                <li>
                  <b>Frío</b>: tanque a 4 °C o menos en las dos primeras horas.
                </li>
                <li>
                  <b>Mezcla</b>: no mezcle leche de bovinas y búfalas si vende por separado.
                </li>
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === "crecimiento" && (
        <>
          <Panel
            title="Crecimiento frente a la curva de referencia"
            sub="Peso por edad; una cría por debajo del 85 % de la referencia pide revisar nutrición y sanidad."
            icon={<Scale size={20} />}
          >
            <LineChart
              labels={GROWTH_REF.months.map((m) => `${m} m`)}
              series={[
                { name: "Referencia bovina", tone: "azul", points: GROWTH_REF.bovino },
                { name: "Referencia búfala", tone: "violeta", points: GROWTH_REF.bufalino },
              ]}
            />
          </Panel>
          <Panel
            title="Peso y ganancia por animal"
            sub="Ganancia diaria desde el nacimiento (estimada)."
          >
            <DataTable
              cols={[
                {
                  key: "t",
                  label: "Animal",
                  sort: (r: (typeof gRows)[number]) => r.a.tag,
                  render: (r) => <b className="mono">{r.a.tag}</b>,
                },
                { key: "c", label: "Categoría", render: (r) => r.a.cat },
                {
                  key: "e",
                  label: "Edad (meses)",
                  align: "right",
                  sort: (r) => r.m,
                  render: (r) => num(ageMonths(r.a), 0),
                },
                {
                  key: "w",
                  label: "Peso (kg)",
                  align: "right",
                  sort: (r) => r.wt,
                  render: (r) => num(r.wt, 0),
                },
                {
                  key: "r",
                  label: "Referencia (kg)",
                  align: "right",
                  render: (r) => num(r.ref, 0),
                },
                {
                  key: "p",
                  label: "% de la referencia",
                  align: "right",
                  sort: (r) => r.pct,
                  render: (r) => (
                    <Badge tone={r.pct >= 95 ? "verde" : r.pct >= 85 ? "ambar" : "rojo"}>
                      {num(r.pct, 0)} %
                    </Badge>
                  ),
                },
                {
                  key: "g",
                  label: "Ganancia (g/día)",
                  align: "right",
                  sort: (r) => r.gdp,
                  render: (r) => num(r.gdp, 0),
                },
                { key: "f", label: "Último pesaje", render: (r) => fmtDate(r.fecha) },
              ]}
              rows={gRows}
              search={(r) => r.a.tag}
            />
            {bov.length > 0 && <p className="hint">{pesos.length} pesajes registrados.</p>}
          </Panel>
        </>
      )}

      {tab === "destino" && (
        <div className="kit-grid2">
          <Panel title="Destino de la leche" sub="Porcentaje de los litros de los últimos 21 días">
            <Donut
              slices={dest}
              center={
                <>
                  <strong>{num(mes, 0)}</strong>
                  <small>litros</small>
                </>
              }
            />
          </Panel>
          <Panel title="Precios de referencia" sub="Pesos por litro, de ejemplo.">
            <ul className="kit-facts big">
              <li>
                <span>Leche bovina</span>
                <b>${PRECIO.bovino.toLocaleString("es-CO")} / L</b>
              </li>
              <li>
                <span>Leche de búfala</span>
                <b>${PRECIO.bufalino.toLocaleString("es-CO")} / L</b>
              </li>
              <li>
                <span>Ingreso estimado 21 días</span>
                <b>
                  {moneyM(
                    hist.reduce(
                      (s, _, i) =>
                        s +
                        day(i, (t) => !isBuf(t)) * PRECIO.bovino +
                        day(i, isBuf) * PRECIO.bufalino,
                      0,
                    ),
                  )}
                </b>
              </li>
            </ul>
            <p className="hint">Los ingresos reales se registran en Economía con su factura.</p>
          </Panel>
        </div>
      )}

      {open === "ordeno" && (
        <FormDialog
          open
          title="Registrar ordeño"
          fields={[
            { name: "tag", label: "Animal", type: "select", options: LACTATING.map((a) => a.tag) },
            { name: "fecha", label: "Fecha", type: "date", value: iso(today()) },
            { name: "turno", label: "Turno", type: "select", options: ["Mañana", "Tarde"] },
            { name: "litros", label: "Litros", type: "number" },
          ]}
          preview={(v) => {
            const a = animalOf(v.tag ?? "");
            const l = Number(v.litros);
            return a && l ? (
              <p className="hint">
                Promedio de {a.tag}: <b>{num(a.milk)} L/día</b>. Este ordeño equivale a{" "}
                <b>{num((l / (a.milk / 2)) * 100, 0)} %</b> de un turno normal.
              </p>
            ) : null;
          }}
          onSubmit={(v) => {
            addOrd({
              fecha: v.fecha ?? iso(today()),
              tag: v.tag ?? "",
              litros: Number(v.litros),
              turno: v.turno ?? "",
            });
            setOpen(null);
            notify("Ordeño registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "calidad" && (
        <FormDialog
          open
          title="Control de calidad"
          fields={[
            {
              name: "muestra",
              label: "Muestra",
              type: "select",
              options: ["Tanque bovinos", "Tanque búfalas"],
            },
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "grasa", label: "Grasa (%)", type: "number" },
            { name: "proteina", label: "Proteína (%)", type: "number" },
            { name: "ccs", label: "Células somáticas (mil/mL)", type: "number" },
            { name: "ufc", label: "UFC (mil/mL)", type: "number" },
            { name: "temp", label: "Temperatura (°C)", type: "number" },
          ]}
          onSubmit={(v) => {
            addQ({
              fecha: v.fecha ?? iso(today()),
              muestra: v.muestra ?? "",
              especie: v.muestra?.includes("búfalas") ? "bufalino" : "bovino",
              grasa: Number(v.grasa),
              proteina: Number(v.proteina),
              ccs: Number(v.ccs),
              ufc: Number(v.ufc),
              temp: Number(v.temp),
            });
            setOpen(null);
            notify("Control de calidad registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "peso" && (
        <FormDialog
          open
          title="Registrar peso"
          fields={[
            { name: "tag", label: "Animal", type: "select", options: growth.map((a) => a.tag) },
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "peso", label: "Peso (kg)", type: "number" },
            {
              name: "metodo",
              label: "Método",
              type: "select",
              options: ["Báscula", "Cinta", "Estimado"],
            },
          ]}
          preview={(v) => {
            const a = animalOf(v.tag ?? "");
            if (!a) return null;
            const ref = interp(GROWTH_REF.months, GROWTH_REF[a.species], a.born / 30.4);
            return (
              <p className="hint">
                Referencia a {num(a.born / 30.4, 0)} meses: <b>{num(ref, 0)} kg</b>.
              </p>
            );
          }}
          onSubmit={(v) => {
            addPeso({
              fecha: v.fecha ?? iso(today()),
              tag: v.tag ?? "",
              peso: Number(v.peso),
              metodo: v.metodo ?? "",
            });
            setOpen(null);
            notify("Peso registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
