import { Coins, PiggyBank, Receipt, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHead } from "./components";
import { BUDGET as BUDGET_DEMO, MOV_SEED, type Mov, milkHistory } from "./herd";
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
  Progress,
  Stat,
  Tabs,
  type Tone,
  daysBetween,
  demoOnly,
  fmtDate,
  isDemoScope,
  iso,
  money,
  moneyM,
  num,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "movimientos" | "presupuesto" | "costos" | "flujo" | "indicadores";

const CAT_ING = ["Leche bovina", "Leche de búfala", "Ganado", "Subproductos", "Otros ingresos"];
const CAT_EGR = [
  "Alimentación",
  "Mano de obra",
  "Sanidad",
  "Reproducción",
  "Pasturas",
  "Energía y agua",
  "Mantenimiento",
  "Impuestos",
  "Otros egresos",
];
const TONES: Tone[] = [
  "azul",
  "verde",
  "ambar",
  "violeta",
  "rojo",
  "gris",
  "azul",
  "verde",
  "ambar",
];

export function EconomiaScreen() {
  // Datos de ejemplo solo en la cuenta demo; las cuentas reales empiezan vacías.
  const BUDGET = demoOnly(BUDGET_DEMO);
  const { notify } = useApp();
  const [movs, add, reset] = useStore<Mov>("movs-eco", MOV_SEED);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"Ingreso" | "Egreso" | null>(null);
  const [tipoF, setTipoF] = useState<"Todos" | "Ingreso" | "Egreso">("Todos");
  const [esc, setEsc] = useState({ precio: 0, alimento: 0, litros: 0 });

  const in30 = (m: Mov) => daysBetween(m.fecha, iso(today())) <= 30;
  const sum = (xs: Mov[]) => xs.reduce((a, m) => a + m.valor, 0);
  const ing30 = sum(movs.filter((m) => m.tipo === "Ingreso" && in30(m)));
  const egr30 = sum(movs.filter((m) => m.tipo === "Egreso" && in30(m)));
  const saldo30 = ing30 - egr30;

  const hist = useMemo(() => (isDemoScope() ? milkHistory() : []), []);
  const litros21 = hist.reduce((s, d) => s + Object.values(d.litros).reduce((a, b) => a + b, 0), 0);
  const litros30 = (litros21 / 21) * 30;
  const costoLeche =
    sum(movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.actividad === "Leche")) +
    0.7 * sum(movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.actividad === "General"));
  const costoLitro = costoLeche / Math.max(1, litros30);
  const ingLeche = sum(
    movs.filter((m) => m.tipo === "Ingreso" && in30(m) && m.actividad === "Leche"),
  );
  const precioLitro = ingLeche / Math.max(1, litros30);
  const alimento = sum(
    movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.categoria === "Alimentación"),
  );

  const meses = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today().getFullYear(), today().getMonth() - 3 + i, 1);
    const inMonth = (m: Mov) => {
      const f = new Date(`${m.fecha}T12:00:00`);
      return f.getMonth() === d.getMonth() && f.getFullYear() === d.getFullYear();
    };
    return {
      l: d.toLocaleDateString("es-CO", { month: "short" }),
      ing: sum(movs.filter((m) => m.tipo === "Ingreso" && inMonth(m))) / 1e6,
      egr: sum(movs.filter((m) => m.tipo === "Egreso" && inMonth(m))) / 1e6,
    };
  });
  const egrCat = CAT_EGR.map((c, i) => ({
    label: c,
    value: sum(movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.categoria === c)),
    tone: TONES[i] ?? "gris",
  })).filter((s) => s.value > 0);
  const budget = BUDGET.map((b) => {
    const ej = sum(movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.categoria === b.rubro));
    return { ...b, ej, pct: (ej / b.presupuesto) * 100 };
  });

  const alerts: AlertItem[] = [
    ...budget
      .filter((b) => b.pct > 100)
      .map((b) => ({
        tone: "rojo" as Tone,
        title: `${b.rubro} excedido`,
        text: `Ejecutado ${money(b.ej)} de ${money(b.presupuesto)} (${num(b.pct, 0)} %).`,
      })),
    ...budget
      .filter((b) => b.pct > 85 && b.pct <= 100)
      .map((b) => ({
        tone: "ambar" as Tone,
        title: `${b.rubro} cerca del límite`,
        text: `Va en ${num(b.pct, 0)} % del presupuesto mensual.`,
      })),
    ...(costoLitro > precioLitro
      ? [
          {
            tone: "rojo" as Tone,
            title: "El litro cuesta más de lo que se vende",
            text: `Costo ${money(costoLitro)} frente a precio ${money(precioLitro)}.`,
          },
        ]
      : []),
    ...(alimento / Math.max(1, ing30) > 0.5
      ? [
          {
            tone: "ambar" as Tone,
            title: "Alimentación sobre el 50 % de los ingresos",
            text: "Revise el uso de concentrado frente a la producción por animal.",
          },
        ]
      : []),
    ...movs
      .filter((m) => m.soporte === "—" || !m.soporte)
      .slice(0, 3)
      .map((m) => ({
        tone: "gris" as Tone,
        title: "Movimiento sin soporte",
        text: `${fmtDate(m.fecha)} · ${m.descripcion} · ${money(m.valor)}`,
      })),
  ];

  // Flujo proyectado 6 meses con escenarios
  const baseIng = ing30;
  const baseEgr = egr30;
  const flujo = Array.from({ length: 6 }, (_, i) => {
    const ingM = baseIng * (1 + esc.precio / 100) * (1 + esc.litros / 100);
    const egrM = baseEgr + alimento * (esc.alimento / 100);
    return {
      l: new Date(today().getFullYear(), today().getMonth() + 1 + i, 1).toLocaleDateString(
        "es-CO",
        { month: "short" },
      ),
      ingM,
      egrM,
    };
  });
  let acc = 0;
  const acumulado = flujo.map((f) => {
    acc += f.ingM - f.egrM;
    return Math.round(acc / 1e5) / 10;
  });

  const cols: Col<Mov>[] = [
    { key: "f", label: "Fecha", sort: (m) => m.fecha, render: (m) => fmtDate(m.fecha) },
    {
      key: "t",
      label: "Tipo",
      sort: (m) => m.tipo,
      render: (m) => <Badge tone={m.tipo === "Ingreso" ? "verde" : "rojo"}>{m.tipo}</Badge>,
    },
    { key: "c", label: "Categoría", sort: (m) => m.categoria, render: (m) => m.categoria },
    { key: "d", label: "Descripción", render: (m) => m.descripcion },
    { key: "a", label: "Actividad", render: (m) => m.actividad },
    {
      key: "s",
      label: "Soporte",
      render: (m) =>
        m.soporte && m.soporte !== "—" ? m.soporte : <Badge tone="ambar">Sin soporte</Badge>,
    },
    {
      key: "v",
      label: "Valor",
      align: "right",
      sort: (m) => m.valor,
      render: (m) => (
        <b className={m.tipo === "Ingreso" ? "pos" : "neg"}>
          {m.tipo === "Egreso" ? "−" : ""}
          {money(m.valor)}
        </b>
      ),
    },
  ];

  const actividades = (["Leche", "Cría y levante", "General"] as const).map((a) => ({
    a,
    ing: sum(movs.filter((m) => m.tipo === "Ingreso" && in30(m) && m.actividad === a)),
    egr: sum(movs.filter((m) => m.tipo === "Egreso" && in30(m) && m.actividad === a)),
  }));

  return (
    <section className="page">
      <PageHead
        kicker="Economía"
        icon={<Coins size={30} aria-hidden="true" />}
        title="Economía de la finca"
        lead="Ingresos, egresos, presupuesto, costo por litro y flujo de caja. El saldo es de movimientos registrados: no es utilidad contable."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("Ingreso")}>
              Registrar ingreso
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("Egreso")}>
              Registrar egreso
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setTab("flujo")}>
              Proyectar flujo
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">Cifras de ejemplo de los últimos 30 días.</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            reset();
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
          { key: "movimientos", label: "Movimientos", badge: movs.length },
          { key: "presupuesto", label: "Presupuesto" },
          { key: "costos", label: "Costos por actividad" },
          { key: "flujo", label: "Flujo de caja" },
          { key: "indicadores", label: "Indicadores" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="verde"
              icon={<TrendingUp size={18} />}
              label="Ingresos (30 días)"
              value={moneyM(ing30)}
              meta={`${movs.filter((m) => m.tipo === "Ingreso" && in30(m)).length} movimientos`}
            />
            <Stat
              tone="rojo"
              icon={<Receipt size={18} />}
              label="Egresos (30 días)"
              value={moneyM(egr30)}
              meta={`${movs.filter((m) => m.tipo === "Egreso" && in30(m)).length} movimientos`}
            />
            <Stat
              tone={saldo30 >= 0 ? "azul" : "rojo"}
              icon={<PiggyBank size={18} />}
              label="Saldo de movimientos"
              value={moneyM(saldo30)}
              meta="Ingresos menos egresos registrados"
            />
            <Stat
              tone="violeta"
              label="Costo por litro"
              value={money(costoLitro)}
              meta={`Precio promedio ${money(precioLitro)}`}
            />
            <Stat
              tone={precioLitro - costoLitro >= 0 ? "verde" : "rojo"}
              label="Margen por litro"
              value={money(precioLitro - costoLitro)}
              meta={`${num(((precioLitro - costoLitro) / Math.max(1, precioLitro)) * 100, 0)} % del precio`}
            />
            <Stat
              tone="ambar"
              label="Alimentación / ingresos"
              value={`${num((alimento / Math.max(1, ing30)) * 100, 0)} %`}
              meta="Peso del alimento comprado"
              goal="≤ 45 %"
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Ingresos y egresos por mes" sub="Millones de pesos">
              <BarChart
                labels={meses.map((m) => m.l)}
                series={[
                  {
                    name: "Ingresos",
                    tone: "verde",
                    values: meses.map((m) => Math.round(m.ing * 10) / 10),
                  },
                  {
                    name: "Egresos",
                    tone: "rojo",
                    values: meses.map((m) => Math.round(m.egr * 10) / 10),
                  },
                ]}
                height={190}
              />
            </Panel>
            <Panel title="¿En qué se va el dinero?" sub="Egresos de los últimos 30 días">
              <Donut
                slices={egrCat}
                center={
                  <>
                    <strong>{moneyM(egr30)}</strong>
                    <small>egresos</small>
                  </>
                }
              />
            </Panel>
          </div>
          <Panel title="Atención" sub="Presupuesto, márgenes y soportes.">
            <Alerts items={alerts} />
          </Panel>
        </>
      )}

      {tab === "movimientos" && (
        <Panel
          title="Movimientos"
          sub="Cada movimiento puede llevar su soporte (factura, remisión o recibo)."
        >
          <DataTable
            cols={cols}
            rows={[...movs]
              .filter((m) => tipoF === "Todos" || m.tipo === tipoF)
              .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(m) => `${m.categoria} ${m.descripcion} ${m.soporte}`}
            placeholder="Buscar por categoría, descripción o soporte…"
            toolbar={
              <div className="kit-seg">
                {(["Todos", "Ingreso", "Egreso"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tipoF === t}
                    className={tipoF === t ? "on" : ""}
                    onClick={() => setTipoF(t)}
                  >
                    {t === "Todos" ? "Todos" : `${t}s`}
                  </button>
                ))}
              </div>
            }
          />
        </Panel>
      )}

      {tab === "presupuesto" && (
        <Panel
          title="Presupuesto mensual frente a ejecución"
          sub="Egresos de los últimos 30 días por rubro."
        >
          {budget.map((b) => (
            <Progress
              key={b.rubro}
              label={b.rubro}
              value={b.ej}
              max={b.presupuesto}
              tone={b.pct > 100 ? "rojo" : b.pct > 85 ? "ambar" : "verde"}
              right={`${moneyM(b.ej)} de ${moneyM(b.presupuesto)} · ${num(b.pct, 0)} %`}
            />
          ))}
          <p className="hint">
            Total: {moneyM(budget.reduce((s, b) => s + b.ej, 0))} ejecutado de{" "}
            {moneyM(budget.reduce((s, b) => s + b.presupuesto, 0))} presupuestado.
          </p>
        </Panel>
      )}

      {tab === "costos" && (
        <>
          <div className="kit-grid3">
            {actividades.map((x) => (
              <Panel key={x.a} title={x.a} sub="Últimos 30 días">
                <ul className="kit-facts big">
                  <li>
                    <span>Ingresos</span>
                    <b className="pos">{moneyM(x.ing)}</b>
                  </li>
                  <li>
                    <span>Egresos directos</span>
                    <b className="neg">{moneyM(x.egr)}</b>
                  </li>
                  <li>
                    <span>Diferencia</span>
                    <b>{moneyM(x.ing - x.egr)}</b>
                  </li>
                </ul>
              </Panel>
            ))}
          </div>
          <Panel
            title="Cómo se calcula el costo por litro"
            sub="Fórmula visible, como exigen los términos de referencia."
          >
            <ul className="kit-facts">
              <li>
                Egresos directos de leche (30 días):{" "}
                <b>
                  {money(
                    costoLeche -
                      0.7 *
                        sum(
                          movs.filter(
                            (m) => m.tipo === "Egreso" && in30(m) && m.actividad === "General",
                          ),
                        ),
                  )}
                </b>
              </li>
              <li>
                Más el 70 % de los egresos generales (prorrata por animales en ordeño):{" "}
                <b>
                  {money(
                    0.7 *
                      sum(
                        movs.filter(
                          (m) => m.tipo === "Egreso" && in30(m) && m.actividad === "General",
                        ),
                      ),
                  )}
                </b>
              </li>
              <li>
                Dividido por los litros estimados del período: <b>{num(litros30, 0)} L</b>
              </li>
              <li>
                Costo por litro: <b>{money(costoLitro)}</b>
              </li>
            </ul>
          </Panel>
        </>
      )}

      {tab === "flujo" && (
        <>
          <Panel
            title="Escenarios"
            sub="Mueva los supuestos y vea el efecto en los próximos seis meses."
          >
            <div className="kf-grid">
              <label htmlFor="e-p">
                Precio de la leche: {esc.precio > 0 ? "+" : ""}
                {esc.precio} %
                <input
                  id="e-p"
                  type="range"
                  min={-20}
                  max={20}
                  value={esc.precio}
                  onChange={(e) => setEsc({ ...esc, precio: Number(e.target.value) })}
                />
              </label>
              <label htmlFor="e-l">
                Litros producidos: {esc.litros > 0 ? "+" : ""}
                {esc.litros} %
                <input
                  id="e-l"
                  type="range"
                  min={-20}
                  max={20}
                  value={esc.litros}
                  onChange={(e) => setEsc({ ...esc, litros: Number(e.target.value) })}
                />
              </label>
              <label htmlFor="e-a">
                Costo del alimento: {esc.alimento > 0 ? "+" : ""}
                {esc.alimento} %
                <input
                  id="e-a"
                  type="range"
                  min={-20}
                  max={40}
                  value={esc.alimento}
                  onChange={(e) => setEsc({ ...esc, alimento: Number(e.target.value) })}
                />
              </label>
            </div>
          </Panel>
          <div className="kit-grid2">
            <Panel title="Saldo acumulado proyectado" sub="Millones de pesos">
              <LineChart
                labels={flujo.map((f) => f.l)}
                series={[
                  {
                    name: "Saldo acumulado",
                    tone: acumulado[5] !== undefined && acumulado[5] < 0 ? "rojo" : "verde",
                    points: acumulado,
                  },
                ]}
                goal={{ value: 0, label: "Equilibrio" }}
                height={200}
              />
            </Panel>
            <Panel
              title="Mes a mes"
              sub="Supuesto: el mes actual se repite con los ajustes elegidos."
            >
              <ul className="kit-facts">
                {flujo.map((f, i) => (
                  <li key={f.l}>
                    <span>{f.l}</span>
                    <b>
                      {moneyM(f.ingM - f.egrM)} · acumulado {num(acumulado[i] ?? 0, 1)} M
                    </b>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === "indicadores" && (
        <Panel title="Indicadores económicos" sub="Con su fórmula y meta de referencia.">
          <div className="ptable-wrap">
            <table className="ptable">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Valor</th>
                  <th>Fórmula</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Costo por litro",
                    money(costoLitro),
                    "Egresos asignados a leche ÷ litros",
                    "Menor que el precio pagado",
                  ],
                  [
                    "Margen por litro",
                    money(precioLitro - costoLitro),
                    "Precio promedio − costo por litro",
                    "Positivo y estable",
                  ],
                  [
                    "Punto de equilibrio",
                    `${num(egr30 / Math.max(1, precioLitro) / 30, 0)} L/día`,
                    "Egresos del mes ÷ precio ÷ 30",
                    `Hoy se producen ${num(litros30 / 30, 0)} L/día`,
                  ],
                  [
                    "Alimento sobre ingresos",
                    `${num((alimento / Math.max(1, ing30)) * 100, 0)} %`,
                    "Alimento comprado ÷ ingresos",
                    "≤ 45 %",
                  ],
                  [
                    "Ingreso por litro de búfala",
                    money(3800),
                    "Precio de quesera",
                    "≈ 2 veces la leche bovina",
                  ],
                  [
                    "Saldo de movimientos",
                    moneyM(saldo30),
                    "Ingresos − egresos registrados",
                    "No es utilidad ni saldo bancario",
                  ],
                ].map((r) => (
                  <tr key={r[0]}>
                    {r.map((c, i) => (
                      <td
                        key={`${r[0]}${i}`}
                        data-label={["Indicador", "Valor", "Fórmula", "Referencia"][i]}
                      >
                        {i === 0 ? <b>{c}</b> : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {open && (
        <FormDialog
          open
          title={`Registrar ${open.toLowerCase()}`}
          fields={[
            { name: "fecha", label: "Fecha", type: "date" },
            {
              name: "categoria",
              label: "Categoría",
              type: "select",
              options: open === "Ingreso" ? CAT_ING : CAT_EGR,
            },
            { name: "descripcion", label: "Descripción", type: "text" },
            { name: "valor", label: "Valor (COP)", type: "number" },
            {
              name: "actividad",
              label: "Actividad",
              type: "select",
              options: ["Leche", "Cría y levante", "General"],
            },
            {
              name: "soporte",
              label: "Soporte (factura, recibo)",
              type: "text",
              required: false,
              placeholder: "Ej. FE-0490",
            },
          ]}
          preview={(v) =>
            Number(v.valor) ? (
              <p className="hint">
                Saldo de 30 días después de este registro:{" "}
                <b>{moneyM(saldo30 + (open === "Ingreso" ? 1 : -1) * Number(v.valor))}</b>
              </p>
            ) : null
          }
          onSubmit={(v) => {
            add({
              fecha: v.fecha ?? iso(today()),
              tipo: open,
              categoria: v.categoria ?? "",
              descripcion: v.descripcion ?? "",
              valor: Number(v.valor),
              actividad: (v.actividad as Mov["actividad"]) ?? "General",
              soporte: v.soporte || "—",
            });
            setOpen(null);
            notify(`${open} registrado.`, "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
