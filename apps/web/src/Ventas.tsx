import { Beef, Milk, Receipt, Store, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import {
  CATTLE_SALES,
  CLIENTS,
  CUOTA_FOMENTO_LECHE,
  type CattleSale,
  type Client,
  DELIVERIES,
  type Delivery,
} from "./erpData";
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
  daysBetween,
  downloadCsv,
  fmtDate,
  iso,
  money,
  moneyM,
  num,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "entregas" | "liquidacion" | "ganado" | "clientes" | "precios";
const neto = (d: Delivery) => d.litros * (d.precioBase + d.bonificacion - d.descuento);

export function VentasScreen() {
  const { notify } = useApp();
  const [dels, addDel, resetD] = useStore<Delivery>("entregas", DELIVERIES);
  const [sales, addSale, resetS] = useStore<CattleSale>("ventas-ganado", CATTLE_SALES);
  const [clients, addClient, resetCl] = useStore<Client>("clientes", CLIENTS);
  const [tab, setTab] = useState<Tab>("panel");
  const [sp, setSp] = useState<SpeciesF>("todos");
  const [open, setOpen] = useState<"entrega" | "ganado" | "cliente" | null>(null);
  const [liq, setLiq] = useState({
    especie: "bovino" as "bovino" | "bufalino",
    dias: 14,
    base: 1850,
    grasa: 3.9,
    proteina: 3.2,
    ccs: 210,
    ufc: 60,
    transporte: 60,
  });

  const d = dels.filter((x) => sp === "todos" || x.especie === sp);
  const in7 = d.filter((x) => daysBetween(x.fecha, iso(today())) < 7);
  const litros7 = in7.reduce((s, x) => s + x.litros, 0);
  const ingreso7 = in7.reduce((s, x) => s + neto(x), 0);
  const precioProm = ingreso7 / Math.max(1, litros7);
  const ganado30 = sales
    .filter((s) => daysBetween(s.fecha, iso(today())) <= 30)
    .reduce((a, s) => a + s.pesoKg * s.precioKg, 0);
  const cartera = clients.reduce((s, c) => s + c.saldo, 0);
  const vencido = clients.reduce((s, c) => s + c.vencido, 0);

  const days = Array.from({ length: 14 }, (_, i) =>
    iso(new Date(today().getTime() - (13 - i) * 864e5)),
  );
  const byDay = (e: "bovino" | "bufalino") =>
    days.map((f) =>
      dels.filter((x) => x.fecha === f && x.especie === e).reduce((s, x) => s + x.litros, 0),
    );

  const alerts: AlertItem[] = [
    ...clients
      .filter((c) => c.diasMora > 0)
      .map((c) => ({
        tone: "rojo" as Tone,
        title: `${c.nombre} · ${c.diasMora} días de mora`,
        text: `Vencido ${money(c.vencido)} de un saldo de ${money(c.saldo)}. Plazo pactado: ${c.plazo} días.`,
      })),
    ...sales
      .filter((s) => s.estado === "Por cobrar")
      .map((s) => ({
        tone: "ambar" as Tone,
        title: `Venta de ${s.animal} por cobrar`,
        text: `${s.comprador} · ${money(s.pesoKg * s.precioKg)} · guía ${s.guiaICA}`,
      })),
    {
      tone: "azul",
      title: "Bonificación por calidad",
      text: "Bajar células somáticas a menos de 200 mil/mL sube la bonificación de la planta.",
    },
  ];

  // Liquidación
  const L = dels.filter(
    (x) => x.especie === liq.especie && daysBetween(x.fecha, iso(today())) < liq.dias,
  );
  const litros = L.reduce((s, x) => s + x.litros, 0);
  const bonGrasa =
    liq.especie === "bovino"
      ? Math.max(0, (liq.grasa - 3.5) * 10) * 12
      : Math.max(0, (liq.grasa - 7) * 10) * 15;
  const bonProt =
    liq.especie === "bovino"
      ? Math.max(0, (liq.proteina - 3.0) * 10) * 15
      : Math.max(0, (liq.proteina - 4.0) * 10) * 15;
  const bonHig = liq.ccs < 200 ? 40 : liq.ccs < 400 ? 15 : -40;
  const bonUfc = liq.ufc < 50 ? 40 : liq.ufc < 100 ? 20 : -50;
  const precioFinal = liq.base + bonGrasa + bonProt + bonHig + bonUfc;
  const bruto = litros * precioFinal;
  const cuota = bruto * CUOTA_FOMENTO_LECHE;
  const transp = litros * liq.transporte;
  const reten = bruto * 0.015;
  const netoLiq = bruto - cuota - transp - reten;

  const delCols: Col<Delivery>[] = [
    { key: "f", label: "Fecha", sort: (x) => x.fecha, render: (x) => fmtDate(x.fecha) },
    { key: "c", label: "Comprador", sort: (x) => x.comprador, render: (x) => <b>{x.comprador}</b> },
    {
      key: "e",
      label: "Leche",
      render: (x) => (
        <Badge tone={x.especie === "bovino" ? "azul" : "violeta"}>
          {x.especie === "bovino" ? "Bovina" : "Búfala"}
        </Badge>
      ),
    },
    {
      key: "l",
      label: "Litros",
      align: "right",
      sort: (x) => x.litros,
      render: (x) => num(x.litros, 0),
    },
    {
      key: "p",
      label: "Precio neto / L",
      align: "right",
      render: (x) => money(x.precioBase + x.bonificacion - x.descuento),
    },
    {
      key: "v",
      label: "Valor",
      align: "right",
      sort: (x) => neto(x),
      render: (x) => <b>{money(neto(x))}</b>,
    },
    { key: "g", label: "Planilla", render: (x) => x.guia },
  ];

  return (
    <section className="page">
      <PageHead
        kicker="Ventas y clientes"
        icon={<Store size={30} aria-hidden="true" />}
        title="Ventas, clientes y entregas"
        lead="Entregas de leche, liquidación con bonificaciones, venta de ganado con guía de movilización y cartera."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("entrega")}>
              Registrar entrega
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("ganado")}>
              Vender ganado
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("cliente")}>
              Nuevo cliente
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
            resetD();
            resetS();
            resetCl();
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
          { key: "entregas", label: "Entregas de leche" },
          { key: "liquidacion", label: "Liquidación" },
          { key: "ganado", label: "Venta de ganado", badge: sales.length },
          { key: "clientes", label: "Clientes y cartera", badge: clients.length },
          { key: "precios", label: "Precios" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="azul"
              icon={<Milk size={18} />}
              label="Leche entregada (7 días)"
              value={`${num(litros7, 0)} L`}
              meta={`${num(litros7 / 7, 0)} L por día`}
            />
            <Stat
              tone="verde"
              icon={<Receipt size={18} />}
              label="Valor de las entregas"
              value={moneyM(ingreso7)}
              meta={`Precio neto promedio ${money(precioProm)}/L`}
            />
            <Stat
              tone="violeta"
              icon={<Beef size={18} />}
              label="Ganado vendido (30 días)"
              value={moneyM(ganado30)}
              meta={`${sales.filter((s) => daysBetween(s.fecha, iso(today())) <= 30).length} animales`}
            />
            <Stat
              tone="ambar"
              icon={<Wallet size={18} />}
              label="Cartera"
              value={moneyM(cartera)}
              meta={`${moneyM(vencido)} vencido`}
            />
          </div>
          <Panel title="Litros entregados por día" sub="Últimos 14 días, por comprador" wide>
            <BarChart
              labels={days.map((f) => new Date(`${f}T12:00:00`).getDate().toString())}
              stacked
              series={[
                ...(sp !== "bufalino"
                  ? [
                      {
                        name: "Lácteos del Valle (bovina)",
                        tone: "azul" as Tone,
                        values: byDay("bovino"),
                      },
                    ]
                  : []),
                ...(sp !== "bovino"
                  ? [
                      {
                        name: "Quesera La Esperanza (búfala)",
                        tone: "violeta" as Tone,
                        values: byDay("bufalino"),
                      },
                    ]
                  : []),
              ]}
              height={200}
            />
          </Panel>
          <div className="kit-grid2">
            <Panel title="Atención" sub="Cartera y oportunidades">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Ingresos por línea" sub="Últimos 30 días">
              <Donut
                slices={[
                  {
                    label: "Leche bovina",
                    value: dels
                      .filter((x) => x.especie === "bovino")
                      .reduce((s, x) => s + neto(x), 0),
                    tone: "azul",
                  },
                  {
                    label: "Leche de búfala",
                    value: dels
                      .filter((x) => x.especie === "bufalino")
                      .reduce((s, x) => s + neto(x), 0),
                    tone: "violeta",
                  },
                  { label: "Ganado", value: ganado30, tone: "verde" },
                ]}
                format={(n) => moneyM(n)}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "entregas" && (
        <Panel title="Entregas de leche" sub="Cada entrega con su planilla del comprador.">
          <DataTable
            cols={delCols}
            rows={[...d].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(x) => `${x.comprador} ${x.guia}`}
            toolbar={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    "entregas-leche",
                    ["Fecha", "Comprador", "Especie", "Litros", "Precio neto", "Valor", "Planilla"],
                    d.map((x) => [
                      x.fecha,
                      x.comprador,
                      x.especie,
                      x.litros,
                      x.precioBase + x.bonificacion - x.descuento,
                      neto(x),
                      x.guia,
                    ]),
                  )
                }
              >
                Exportar CSV
              </button>
            }
          />
        </Panel>
      )}

      {tab === "liquidacion" && (
        <div className="kit-grid2">
          <Panel
            title="Simular liquidación del comprador"
            sub="Precio base, bonificaciones por calidad y descuentos. Tablas de ejemplo: use las de su comprador."
          >
            <div className="kf-grid">
              <label htmlFor="lq-e">
                Leche
                <select
                  id="lq-e"
                  value={liq.especie}
                  onChange={(e) => {
                    const es = e.target.value as "bovino" | "bufalino";
                    setLiq({
                      ...liq,
                      especie: es,
                      base: es === "bovino" ? 1850 : 3600,
                      grasa: es === "bovino" ? 3.9 : 7.8,
                      proteina: es === "bovino" ? 3.2 : 4.4,
                    });
                  }}
                >
                  <option value="bovino">Bovina</option>
                  <option value="bufalino">Búfala</option>
                </select>
              </label>
              <label htmlFor="lq-d">
                Período
                <select
                  id="lq-d"
                  value={liq.dias}
                  onChange={(e) => setLiq({ ...liq, dias: Number(e.target.value) })}
                >
                  <option value={7}>7 días</option>
                  <option value={14}>14 días (quincena)</option>
                </select>
              </label>
              {(
                [
                  ["base", "Precio base ($/L)"],
                  ["grasa", "Grasa (%)"],
                  ["proteina", "Proteína (%)"],
                  ["ccs", "Células somáticas (mil/mL)"],
                  ["ufc", "UFC (mil/mL)"],
                  ["transporte", "Transporte ($/L)"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} htmlFor={`lq-${k}`}>
                  {l}
                  <input
                    id={`lq-${k}`}
                    type="number"
                    step="any"
                    value={liq[k]}
                    onChange={(e) => setLiq({ ...liq, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Liquidación" sub={`${num(litros, 0)} litros en ${liq.dias} días`}>
            <ul className="kit-facts big">
              <li>
                <span>Precio base</span>
                <b>{money(liq.base)} /L</b>
              </li>
              <li>
                <span>Bonificación por grasa</span>
                <b className="pos">+ {money(bonGrasa)}</b>
              </li>
              <li>
                <span>Bonificación por proteína</span>
                <b className="pos">+ {money(bonProt)}</b>
              </li>
              <li>
                <span>Higiene (células somáticas)</span>
                <b className={bonHig >= 0 ? "pos" : "neg"}>
                  {bonHig >= 0 ? "+" : "−"} {money(Math.abs(bonHig))}
                </b>
              </li>
              <li>
                <span>Calidad bacteriológica (UFC)</span>
                <b className={bonUfc >= 0 ? "pos" : "neg"}>
                  {bonUfc >= 0 ? "+" : "−"} {money(Math.abs(bonUfc))}
                </b>
              </li>
              <li>
                <span>Precio por litro</span>
                <b>{money(precioFinal)}</b>
              </li>
              <li>
                <span>Valor bruto</span>
                <b>{money(bruto)}</b>
              </li>
              <li>
                <span>Cuota de fomento ({num(CUOTA_FOMENTO_LECHE * 100, 2)} %)</span>
                <b className="neg">− {money(cuota)}</b>
              </li>
              <li>
                <span>Transporte</span>
                <b className="neg">− {money(transp)}</b>
              </li>
              <li>
                <span>Retención en la fuente (1,5 %, ejemplo)</span>
                <b className="neg">− {money(reten)}</b>
              </li>
              <li>
                <span>
                  <strong>Neto a recibir</strong>
                </span>
                <b>{money(netoLiq)}</b>
              </li>
            </ul>
            <p className="hint">
              Tarifas y bonificaciones de referencia; confirme las vigentes con su comprador y su
              contador.
            </p>
          </Panel>
        </div>
      )}

      {tab === "ganado" && (
        <Panel
          title="Venta de ganado"
          sub="Peso, precio por kilo y guía sanitaria de movilización del ICA."
        >
          <DataTable
            cols={[
              {
                key: "f",
                label: "Fecha",
                sort: (s: CattleSale) => s.fecha,
                render: (s) => fmtDate(s.fecha),
              },
              { key: "a", label: "Animal", render: (s) => <b className="mono">{s.animal}</b> },
              { key: "c", label: "Categoría", render: (s) => s.categoria },
              {
                key: "p",
                label: "Peso (kg)",
                align: "right",
                sort: (s) => s.pesoKg,
                render: (s) => num(s.pesoKg, 0),
              },
              { key: "k", label: "$/kg", align: "right", render: (s) => money(s.precioKg) },
              {
                key: "v",
                label: "Valor",
                align: "right",
                sort: (s) => s.pesoKg * s.precioKg,
                render: (s) => <b>{money(s.pesoKg * s.precioKg)}</b>,
              },
              { key: "b", label: "Comprador", render: (s) => s.comprador },
              { key: "g", label: "Guía ICA", render: (s) => s.guiaICA },
              {
                key: "e",
                label: "Estado",
                render: (s) => (
                  <Badge tone={s.estado === "Pagada" ? "verde" : "ambar"}>{s.estado}</Badge>
                ),
              },
            ]}
            rows={[...sales].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(s) => `${s.animal} ${s.comprador} ${s.guiaICA}`}
          />
          <p className="hint">
            Antes de mover animales verifique vacunas vigentes y que no estén en retiro (módulo
            Sanidad).
          </p>
        </Panel>
      )}

      {tab === "clientes" && (
        <Panel title="Clientes y cartera" sub="Saldo, vencido y días de mora.">
          <DataTable
            cols={[
              {
                key: "n",
                label: "Cliente",
                sort: (c: Client) => c.nombre,
                render: (c) => (
                  <>
                    <b>{c.nombre}</b>
                    <br />
                    <small className="hint">NIT {c.nit}</small>
                  </>
                ),
              },
              { key: "t", label: "Tipo", render: (c) => <Badge tone="azul">{c.tipo}</Badge> },
              {
                key: "f",
                label: "Teléfono",
                render: (c) => <a href={`tel:${c.telefono.replace(/\s/g, "")}`}>{c.telefono}</a>,
              },
              { key: "p", label: "Plazo", align: "right", render: (c) => `${c.plazo} d` },
              {
                key: "s",
                label: "Saldo",
                align: "right",
                sort: (c) => c.saldo,
                render: (c) => money(c.saldo),
              },
              {
                key: "v",
                label: "Vencido",
                align: "right",
                sort: (c) => c.vencido,
                render: (c) => (c.vencido ? <b className="neg">{money(c.vencido)}</b> : "—"),
              },
              {
                key: "m",
                label: "Mora",
                render: (c) => (
                  <Badge tone={c.diasMora === 0 ? "verde" : c.diasMora < 30 ? "ambar" : "rojo"}>
                    {c.diasMora === 0 ? "Al día" : `${c.diasMora} días`}
                  </Badge>
                ),
              },
            ]}
            rows={clients}
            search={(c) => `${c.nombre} ${c.nit}`}
          />
        </Panel>
      )}

      {tab === "precios" && (
        <div className="kit-grid2">
          <Panel title="Precio pagado por litro" sub="Últimos 6 meses, de ejemplo">
            <LineChart
              labels={["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"]}
              series={[
                { name: "Bovina", tone: "azul", points: [1790, 1810, 1835, 1840, 1880, 1885] },
                { name: "Búfala", tone: "violeta", points: [3500, 3520, 3600, 3650, 3700, 3780] },
              ]}
              height={200}
            />
          </Panel>
          <Panel title="Ganado en pie" sub="Precio por kilo, de ejemplo">
            <ul className="kit-facts big">
              <li>
                <span>Macho de levante</span>
                <b>{money(9200)} /kg</b>
              </li>
              <li>
                <span>Vaca de descarte</span>
                <b>{money(6200)} /kg</b>
              </li>
              <li>
                <span>Bucerro</span>
                <b>{money(8100)} /kg</b>
              </li>
              <li>
                <span>Novilla de vientre</span>
                <b>{money(8800)} /kg</b>
              </li>
            </ul>
            <p className="hint">
              Consulte las subastas y el precio de referencia de su región antes de negociar.
            </p>
          </Panel>
        </div>
      )}

      {open === "entrega" && (
        <FormDialog
          open
          title="Registrar entrega de leche"
          fields={[
            { name: "fecha", label: "Fecha", type: "date" },
            {
              name: "comprador",
              label: "Comprador",
              type: "select",
              options: clients
                .filter((c) => c.tipo === "Planta" || c.tipo === "Quesera")
                .map((c) => c.nombre),
            },
            { name: "especie", label: "Leche", type: "select", options: ["bovino", "bufalino"] },
            { name: "litros", label: "Litros", type: "number" },
            { name: "precio", label: "Precio base ($/L)", type: "number", value: "1850" },
            { name: "guia", label: "Número de planilla", type: "text" },
          ]}
          preview={(v) =>
            Number(v.litros) ? (
              <p className="hint">
                Valor estimado: <b>{money(Number(v.litros) * Number(v.precio))}</b>
              </p>
            ) : null
          }
          onSubmit={(v) => {
            addDel({
              fecha: v.fecha ?? iso(today()),
              comprador: v.comprador ?? "",
              especie: v.especie === "bufalino" ? "bufalino" : "bovino",
              litros: Number(v.litros),
              precioBase: Number(v.precio),
              bonificacion: 0,
              descuento: 0,
              guia: v.guia ?? "",
            });
            setOpen(null);
            notify("Entrega registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "ganado" && (
        <FormDialog
          open
          title="Vender ganado"
          sub="Necesita la guía sanitaria de movilización interna (GSMI) del ICA."
          fields={[
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "animal", label: "Animal", type: "text", placeholder: "Ej. BOV-020" },
            {
              name: "categoria",
              label: "Categoría",
              type: "select",
              options: [
                "Macho de levante",
                "Vaca de descarte",
                "Novilla de vientre",
                "Bucerro",
                "Toro",
              ],
            },
            { name: "peso", label: "Peso (kg)", type: "number" },
            { name: "precio", label: "Precio por kg", type: "number", value: "9200" },
            {
              name: "comprador",
              label: "Comprador",
              type: "select",
              options: clients.map((c) => c.nombre),
            },
            { name: "guia", label: "Guía ICA", type: "text" },
          ]}
          preview={(v) =>
            Number(v.peso) ? (
              <p className="hint">
                Valor de la venta: <b>{money(Number(v.peso) * Number(v.precio))}</b>
              </p>
            ) : null
          }
          onSubmit={(v) => {
            addSale({
              fecha: v.fecha ?? iso(today()),
              animal: v.animal ?? "",
              categoria: v.categoria ?? "",
              pesoKg: Number(v.peso),
              precioKg: Number(v.precio),
              comprador: v.comprador ?? "",
              guiaICA: v.guia ?? "",
              estado: "Por cobrar",
            });
            setOpen(null);
            notify("Venta registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "cliente" && (
        <FormDialog
          open
          title="Nuevo cliente"
          fields={[
            { name: "nombre", label: "Nombre o razón social", type: "text" },
            { name: "nit", label: "NIT o cédula", type: "text" },
            {
              name: "tipo",
              label: "Tipo",
              type: "select",
              options: ["Planta", "Quesera", "Frigorífico", "Subasta", "Particular"],
            },
            { name: "telefono", label: "Teléfono", type: "text" },
            { name: "plazo", label: "Plazo de pago (días)", type: "number", value: "15" },
          ]}
          onSubmit={(v) => {
            addClient({
              nombre: v.nombre ?? "",
              nit: v.nit ?? "",
              tipo: (v.tipo as Client["tipo"]) ?? "Particular",
              telefono: v.telefono ?? "",
              plazo: Number(v.plazo),
              saldo: 0,
              vencido: 0,
              diasMora: 0,
            });
            setOpen(null);
            notify("Cliente creado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
