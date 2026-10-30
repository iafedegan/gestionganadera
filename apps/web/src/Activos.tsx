import { Fuel, Tractor, Wrench } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import { ASSETS, type Asset, FUEL, MAINT_LOG, MAINT_PLAN, type MaintLog } from "./erpData";
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
  addDays,
  daysBetween,
  daysFromNow,
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

type Tab = "panel" | "inventario" | "mantenimiento" | "historial" | "combustible" | "ordeno";
const EST_TONE: Record<Asset["estado"], Tone> = {
  Operativo: "verde",
  "En mantenimiento": "ambar",
  "Fuera de servicio": "rojo",
};

/** Depreciación en línea recta. */
export function depreciation(a: Asset) {
  const years = daysBetween(a.compra, iso(today())) / 365;
  const anual = (a.costo - a.residual) / a.vidaAnios;
  const acumulada = Math.min(a.costo - a.residual, anual * years);
  return {
    anual,
    acumulada,
    libros: a.costo - acumulada,
    pctVida: Math.min(100, (years / a.vidaAnios) * 100),
  };
}

export function ActivosScreen() {
  const { notify } = useApp();
  const [assets, addAsset, resetA] = useStore<Asset>("activos", ASSETS);
  const [log, addLog, resetL] = useStore<MaintLog>("mant-log", MAINT_LOG);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"activo" | "mant" | null>(null);
  const [check, setCheck] = useState<Record<string, boolean>>({});

  const tractorHoras = assets.find((a) => a.codigo === "MQ-01")?.horas ?? 0;
  const plan = MAINT_PLAN.map((p) => {
    const done = log
      .filter(
        (l) =>
          l.codigo === p.codigo &&
          l.trabajo.toLowerCase().includes(p.tarea.split(" ")[0]?.toLowerCase() ?? ""),
      )
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    const ultima = done && done.fecha > p.ultima ? done.fecha : p.ultima;
    if (p.cadaHoras) {
      const restantes = (p.ultimasHoras ?? 0) + p.cadaHoras - tractorHoras;
      return {
        p,
        ultima,
        proxima: `${num((p.ultimasHoras ?? 0) + p.cadaHoras, 0)} h`,
        resta: restantes,
        unidad: "h",
        tone: (restantes < 0 ? "rojo" : restantes < 50 ? "ambar" : "verde") as Tone,
        pct: ((p.cadaHoras - restantes) / p.cadaHoras) * 100,
      };
    }
    const prox = addDays(ultima, p.cadaDias ?? 30);
    const resta = daysFromNow(prox);
    return {
      p,
      ultima,
      proxima: fmtDate(prox),
      resta,
      unidad: "d",
      tone: (resta < 0 ? "rojo" : resta < 15 ? "ambar" : "verde") as Tone,
      pct: (((p.cadaDias ?? 30) - resta) / (p.cadaDias ?? 30)) * 100,
    };
  });
  const vencidos = plan.filter((x) => x.resta < 0);
  const proximos = plan.filter((x) => x.resta >= 0 && x.tone === "ambar");
  const valor = assets.reduce((s, a) => s + depreciation(a).libros, 0);
  const costoMant = log
    .filter((l) => daysBetween(l.fecha, iso(today())) <= 90)
    .reduce((s, l) => s + l.costo, 0);
  const nameOf = (c: string) => assets.find((a) => a.codigo === c)?.nombre ?? c;

  const alerts: AlertItem[] = [
    ...vencidos.map((x) => ({
      tone: "rojo" as Tone,
      title: `${nameOf(x.p.codigo)} · ${x.p.tarea}`,
      text: `Vencido hace ${Math.abs(Math.round(x.resta))} ${x.unidad === "h" ? "horas" : "días"}. Costo estimado ${money(x.p.costo)}.`,
      action: { label: "Registrar", run: () => setOpen("mant") },
    })),
    ...proximos.map((x) => ({
      tone: "ambar" as Tone,
      title: `${nameOf(x.p.codigo)} · ${x.p.tarea}`,
      text: `Faltan ${Math.round(x.resta)} ${x.unidad === "h" ? "horas" : "días"} (${x.proxima}).`,
    })),
    ...assets
      .filter((a) => a.estado !== "Operativo")
      .map((a) => ({
        tone: EST_TONE[a.estado],
        title: `${a.nombre} · ${a.estado.toLowerCase()}`,
        text: `Ubicación: ${a.ubicacion}.`,
      })),
  ];

  const invCols: Col<Asset>[] = [
    {
      key: "c",
      label: "Código",
      sort: (a) => a.codigo,
      render: (a) => <b className="mono">{a.codigo}</b>,
    },
    {
      key: "n",
      label: "Activo",
      sort: (a) => a.nombre,
      render: (a) => (
        <>
          <b>{a.nombre}</b>
          <br />
          <small className="hint">
            {a.tipo} · {a.ubicacion}
          </small>
        </>
      ),
    },
    {
      key: "e",
      label: "Estado",
      render: (a) => <Badge tone={EST_TONE[a.estado]}>{a.estado}</Badge>,
    },
    {
      key: "k",
      label: "Costo",
      align: "right",
      sort: (a) => a.costo,
      render: (a) => moneyM(a.costo),
    },
    {
      key: "d",
      label: "Depreciación anual",
      align: "right",
      render: (a) => moneyM(depreciation(a).anual),
    },
    {
      key: "l",
      label: "Valor en libros",
      align: "right",
      sort: (a) => depreciation(a).libros,
      render: (a) => <b>{moneyM(depreciation(a).libros)}</b>,
    },
    {
      key: "v",
      label: "Vida útil usada",
      render: (a) => (
        <Progress
          value={depreciation(a).pctVida}
          tone={
            depreciation(a).pctVida > 85 ? "rojo" : depreciation(a).pctVida > 60 ? "ambar" : "verde"
          }
          right={`${num(depreciation(a).pctVida, 0)} % de ${a.vidaAnios} años`}
        />
      ),
    },
  ];

  const CHECKS = [
    "Pezoneras sin grietas ni deformaciones",
    "Nivel de vacío estable en el manómetro",
    "Pulsadores con ritmo uniforme",
    "Mangueras limpias y sin fugas",
    "Lavado del equipo con detergente alcalino y ácido",
    "Tanque a 4 °C o menos dentro de las 2 horas",
    "Filtro de leche cambiado en cada ordeño",
  ];

  return (
    <section className="page">
      <PageHead
        kicker="Maquinaria y activos"
        icon={<Tractor size={30} aria-hidden="true" />}
        title="Maquinaria, equipos e infraestructura"
        lead="Inventario con depreciación, plan de mantenimiento por días u horas, historial, combustible y equipo de ordeño."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("mant")}>
              Registrar mantenimiento
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("activo")}>
              Nuevo activo
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          Depreciación en línea recta con valor residual; ajústela a su política contable.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetA();
            resetL();
            setCheck({});
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
          { key: "inventario", label: "Inventario", badge: assets.length },
          { key: "mantenimiento", label: "Plan de mantenimiento", badge: vencidos.length },
          { key: "historial", label: "Historial" },
          { key: "combustible", label: "Combustible y horas" },
          { key: "ordeno", label: "Equipo de ordeño" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="azul"
              icon={<Tractor size={18} />}
              label="Activos"
              value={assets.length}
              meta={`${assets.filter((a) => a.estado === "Operativo").length} operativos`}
            />
            <Stat
              tone="verde"
              label="Valor en libros"
              value={moneyM(valor)}
              meta={`Costo histórico ${moneyM(assets.reduce((s, a) => s + a.costo, 0))}`}
            />
            <Stat
              tone="rojo"
              icon={<Wrench size={18} />}
              label="Mantenimientos vencidos"
              value={vencidos.length}
              meta={`${proximos.length} próximos`}
            />
            <Stat
              tone="violeta"
              label="Costo de mantenimiento (90 días)"
              value={moneyM(costoMant)}
              meta={`${log.filter((l) => l.tipo === "Correctivo").length} correctivos en el historial`}
            />
            <Stat
              tone="ambar"
              icon={<Fuel size={18} />}
              label="Horómetro del tractor"
              value={`${num(tractorHoras, 0)} h`}
              meta={`${num((FUEL.at(-1)?.galones ?? 0) / Math.max(1, FUEL.at(-1)?.horas ?? 1), 2)} galones por hora`}
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Atención" sub="Mantenimientos y equipos detenidos">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Valor en libros por tipo" sub="Millones de pesos">
              <Donut
                slices={(
                  [
                    "Maquinaria",
                    "Equipo de ordeño",
                    "Vehículo",
                    "Instalación",
                    "Herramienta",
                  ] as const
                ).map((t, i) => ({
                  label: t,
                  value: assets
                    .filter((a) => a.tipo === t)
                    .reduce((s, a) => s + depreciation(a).libros, 0),
                  tone: (["azul", "violeta", "ambar", "verde", "gris"] as Tone[])[i] ?? "gris",
                }))}
                format={(n) => moneyM(n)}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "inventario" && (
        <Panel title="Inventario de activos" sub="Con depreciación acumulada y vida útil.">
          <DataTable
            cols={invCols}
            rows={assets}
            search={(a) => `${a.codigo} ${a.nombre} ${a.tipo} ${a.ubicacion}`}
            toolbar={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    "activos",
                    [
                      "Código",
                      "Activo",
                      "Tipo",
                      "Estado",
                      "Costo",
                      "Depreciación acumulada",
                      "Valor en libros",
                    ],
                    assets.map((a) => [
                      a.codigo,
                      a.nombre,
                      a.tipo,
                      a.estado,
                      a.costo,
                      Math.round(depreciation(a).acumulada),
                      Math.round(depreciation(a).libros),
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

      {tab === "mantenimiento" && (
        <Panel
          title="Plan de mantenimiento preventivo"
          sub="Por días transcurridos o por horas del horómetro."
        >
          <DataTable
            cols={[
              {
                key: "a",
                label: "Activo",
                render: (x: (typeof plan)[number]) => <b>{nameOf(x.p.codigo)}</b>,
              },
              { key: "t", label: "Tarea", render: (x) => x.p.tarea },
              {
                key: "f",
                label: "Frecuencia",
                render: (x) =>
                  x.p.cadaHoras ? `Cada ${x.p.cadaHoras} h` : `Cada ${x.p.cadaDias} días`,
              },
              { key: "u", label: "Última", render: (x) => fmtDate(x.ultima) },
              { key: "p", label: "Próxima", render: (x) => x.proxima },
              {
                key: "r",
                label: "Avance",
                render: (x) => (
                  <Progress
                    value={Math.max(0, Math.min(100, x.pct))}
                    tone={x.tone}
                    right={
                      x.resta < 0
                        ? `Vencido ${Math.abs(Math.round(x.resta))} ${x.unidad}`
                        : `Faltan ${Math.round(x.resta)} ${x.unidad}`
                    }
                  />
                ),
              },
              {
                key: "c",
                label: "Costo estimado",
                align: "right",
                render: (x) => money(x.p.costo),
              },
            ]}
            rows={[...plan].sort((a, b) => a.resta - b.resta)}
          />
        </Panel>
      )}

      {tab === "historial" && (
        <Panel
          title="Historial de mantenimiento"
          sub="Preventivos y correctivos con proveedor y costo."
        >
          <DataTable
            cols={[
              {
                key: "f",
                label: "Fecha",
                sort: (l: MaintLog) => l.fecha,
                render: (l) => fmtDate(l.fecha),
              },
              { key: "a", label: "Activo", render: (l) => <b>{nameOf(l.codigo)}</b> },
              {
                key: "t",
                label: "Tipo",
                render: (l) => (
                  <Badge tone={l.tipo === "Preventivo" ? "verde" : "rojo"}>{l.tipo}</Badge>
                ),
              },
              { key: "w", label: "Trabajo", render: (l) => l.trabajo },
              { key: "p", label: "Proveedor", render: (l) => l.proveedor },
              {
                key: "c",
                label: "Costo",
                align: "right",
                sort: (l) => l.costo,
                render: (l) => money(l.costo),
              },
            ]}
            rows={[...log].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(l) => `${nameOf(l.codigo)} ${l.trabajo} ${l.proveedor}`}
          />
        </Panel>
      )}

      {tab === "combustible" && (
        <div className="kit-grid2">
          <Panel
            title="Consumo de combustible del tractor"
            sub="Galones por mes"
            icon={<Fuel size={20} />}
          >
            <BarChart
              labels={FUEL.map((f) => f.mes)}
              series={[
                { name: "Galones", tone: "ambar", values: FUEL.map((f) => f.galones) },
                { name: "Horas de uso", tone: "azul", values: FUEL.map((f) => f.horas) },
              ]}
              height={190}
            />
          </Panel>
          <Panel title="Rendimiento" sub="Galones por hora de trabajo">
            <LineChart
              labels={FUEL.map((f) => f.mes)}
              series={[
                {
                  name: "Galones por hora",
                  tone: "violeta",
                  points: FUEL.map((f) => Math.round((f.galones / f.horas) * 100) / 100),
                },
              ]}
              height={190}
            />
            <p className="hint">
              Un aumento sostenido del consumo por hora suele indicar filtros sucios, inyectores o
              llantas con baja presión.
            </p>
          </Panel>
        </div>
      )}

      {tab === "ordeno" && (
        <div className="kit-grid2">
          <Panel title="Lista de chequeo del equipo de ordeño" sub="Hoy · marque lo verificado">
            <ul className="checklist">
              {CHECKS.map((c) => (
                <li key={c}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(check[c])}
                      onChange={(e) => setCheck({ ...check, [c]: e.target.checked })}
                    />
                    <span>{c}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Progress
              label="Verificado"
              value={Object.values(check).filter(Boolean).length}
              max={CHECKS.length}
              tone={
                Object.values(check).filter(Boolean).length === CHECKS.length ? "verde" : "ambar"
              }
              right={`${Object.values(check).filter(Boolean).length} de ${CHECKS.length}`}
            />
          </Panel>
          <Panel title="Vida útil de consumibles" sub="Referencias de reemplazo">
            <ul className="kit-facts">
              <li>
                <b>Pezoneras de caucho:</b> unos 2.500 ordeños o 6 meses, lo que ocurra primero.
              </li>
              <li>
                <b>Mangueras de leche:</b> revisión semestral; cambio si se endurecen o agrietan.
              </li>
              <li>
                <b>Diafragmas de pulsadores:</b> cambio anual.
              </li>
              <li>
                <b>Análisis dinámico del equipo:</b> al menos una vez al año por un técnico.
              </li>
            </ul>
          </Panel>
        </div>
      )}

      {open === "activo" && (
        <FormDialog
          open
          title="Nuevo activo"
          fields={[
            { name: "codigo", label: "Código", type: "text", placeholder: "Ej. MQ-03" },
            { name: "nombre", label: "Nombre", type: "text" },
            {
              name: "tipo",
              label: "Tipo",
              type: "select",
              options: ["Maquinaria", "Equipo de ordeño", "Vehículo", "Instalación", "Herramienta"],
            },
            { name: "ubicacion", label: "Ubicación", type: "text" },
            { name: "compra", label: "Fecha de compra", type: "date" },
            { name: "costo", label: "Costo (COP)", type: "number" },
            { name: "vida", label: "Vida útil (años)", type: "number", value: "10" },
            { name: "residual", label: "Valor residual (COP)", type: "number", value: "0" },
          ]}
          preview={(v) =>
            Number(v.costo) && Number(v.vida) ? (
              <p className="hint">
                Depreciación anual:{" "}
                <b>{money((Number(v.costo) - Number(v.residual)) / Number(v.vida))}</b>
              </p>
            ) : null
          }
          onSubmit={(v) => {
            addAsset({
              codigo: v.codigo ?? "",
              nombre: v.nombre ?? "",
              tipo: (v.tipo as Asset["tipo"]) ?? "Herramienta",
              ubicacion: v.ubicacion ?? "",
              estado: "Operativo",
              compra: v.compra ?? iso(today()),
              costo: Number(v.costo),
              vidaAnios: Number(v.vida) || 1,
              residual: Number(v.residual),
            });
            setOpen(null);
            notify("Activo registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "mant" && (
        <FormDialog
          open
          title="Registrar mantenimiento"
          fields={[
            {
              name: "codigo",
              label: "Activo",
              type: "select",
              options: assets.map((a) => `${a.codigo} · ${a.nombre}`),
            },
            { name: "fecha", label: "Fecha", type: "date" },
            { name: "tipo", label: "Tipo", type: "select", options: ["Preventivo", "Correctivo"] },
            { name: "trabajo", label: "Trabajo realizado", type: "textarea" },
            { name: "proveedor", label: "Proveedor", type: "text", value: "Interno" },
            { name: "costo", label: "Costo (COP)", type: "number", value: "0" },
          ]}
          onSubmit={(v) => {
            addLog({
              codigo: (v.codigo ?? "").split(" · ")[0] ?? "",
              fecha: v.fecha ?? iso(today()),
              tipo: (v.tipo as MaintLog["tipo"]) ?? "Preventivo",
              trabajo: v.trabajo ?? "",
              proveedor: v.proveedor ?? "",
              costo: Number(v.costo),
            });
            setOpen(null);
            notify("Mantenimiento registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
