import { BookOpen, CalendarClock, FileCheck2, HandCoins, Landmark } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import {
  INVOICES,
  type Invoice,
  LEDGER as LEDGER_DEMO,
  OBLIGATIONS as OBLIGATIONS_DEMO,
  PAYABLES,
  type Payable,
} from "./erpData";
import {
  type AlertItem,
  Alerts,
  Badge,
  BarChart,
  type Col,
  DataTable,
  FormDialog,
  Panel,
  Stat,
  Tabs,
  Timeline,
  type Tone,
  addDays,
  daysFromNow,
  demoOnly,
  downloadCsv,
  fmtDate,
  iso,
  money,
  moneyM,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "facturas" | "cobrar" | "pagar" | "obligaciones" | "balance";
const DIAN_TONE: Record<Invoice["estado"], Tone> = {
  "Aceptada DIAN": "verde",
  Pendiente: "ambar",
  Rechazada: "rojo",
};
const total = (i: Invoice) => i.base + i.iva - i.retencion;

export function ContabilidadScreen() {
  // Datos de ejemplo solo en la cuenta demo; las cuentas reales empiezan vacías.
  const LEDGER = demoOnly(LEDGER_DEMO);
  const OBLIGATIONS = demoOnly(OBLIGATIONS_DEMO);
  const { notify } = useApp();
  const [invBase, addInv, resetI] = useStore<Invoice>("facturas", INVOICES);
  const [paidInv, addPaidInv, resetPI] = useStore<string>("facturas-pagadas", []);
  const [payBase, addPay, resetP] = useStore<Payable>("por-pagar", PAYABLES);
  const [paidPay, addPaidPay, resetPP] = useStore<string>("pagos", []);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"factura" | "pagar" | null>(null);

  const invoices = invBase.map((i) => ({ ...i, pagada: i.pagada || paidInv.includes(i.numero) }));
  const payables = payBase.map((p) => ({
    ...p,
    pagada: p.pagada || paidPay.includes(`${p.proveedor}|${p.concepto}`),
  }));
  const porCobrar = invoices.filter((i) => !i.pagada && i.estado !== "Rechazada");
  const porPagar = payables.filter((p) => !p.pagada);
  const aging = [
    { l: "Por vencer", f: (d: number) => d >= 0 },
    { l: "1–30 días", f: (d: number) => d < 0 && d >= -30 },
    { l: "31–60 días", f: (d: number) => d < -30 && d >= -60 },
    { l: "Más de 60", f: (d: number) => d < -60 },
  ].map((b) => ({
    l: b.l,
    v: porCobrar.filter((i) => b.f(daysFromNow(i.vence))).reduce((s, i) => s + total(i), 0),
  }));
  const debitos = LEDGER.reduce((s, c) => s + c.debito, 0);
  const creditos = LEDGER.reduce((s, c) => s + c.credito, 0);

  const alerts: AlertItem[] = [
    ...invoices
      .filter((i) => i.estado === "Rechazada")
      .map((i) => ({
        tone: "rojo" as Tone,
        title: `Factura ${i.numero} rechazada`,
        text: `${i.cliente} · ${money(total(i))}. Corrija los datos y vuelva a emitir (nota crédito si aplica).`,
      })),
    ...invoices
      .filter((i) => i.estado === "Pendiente")
      .map((i) => ({
        tone: "ambar" as Tone,
        title: `Factura ${i.numero} pendiente de validación`,
        text: "El proveedor tecnológico aún no confirma la aceptación.",
      })),
    ...porPagar
      .filter((p) => daysFromNow(p.vence) < 0)
      .map((p) => ({
        tone: "rojo" as Tone,
        title: `Pago vencido · ${p.proveedor}`,
        text: `${p.concepto} · ${money(p.valor)} · venció ${fmtDate(p.vence)}`,
        action: {
          label: "Pagar",
          run: () => {
            addPaidPay(`${p.proveedor}|${p.concepto}`);
            notify("Pago registrado.", "ok");
          },
        },
      })),
    ...OBLIGATIONS.filter((o) => daysFromNow(o.fecha) <= 12).map((o) => ({
      tone: "azul" as Tone,
      title: o.obligacion,
      text: `${o.entidad} · ${fmtDate(o.fecha)} (en ${daysFromNow(o.fecha)} días)`,
    })),
  ];

  const invCols: Col<Invoice>[] = [
    {
      key: "n",
      label: "Número",
      sort: (i) => i.numero,
      render: (i) => <b className="mono">{i.numero}</b>,
    },
    { key: "f", label: "Fecha", sort: (i) => i.fecha, render: (i) => fmtDate(i.fecha) },
    { key: "c", label: "Cliente", sort: (i) => i.cliente, render: (i) => i.cliente },
    { key: "o", label: "Concepto", render: (i) => i.concepto },
    { key: "b", label: "Base", align: "right", render: (i) => money(i.base) },
    { key: "i", label: "IVA", align: "right", render: (i) => (i.iva ? money(i.iva) : "—") },
    {
      key: "r",
      label: "Retención",
      align: "right",
      render: (i) => (i.retencion ? `− ${money(i.retencion)}` : "—"),
    },
    {
      key: "t",
      label: "Total",
      align: "right",
      sort: (i) => total(i),
      render: (i) => <b>{money(total(i))}</b>,
    },
    {
      key: "e",
      label: "DIAN",
      render: (i) => <Badge tone={DIAN_TONE[i.estado]}>{i.estado}</Badge>,
    },
    {
      key: "p",
      label: "Pago",
      render: (i) =>
        i.pagada ? (
          <Badge tone="verde">Pagada</Badge>
        ) : (
          <Badge tone={daysFromNow(i.vence) < 0 ? "rojo" : "gris"}>Vence {fmtDate(i.vence)}</Badge>
        ),
    },
  ];

  return (
    <section className="page">
      <PageHead
        kicker="Contabilidad y fiscal"
        icon={<Landmark size={30} aria-hidden="true" />}
        title="Contabilidad, impuestos y facturación"
        lead="Facturación electrónica, cartera, cuentas por pagar, obligaciones y balance de prueba, listos para su contador."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("factura")}>
              Emitir factura
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("pagar")}>
              Cuenta por pagar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                downloadCsv(
                  "balance-prueba",
                  ["Cuenta", "Nombre", "Débito", "Crédito"],
                  LEDGER.map((c) => [c.cuenta, c.nombre, c.debito, c.credito]),
                )
              }
            >
              Exportar para el contador
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          La emisión real se hace con un proveedor tecnológico autorizado por la DIAN; aquí se
          simula. Tarifas de referencia: confírmelas con su contador.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetI();
            resetPI();
            resetP();
            resetPP();
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
          { key: "facturas", label: "Facturas", badge: invoices.length },
          { key: "cobrar", label: "Por cobrar", badge: porCobrar.length },
          { key: "pagar", label: "Por pagar", badge: porPagar.length },
          { key: "obligaciones", label: "Obligaciones" },
          { key: "balance", label: "Balance de prueba" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="verde"
              icon={<FileCheck2 size={18} />}
              label="Facturado (30 días)"
              value={moneyM(
                invoices
                  .filter((i) => i.estado !== "Rechazada" && daysFromNow(i.fecha) >= -30)
                  .reduce((s, i) => s + i.base, 0),
              )}
              meta={`${invoices.filter((i) => i.estado === "Aceptada DIAN").length} aceptadas por la DIAN`}
            />
            <Stat
              tone="azul"
              icon={<HandCoins size={18} />}
              label="Por cobrar"
              value={moneyM(porCobrar.reduce((s, i) => s + total(i), 0))}
              meta={`${moneyM(aging.slice(1).reduce((s, a) => s + a.v, 0))} vencido`}
            />
            <Stat
              tone="rojo"
              label="Por pagar"
              value={moneyM(porPagar.reduce((s, p) => s + p.valor, 0))}
              meta={`${porPagar.filter((p) => daysFromNow(p.vence) < 0).length} vencidas`}
            />
            <Stat
              tone="violeta"
              icon={<CalendarClock size={18} />}
              label="Próxima obligación"
              value={
                OBLIGATIONS[0]
                  ? `${daysFromNow([...OBLIGATIONS].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0]?.fecha ?? "")} días`
                  : "—"
              }
              meta={
                [...OBLIGATIONS].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0]?.obligacion ?? ""
              }
            />
            <Stat
              tone="ambar"
              label="Retenciones que le practicaron"
              value={moneyM(invoices.reduce((s, i) => s + i.retencion, 0))}
              meta="Descontables en la declaración"
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Atención" sub="Facturas, pagos y fechas fiscales">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Cartera por edades" sub="Facturas por cobrar">
              <BarChart
                labels={aging.map((a) => a.l)}
                series={[
                  {
                    name: "Valor (M)",
                    tone: "azul",
                    values: aging.map((a) => Math.round(a.v / 1e5) / 10),
                  },
                ]}
                height={180}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "facturas" && (
        <Panel title="Facturas electrónicas" sub="Estado de validación y pago.">
          <DataTable
            cols={invCols}
            rows={[...invoices].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(i) => `${i.numero} ${i.cliente} ${i.concepto}`}
            toolbar={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    "facturas",
                    [
                      "Número",
                      "Fecha",
                      "Cliente",
                      "Concepto",
                      "Base",
                      "IVA",
                      "Retención",
                      "Total",
                      "Estado DIAN",
                      "Pagada",
                    ],
                    invoices.map((i) => [
                      i.numero,
                      i.fecha,
                      i.cliente,
                      i.concepto,
                      i.base,
                      i.iva,
                      i.retencion,
                      total(i),
                      i.estado,
                      i.pagada ? "Sí" : "No",
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

      {tab === "cobrar" && (
        <Panel title="Cuentas por cobrar" sub="Registre el pago cuando el cliente consigne.">
          <DataTable
            cols={[
              {
                key: "n",
                label: "Factura",
                render: (i: Invoice) => <b className="mono">{i.numero}</b>,
              },
              { key: "c", label: "Cliente", render: (i) => i.cliente },
              {
                key: "t",
                label: "Valor",
                align: "right",
                sort: (i) => total(i),
                render: (i) => money(total(i)),
              },
              {
                key: "v",
                label: "Vence",
                sort: (i) => i.vence,
                render: (i) => (
                  <Badge
                    tone={
                      daysFromNow(i.vence) < 0
                        ? "rojo"
                        : daysFromNow(i.vence) <= 5
                          ? "ambar"
                          : "verde"
                    }
                  >
                    {daysFromNow(i.vence) < 0
                      ? `Vencida hace ${-daysFromNow(i.vence)} d`
                      : `En ${daysFromNow(i.vence)} d`}
                  </Badge>
                ),
              },
              {
                key: "a",
                label: "Acción",
                render: (i) => (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      addPaidInv(i.numero);
                      notify(`Pago de ${i.numero} registrado.`, "ok");
                    }}
                  >
                    Registrar pago
                  </button>
                ),
              },
            ]}
            rows={[...porCobrar].sort((a, b) => (a.vence < b.vence ? -1 : 1))}
            empty="No hay facturas por cobrar."
          />
        </Panel>
      )}

      {tab === "pagar" && (
        <Panel title="Cuentas por pagar" sub="Proveedores y vencimientos.">
          <DataTable
            cols={[
              {
                key: "p",
                label: "Proveedor",
                render: (p: Payable) => (
                  <>
                    <b>{p.proveedor}</b>
                    <br />
                    <small className="hint">NIT {p.nit}</small>
                  </>
                ),
              },
              { key: "c", label: "Concepto", render: (p) => p.concepto },
              {
                key: "v",
                label: "Valor",
                align: "right",
                sort: (p) => p.valor,
                render: (p) => money(p.valor),
              },
              {
                key: "f",
                label: "Vence",
                sort: (p) => p.vence,
                render: (p) => (
                  <Badge
                    tone={
                      daysFromNow(p.vence) < 0
                        ? "rojo"
                        : daysFromNow(p.vence) <= 5
                          ? "ambar"
                          : "verde"
                    }
                  >
                    {fmtDate(p.vence)}
                  </Badge>
                ),
              },
              {
                key: "a",
                label: "Acción",
                render: (p) => (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      addPaidPay(`${p.proveedor}|${p.concepto}`);
                      notify("Pago registrado.", "ok");
                    }}
                  >
                    Marcar pagada
                  </button>
                ),
              },
            ]}
            rows={[...porPagar].sort((a, b) => (a.vence < b.vence ? -1 : 1))}
            empty="No hay cuentas por pagar."
          />
        </Panel>
      )}

      {tab === "obligaciones" && (
        <div className="kit-grid2">
          <Panel
            title="Calendario de obligaciones"
            sub="Fechas de ejemplo; las exactas dependen del calendario tributario del año y del NIT."
            icon={<CalendarClock size={20} />}
          >
            <Timeline
              items={[...OBLIGATIONS]
                .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                .map((o) => ({
                  date: o.fecha,
                  title: o.obligacion,
                  text: `${o.entidad} · en ${daysFromNow(o.fecha)} días`,
                  tone: daysFromNow(o.fecha) <= 12 ? "rojo" : "azul",
                }))}
            />
          </Panel>
          <Panel title="Notas tributarias del sector" sub="Para conversar con su contador">
            <ul className="kit-facts">
              <li>
                La leche cruda y el ganado en pie tienen un tratamiento especial de IVA: confirme
                cómo facturarlos.
              </li>
              <li>
                Las plantas y queseras suelen practicar retención en la fuente: guarde los
                certificados.
              </li>
              <li>
                La cuota de fomento ganadero y lechero se liquida sobre la leche vendida y el ganado
                sacrificado.
              </li>
              <li>Conserve facturas de compra de insumos: soportan costos y deducciones.</li>
            </ul>
          </Panel>
        </div>
      )}

      {tab === "balance" && (
        <Panel
          title="Balance de prueba"
          sub="Plan único de cuentas, cifras de ejemplo."
          icon={<BookOpen size={20} />}
        >
          <div className="ptable-wrap">
            <table className="ptable">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Nombre</th>
                  <th className="r">Débito</th>
                  <th className="r">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {LEDGER.map((c) => (
                  <tr key={c.cuenta}>
                    <td data-label="Cuenta">
                      <b className="mono">{c.cuenta}</b>
                    </td>
                    <td data-label="Nombre">{c.nombre}</td>
                    <td data-label="Débito" className="r">
                      {c.debito ? money(c.debito) : "—"}
                    </td>
                    <td data-label="Crédito" className="r">
                      {c.credito ? money(c.credito) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td data-label="Total">
                    <b>Total</b>
                  </td>
                  <td data-label="Cuadre">
                    {debitos === creditos ? (
                      <Badge tone="verde">Cuadrado</Badge>
                    ) : (
                      <Badge tone="rojo">Descuadre {money(Math.abs(debitos - creditos))}</Badge>
                    )}
                  </td>
                  <td data-label="Débito" className="r">
                    <b>{money(debitos)}</b>
                  </td>
                  <td data-label="Crédito" className="r">
                    <b>{money(creditos)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {open === "factura" && (
        <FormDialog
          open
          title="Emitir factura electrónica"
          sub="Simulación: en producción se envía al proveedor tecnológico y la DIAN la valida."
          fields={[
            {
              name: "cliente",
              label: "Cliente",
              type: "select",
              options: [
                "Lácteos del Valle",
                "Quesera La Esperanza",
                "Frigorífico Central",
                "Ganadería El Recreo",
                "Particular",
              ],
            },
            { name: "concepto", label: "Concepto", type: "text" },
            { name: "base", label: "Valor base (COP)", type: "number" },
            {
              name: "iva",
              label: "IVA",
              type: "select",
              options: ["Sin IVA (excluido o exento)", "19 %", "5 %"],
            },
            {
              name: "ret",
              label: "Retención que practicará el cliente",
              type: "select",
              options: ["1,5 %", "Ninguna", "2,5 %"],
            },
            { name: "plazo", label: "Plazo (días)", type: "number", value: "15" },
          ]}
          preview={(v) => {
            const b = Number(v.base);
            if (!b) return null;
            const iva = v.iva === "19 %" ? b * 0.19 : v.iva === "5 %" ? b * 0.05 : 0;
            const ret = v.ret === "1,5 %" ? b * 0.015 : v.ret === "2,5 %" ? b * 0.025 : 0;
            return (
              <ul className="kit-facts">
                <li>
                  IVA: <b>{money(iva)}</b>
                </li>
                <li>
                  Retención: <b>− {money(ret)}</b>
                </li>
                <li>
                  Total a recibir: <b>{money(b + iva - ret)}</b>
                </li>
              </ul>
            );
          }}
          onSubmit={(v) => {
            const b = Number(v.base);
            addInv({
              numero: `FE-0${483 + invBase.length - INVOICES.length}`,
              fecha: iso(today()),
              cliente: v.cliente ?? "",
              concepto: v.concepto ?? "",
              base: b,
              iva: v.iva === "19 %" ? b * 0.19 : v.iva === "5 %" ? b * 0.05 : 0,
              retencion: v.ret === "1,5 %" ? b * 0.015 : v.ret === "2,5 %" ? b * 0.025 : 0,
              estado: "Pendiente",
              vence: addDays(iso(today()), Number(v.plazo) || 15),
              pagada: false,
            });
            setOpen(null);
            setTab("facturas");
            notify("Factura emitida (simulada): queda pendiente de validación.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "pagar" && (
        <FormDialog
          open
          title="Nueva cuenta por pagar"
          fields={[
            { name: "proveedor", label: "Proveedor", type: "text" },
            { name: "nit", label: "NIT", type: "text" },
            { name: "concepto", label: "Concepto", type: "text" },
            { name: "valor", label: "Valor (COP)", type: "number" },
            { name: "vence", label: "Vence", type: "date" },
          ]}
          onSubmit={(v) => {
            addPay({
              proveedor: v.proveedor ?? "",
              nit: v.nit ?? "",
              concepto: v.concepto ?? "",
              valor: Number(v.valor),
              vence: v.vence ?? iso(today()),
              pagada: false,
            });
            setOpen(null);
            notify("Cuenta por pagar registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
