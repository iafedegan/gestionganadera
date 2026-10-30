import { CloudRain, Leaf, Map as MapIcon, Sprout, Thermometer } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import { CONSUMO_MS, PADDOCKS, type Paddock, RAIN, UGG, forageOf, lotStats } from "./herd";
import {
  type AlertItem,
  Alerts,
  Badge,
  BarChart,
  DataTable,
  FormDialog,
  LineChart,
  Panel,
  Progress,
  Stat,
  Tabs,
  type Tone,
  addDays,
  fmtDate,
  iso,
  money,
  num,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "mapa" | "planificador" | "aforos" | "balance" | "raciones" | "clima";
interface Aforo {
  fecha: string;
  id: string;
  ms: number;
  altura: number;
}
interface Mov {
  fecha: string;
  lote: string;
  de: string;
  a: string;
  estado: string;
}

const USO = 0.5;
const LOTS = ["Ordeño", "Búfalas", "Levante"];
const lotDemand = (l: string) => lotStats(l).demandaDia;

function status(p: Paddock): { label: string; tone: Tone; rest: number | null; ready: boolean } {
  const f = forageOf(p.forraje);
  if (p.lote) return { label: `Ocupado · ${p.lote}`, tone: "azul", rest: null, ready: false };
  const rest = p.salida ?? 0;
  if (rest >= f.descansoMin)
    return {
      label: rest > f.descansoMax + 14 ? "Pasado de punto" : "Listo para pastoreo",
      tone: rest > f.descansoMax + 14 ? "ambar" : "verde",
      rest,
      ready: true,
    };
  return { label: "En descanso", tone: "gris", rest, ready: false };
}

const RATIONS = [
  { lote: "Ordeño", insumo: "Pasto en pastoreo rotacional", kg: 11, precio: 90 },
  { lote: "Ordeño", insumo: "Concentrado lechero 20 %", kg: 5, precio: 2400 },
  { lote: "Ordeño", insumo: "Sal mineralizada", kg: 0.12, precio: 3300 },
  { lote: "Búfalas", insumo: "Pasto humidícola / pasto de corte", kg: 12, precio: 80 },
  { lote: "Búfalas", insumo: "Concentrado 16 %", kg: 2, precio: 2300 },
  { lote: "Búfalas", insumo: "Sal mineralizada", kg: 0.12, precio: 3300 },
  { lote: "Levante", insumo: "Pasto en pastoreo", kg: 8, precio: 80 },
  { lote: "Levante", insumo: "Melaza y urea (suplemento)", kg: 0.8, precio: 1800 },
  { lote: "Levante", insumo: "Sal mineralizada", kg: 0.08, precio: 3300 },
];

export function PasturasScreen() {
  const { notify } = useApp();
  const [aforos, addAforo, resetAforo] = useStore<Aforo>(
    "aforos",
    PADDOCKS.map((p) => ({
      fecha: iso(new Date(today().getTime() - p.aforoHace * 864e5)),
      id: p.id,
      ms: p.aforo,
      altura: Math.round(p.aforo / 45),
    })),
  );
  const [movs, addMov, resetMov] = useStore<Mov>("movs", [
    {
      fecha: iso(new Date(today().getTime() - 2 * 864e5)),
      lote: "Ordeño",
      de: "La Loma 3",
      a: "La Loma 1",
      estado: "Confirmado",
    },
    {
      fecha: iso(new Date(today().getTime() - 3 * 864e5)),
      lote: "Levante",
      de: "Potrero Norte",
      a: "Potrero Sur",
      estado: "Confirmado",
    },
    {
      fecha: iso(new Date(today().getTime() - 1 * 864e5)),
      lote: "Búfalas",
      de: "El Bajo 2",
      a: "El Bajo 1",
      estado: "Confirmado",
    },
  ]);
  const [tab, setTab] = useState<Tab>("mapa");
  const [open, setOpen] = useState<"aforo" | "mov" | null>(null);
  const [plan, setPlan] = useState({ lote: "Ordeño", id: "P2", uso: 50 });
  const [ith, setIth] = useState({ t: 31, h: 70 });

  const latestAforo = (id: string) =>
    [...aforos].filter((a) => a.id === id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
  const paddocks = PADDOCKS.map((p) => {
    const a = latestAforo(p.id);
    const ms = a?.ms ?? p.aforo;
    return { p, ms, st: status(p), disp: ms * p.area * USO, f: forageOf(p.forraje) };
  });
  const area = PADDOCKS.reduce((s, p) => s + p.area, 0);
  const listos = paddocks.filter((x) => x.st.ready);
  const dispListos = listos.reduce((s, x) => s + x.disp, 0);
  const demandaTotal = LOTS.reduce((s, l) => s + lotDemand(l), 0);
  const cobertura = dispListos / Math.max(1, demandaTotal);
  const ugg = LOTS.reduce((s, l) => s + lotStats(l).ugg, 0);

  const alerts: AlertItem[] = [
    ...paddocks
      .filter((x) => !x.p.agua && x.st.ready)
      .map((x) => ({
        tone: "ambar" as Tone,
        title: `${x.p.nombre} sin bebedero`,
        text: "Está listo para pastoreo pero no tiene agua: instale bebedero antes de moverlo.",
      })),
    ...paddocks
      .filter((x) => x.st.label === "Pasado de punto")
      .map((x) => ({
        tone: "ambar" as Tone,
        title: `${x.p.nombre} pasado de punto`,
        text: `Lleva ${x.st.rest} días de descanso (óptimo ${x.f.descansoMin}–${x.f.descansoMax}). La calidad cae: pastoree pronto o corte para ensilaje/heno.`,
      })),
    ...paddocks
      .filter((x) => x.p.lote && (x.p.entrada ?? 0) >= x.f.ocupacion)
      .map((x) => ({
        tone: "rojo" as Tone,
        title: `${x.p.nombre} · ${x.p.entrada} días ocupado`,
        text: `Supera los ${x.f.ocupacion} días recomendados: el rebrote se afecta. Mueva a ${x.p.lote}.`,
      })),
    ...(cobertura < 3
      ? [
          {
            tone: "rojo" as Tone,
            title: `Cobertura de forraje: ${num(cobertura, 1)} días`,
            text: "Hay poco forraje en potreros listos. Active suplementación o compre alimento.",
          },
        ]
      : []),
  ];

  const pl = paddocks.find((x) => x.p.id === plan.id);
  const dem = lotDemand(plan.lote);
  const disp = pl ? pl.ms * pl.p.area * (plan.uso / 100) : 0;
  const dias = dem ? disp / dem : 0;
  const salida = addDays(iso(today()), Math.round(dias));
  const next = paddocks.find((x) => x.st.ready && x.p.id !== plan.id);

  const weeks = Array.from({ length: 8 }, (_, w) => {
    const off = paddocks
      .filter((x) => !x.p.lote && (x.st.rest ?? 0) + w * 7 >= x.f.descansoMin)
      .reduce((s, x) => s + x.disp, 0);
    return {
      l: `Sem ${w + 1}`,
      oferta: Math.round(off / 1000),
      demanda: Math.round((demandaTotal * 7) / 1000),
    };
  });

  const racion = LOTS.map((l) => {
    const items = RATIONS.filter((r) => r.lote === l);
    const costo = items.reduce((s, r) => s + r.kg * r.precio, 0);
    const st = lotStats(l);
    const litros = l === "Ordeño" ? 112 : l === "Búfalas" ? 33 : 0;
    return { l, items, costo, st, litros };
  });

  const itHI = 1.8 * ith.t + 32 - (0.55 - 0.0055 * ith.h) * (1.8 * ith.t - 26);
  const itTone: Tone = itHI < 72 ? "verde" : itHI < 79 ? "ambar" : itHI < 89 ? "rojo" : "rojo";
  const itLabel =
    itHI < 72
      ? "Sin estrés"
      : itHI < 79
        ? "Estrés leve"
        : itHI < 89
          ? "Estrés moderado"
          : "Estrés severo";

  return (
    <section className="page">
      <PageHead
        kicker="Pasturas y alimentación"
        icon={<Sprout size={30} aria-hidden="true" />}
        title="Pasturas y alimentación"
        lead="Potreros, rotación, aforos, balance de forraje, raciones y clima, con cálculos de carga y días de ocupación."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("aforo")}>
              Registrar aforo
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setTab("planificador")}>
              Planificar rotación
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("mov")}>
              Confirmar movimiento
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          Consumo teórico de {num(CONSUMO_MS * 100, 1)} % del peso vivo en materia seca y 1 UGG ={" "}
          {UGG} kg. Ajuste con su nutricionista.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetAforo();
            resetMov();
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
          { key: "mapa", label: "Mapa de potreros", badge: alerts.length },
          { key: "planificador", label: "Planificador" },
          { key: "aforos", label: "Aforos y movimientos" },
          { key: "balance", label: "Balance forrajero" },
          { key: "raciones", label: "Raciones y costos" },
          { key: "clima", label: "Agua y clima" },
        ]}
      />

      {tab === "mapa" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="verde"
              icon={<MapIcon size={18} />}
              label="Área en potreros"
              value={`${num(area)} ha`}
              meta={`${PADDOCKS.length} potreros`}
            />
            <Stat
              tone="azul"
              icon={<Leaf size={18} />}
              label="Listos para pastoreo"
              value={listos.length}
              meta={`${num(dispListos / 1000, 1)} t de MS aprovechable`}
            />
            <Stat
              tone="violeta"
              label="Carga animal"
              value={`${num(ugg / area, 2)} UGG/ha`}
              meta={`${num(ugg, 0)} UGG en ${num(area)} ha`}
              goal="1,5–3 UGG/ha"
            />
            <Stat
              tone={cobertura < 3 ? "rojo" : "verde"}
              label="Cobertura de forraje"
              value={`${num(cobertura, 1)} días`}
              meta="Potreros listos ÷ demanda diaria"
              goal="≥ 5 días"
            />
          </div>
          <Panel title="Atención" sub="Cosas por resolver en la rotación.">
            <Alerts items={alerts} empty="La rotación va al día." />
          </Panel>
          <div className="paddock-grid">
            {paddocks.map(({ p, ms, st, f }) => (
              <article key={p.id} className={`paddock pd-${st.tone}`}>
                <header>
                  <strong>{p.nombre}</strong>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </header>
                <p className="pd-meta">
                  {num(p.area)} ha · {f.name} · {p.suelo}
                </p>
                <div className="pd-nums">
                  <span>
                    <b>{num(ms, 0)}</b>
                    <small>kg MS/ha</small>
                  </span>
                  <span>
                    <b>{p.lote ? `${p.entrada} d` : `${st.rest} d`}</b>
                    <small>{p.lote ? "ocupado" : "descanso"}</small>
                  </span>
                  <span>
                    <b>{p.agua ? "Sí" : "No"}</b>
                    <small>agua</small>
                  </span>
                </div>
                {!p.lote && st.rest !== null && (
                  <Progress
                    value={st.rest}
                    max={f.descansoMax}
                    tone={st.tone}
                    right={`${st.rest}/${f.descansoMin}–${f.descansoMax} d`}
                  />
                )}
                {p.lote && (
                  <Progress
                    value={p.entrada ?? 0}
                    max={f.ocupacion}
                    tone={(p.entrada ?? 0) >= f.ocupacion ? "rojo" : "azul"}
                    right={`${p.entrada}/${f.ocupacion} d`}
                  />
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "planificador" && (
        <div className="kit-grid2">
          <Panel
            title="Planificar la entrada de un lote"
            sub="Calcula cuántos días puede estar el lote en el potrero."
            icon={<Sprout size={20} />}
          >
            <div className="kf-grid">
              <label htmlFor="pl-l">
                Lote
                <select
                  id="pl-l"
                  value={plan.lote}
                  onChange={(e) => setPlan({ ...plan, lote: e.target.value })}
                >
                  {LOTS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="pl-p">
                Potrero
                <select
                  id="pl-p"
                  value={plan.id}
                  onChange={(e) => setPlan({ ...plan, id: e.target.value })}
                >
                  {PADDOCKS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="pl-u" className="span2">
                Aprovechamiento del forraje: {plan.uso} %
                <input
                  id="pl-u"
                  type="range"
                  min={30}
                  max={70}
                  step={5}
                  value={plan.uso}
                  onChange={(e) => setPlan({ ...plan, uso: Number(e.target.value) })}
                />
                <small className="field-help">
                  50 % deja residuo suficiente para el rebrote; más lo agota.
                </small>
              </label>
            </div>
          </Panel>
          <Panel title="Resultado" sub={pl ? `${pl.p.nombre} · ${pl.f.name}` : ""}>
            <ul className="kit-facts big">
              <li>
                <span>Demanda del lote</span>
                <b>
                  {num(dem, 0)} kg MS/día ({num(lotStats(plan.lote).ugg, 1)} UGG)
                </b>
              </li>
              <li>
                <span>Forraje aprovechable</span>
                <b>{num(disp, 0)} kg MS</b>
              </li>
              <li>
                <span>Días de ocupación</span>
                <b>
                  {num(dias, 1)} {pl && dias > pl.f.ocupacion ? "(sobre lo recomendado)" : ""}
                </b>
              </li>
              <li>
                <span>Salida sugerida</span>
                <b>{fmtDate(salida)}</b>
              </li>
              <li>
                <span>Descanso hasta el reingreso</span>
                <b>{pl ? `${pl.f.descansoMin}–${pl.f.descansoMax} días` : "—"}</b>
              </li>
              <li>
                <span>Siguiente potrero listo</span>
                <b>{next ? next.p.nombre : "Ninguno listo"}</b>
              </li>
            </ul>
            {pl && !pl.p.agua && (
              <p className="hint">
                Este potrero no tiene bebedero: programe agua antes de ingresar.
              </p>
            )}
            {pl?.st.ready === false && !pl.p.lote && (
              <p className="hint">
                Aún no cumple el descanso mínimo de {pl.f.descansoMin} días: el rebrote quedaría
                afectado.
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                addMov({
                  fecha: iso(today()),
                  lote: plan.lote,
                  de: PADDOCKS.find((p) => p.lote === plan.lote)?.nombre ?? "—",
                  a: pl?.p.nombre ?? "",
                  estado: "Planificado",
                });
                notify("Movimiento planificado.", "ok");
                setTab("aforos");
              }}
            >
              Programar movimiento
            </button>
          </Panel>
        </div>
      )}

      {tab === "aforos" && (
        <>
          <Panel title="Aforos" sub="Kilogramos de materia seca por hectárea y altura del pasto.">
            <DataTable
              cols={[
                {
                  key: "f",
                  label: "Fecha",
                  sort: (a: Aforo) => a.fecha,
                  render: (a) => fmtDate(a.fecha),
                },
                {
                  key: "p",
                  label: "Potrero",
                  render: (a) => <b>{PADDOCKS.find((p) => p.id === a.id)?.nombre}</b>,
                },
                {
                  key: "m",
                  label: "kg MS/ha",
                  align: "right",
                  sort: (a) => a.ms,
                  render: (a) => num(a.ms, 0),
                },
                { key: "h", label: "Altura (cm)", align: "right", render: (a) => a.altura },
                {
                  key: "e",
                  label: "Lectura",
                  render: (a) => (
                    <Badge tone={a.ms >= 3000 ? "verde" : a.ms >= 2000 ? "ambar" : "rojo"}>
                      {a.ms >= 3000 ? "Abundante" : a.ms >= 2000 ? "Suficiente" : "Escaso"}
                    </Badge>
                  ),
                },
              ]}
              rows={[...aforos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            />
          </Panel>
          <Panel title="Movimientos de lotes" sub="Rotación confirmada y planificada.">
            <DataTable
              cols={[
                { key: "f", label: "Fecha", render: (m: Mov) => fmtDate(m.fecha) },
                { key: "l", label: "Lote", render: (m) => <b>{m.lote}</b> },
                { key: "d", label: "Desde", render: (m) => m.de },
                { key: "a", label: "Hacia", render: (m) => m.a },
                {
                  key: "e",
                  label: "Estado",
                  render: (m) => (
                    <Badge tone={m.estado === "Confirmado" ? "verde" : "ambar"}>{m.estado}</Badge>
                  ),
                },
              ]}
              rows={[...movs].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            />
          </Panel>
        </>
      )}

      {tab === "balance" && (
        <>
          <Panel
            title="Oferta frente a demanda de forraje"
            sub="Toneladas de materia seca por semana, según el descanso de cada potrero."
            icon={<Leaf size={20} />}
          >
            <LineChart
              labels={weeks.map((w) => w.l)}
              series={[
                {
                  name: "Oferta aprovechable (t)",
                  tone: "verde",
                  points: weeks.map((w) => w.oferta),
                },
                { name: "Demanda del hato (t)", tone: "rojo", points: weeks.map((w) => w.demanda) },
              ]}
            />
            <p className="hint">
              Si la oferta cae bajo la demanda hay déficit: planifique suplementación, henolaje o
              compra con anticipación.
            </p>
          </Panel>
          <Panel title="Potreros y forraje disponible" sub="Aprovechable al 50 % del aforo.">
            <DataTable
              cols={[
                {
                  key: "n",
                  label: "Potrero",
                  sort: (x: (typeof paddocks)[number]) => x.p.nombre,
                  render: (x) => <b>{x.p.nombre}</b>,
                },
                { key: "f", label: "Forraje", render: (x) => x.f.name },
                {
                  key: "s",
                  label: "Estado",
                  render: (x) => <Badge tone={x.st.tone}>{x.st.label}</Badge>,
                },
                {
                  key: "d",
                  label: "Disponible (kg MS)",
                  align: "right",
                  sort: (x) => x.disp,
                  render: (x) => num(x.disp, 0),
                },
                {
                  key: "r",
                  label: "Descanso recomendado",
                  render: (x) => `${x.f.descansoMin}–${x.f.descansoMax} d`,
                },
              ]}
              rows={paddocks}
            />
          </Panel>
        </>
      )}

      {tab === "raciones" && (
        <>
          <div className="kit-grid3">
            {racion.map((r) => (
              <Panel
                key={r.l}
                title={`Lote ${r.l}`}
                sub={`${r.st.n} animales · ${num(r.st.ugg, 1)} UGG`}
              >
                <ul className="kit-facts">
                  {r.items.map((i) => (
                    <li key={i.insumo}>
                      <span>{i.insumo}</span>
                      <b>
                        {num(i.kg, 2)} kg · {money(i.kg * i.precio)}
                      </b>
                    </li>
                  ))}
                </ul>
                <p className="ration-total">
                  {money(r.costo)} <small>por animal por día</small>
                </p>
                <small className="hint">
                  {money(r.costo * r.st.n)} al día por el lote
                  {r.litros ? ` · ${money((r.costo * r.st.n) / r.litros)} por litro` : ""}
                </small>
              </Panel>
            ))}
          </div>
          <Panel
            title="Regla práctica de suplementación"
            sub="Punto de partida; el nutricionista la ajusta a su hato."
          >
            <ul className="kit-facts">
              <li>
                <b>Vacas:</b> cubra los primeros litros con pasto de calidad y suplemente con
                concentrado la producción que exceda ese nivel.
              </li>
              <li>
                <b>Búfalas:</b> aprovechan mejor la fibra; el concentrado se usa sobre todo en el
                pico de lactancia.
              </li>
              <li>
                <b>Levante:</b> energía y proteína estratégicas en época seca para sostener la
                ganancia de peso.
              </li>
              <li>
                <b>Minerales:</b> sal mineralizada todo el año, con consumo registrado por lote.
              </li>
            </ul>
          </Panel>
        </>
      )}

      {tab === "clima" && (
        <>
          <div className="kit-grid2">
            <Panel
              title="Lluvias del año"
              sub="Milímetros por mes frente al histórico"
              icon={<CloudRain size={20} />}
            >
              <BarChart
                labels={RAIN.labels}
                series={[
                  { name: "Este año", tone: "azul", values: RAIN.mm },
                  { name: "Histórico", tone: "gris", values: RAIN.hist },
                ]}
                height={180}
              />
              <p className="hint">
                Agosto cayó 30 % bajo el histórico: reflejó menos forraje en septiembre.
              </p>
            </Panel>
            <Panel
              title="Estrés calórico (ITH)"
              sub="Índice de temperatura y humedad"
              icon={<Thermometer size={20} />}
            >
              <div className="kf-grid">
                <label htmlFor="i-t">
                  Temperatura (°C)
                  <input
                    id="i-t"
                    type="number"
                    value={ith.t}
                    onChange={(e) => setIth({ ...ith, t: Number(e.target.value) })}
                  />
                </label>
                <label htmlFor="i-h">
                  Humedad relativa (%)
                  <input
                    id="i-h"
                    type="number"
                    value={ith.h}
                    onChange={(e) => setIth({ ...ith, h: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className={`kit-verdict ${itTone === "verde" ? "ok" : "no"}`}>
                <strong>
                  ITH {num(itHI, 0)} · {itLabel}
                </strong>
                <span>
                  {itHI < 72
                    ? "Condiciones cómodas."
                    : "Ofrezca sombra y agua fresca; en búfalas, además, zonas de agua o barro para refrescarse, y ordeñe en las horas frescas."}
                </span>
              </div>
            </Panel>
          </div>
          <Panel title="Fuentes de agua" sub="Bebederos por potrero">
            <DataTable
              cols={[
                { key: "n", label: "Potrero", render: (p: Paddock) => <b>{p.nombre}</b> },
                {
                  key: "a",
                  label: "Bebedero",
                  render: (p) =>
                    p.agua ? (
                      <Badge tone="verde">Con agua</Badge>
                    ) : (
                      <Badge tone="rojo">Sin bebedero</Badge>
                    ),
                },
                { key: "s", label: "Suelo", render: (p) => p.suelo },
              ]}
              rows={PADDOCKS}
            />
          </Panel>
        </>
      )}

      {open === "aforo" && (
        <FormDialog
          open
          title="Registrar aforo"
          sub="Corte y pese el forraje de varios cuadrantes de 1 m² y promedie."
          fields={[
            {
              name: "id",
              label: "Potrero",
              type: "select",
              options: PADDOCKS.map((p) => p.nombre),
            },
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "ms", label: "kg de MS por hectárea", type: "number" },
            { name: "altura", label: "Altura promedio (cm)", type: "number" },
          ]}
          preview={(v) => {
            const p = PADDOCKS.find((x) => x.nombre === v.id);
            const ms = Number(v.ms);
            if (!p || !ms) return null;
            const f = forageOf(p.forraje);
            return (
              <p className="hint">
                Forraje aprovechable: <b>{num(ms * p.area * USO, 0)} kg MS</b>. Residuo mínimo
                recomendado: <b>{num(f.residuo, 0)} kg MS/ha</b>.
              </p>
            );
          }}
          onSubmit={(v) => {
            addAforo({
              id: PADDOCKS.find((p) => p.nombre === v.id)?.id ?? "P1",
              fecha: v.fecha ?? iso(today()),
              ms: Number(v.ms),
              altura: Number(v.altura),
            });
            setOpen(null);
            notify("Aforo registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "mov" && (
        <FormDialog
          open
          title="Confirmar movimiento"
          fields={[
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "lote", label: "Lote", type: "select", options: LOTS },
            { name: "de", label: "Desde", type: "select", options: PADDOCKS.map((p) => p.nombre) },
            { name: "a", label: "Hacia", type: "select", options: PADDOCKS.map((p) => p.nombre) },
          ]}
          onSubmit={(v) => {
            addMov({
              fecha: v.fecha ?? iso(today()),
              lote: v.lote ?? "",
              de: v.de ?? "",
              a: v.a ?? "",
              estado: "Confirmado",
            });
            setOpen(null);
            notify("Movimiento confirmado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
