import { Pill, ShieldCheck, Syringe, TestTube } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHead } from "./components";
import {
  BOTIQUIN,
  CMT_LEVELS,
  CMT_SEED,
  type CmtRec,
  HEALTH_SEED,
  type HealthEvent,
  LACTATING,
  PRODUCTS,
  VACCINES,
  productOf,
  retiroActivo,
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
  Panel,
  Progress,
  Stat,
  Tabs,
  type Tone,
  addDays,
  daysBetween,
  daysFromNow,
  fmtDate,
  iso,
  money,
  moneyM,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "eventos" | "retiros" | "calendario" | "mastitis" | "botiquin";

const TIPO_TONE: Record<HealthEvent["tipo"], Tone> = {
  Vacunación: "verde",
  Tratamiento: "rojo",
  Desparasitación: "ambar",
  Diagnóstico: "azul",
  Control: "gris",
};
const CMT_TONE: Tone[] = ["verde", "verde", "ambar", "rojo", "rojo"];
const Q: ("AI" | "AD" | "PI" | "PD")[] = ["AI", "AD", "PI", "PD"];
const Q_LABEL = {
  AI: "Anterior izq.",
  AD: "Anterior der.",
  PI: "Posterior izq.",
  PD: "Posterior der.",
};

const animalTags = LACTATING.map((a) => a.tag);

export function SanidadScreen() {
  const { notify } = useApp();
  const [events, add, reset] = useStore<HealthEvent>("san", HEALTH_SEED);
  const [cmt, addCmt, resetCmt] = useStore<CmtRec>("cmt", CMT_SEED);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"evento" | "cmt" | null>(null);
  const [check, setCheck] = useState(animalTags[0] ?? "");

  const retiros = useMemo(
    () =>
      events
        .map((e) => ({ e, r: retiroActivo(e) }))
        .filter((x) => x.r.leche || x.r.carne)
        .sort((a, b) => ((a.r.leche ?? a.r.carne ?? "") < (b.r.leche ?? b.r.carne ?? "") ? -1 : 1)),
    [events],
  );
  const latestCmt = useMemo(() => {
    const m = new Map<string, CmtRec>();
    for (const r of [...cmt].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) m.set(r.tag, r);
    return [...m.values()];
  }, [cmt]);
  const positivos = latestCmt.filter((r) => Math.max(r.AI, r.AD, r.PI, r.PD) >= 4);
  const sospechosos = latestCmt.filter((r) => {
    const mx = Math.max(r.AI, r.AD, r.PI, r.PD);
    return mx === 3;
  });

  const vacState = VACCINES.map((v) => {
    const ev = events
      .filter((e) => e.producto === v.product)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    const since = ev ? daysBetween(ev.fecha, iso(today())) : null;
    const next = ev && v.intervalo < 9999 ? addDays(ev.fecha, v.intervalo) : null;
    const dueIn = next ? daysFromNow(next) : null;
    const tone: Tone = !ev
      ? "rojo"
      : dueIn === null
        ? "verde"
        : dueIn < 0
          ? "rojo"
          : dueIn < 30
            ? "ambar"
            : "verde";
    return { v, ev, since, next, dueIn, tone };
  });
  const cobertura = Math.round(
    (vacState.filter((s) => s.tone === "verde").length / vacState.length) * 100,
  );
  const costo90 = events
    .filter((e) => daysBetween(e.fecha, iso(today())) <= 90)
    .reduce((a, e) => a + e.costo, 0);
  const ev30 = events.filter((e) => daysBetween(e.fecha, iso(today())) <= 30).length;
  const botBajo = BOTIQUIN.filter((b) => b.cant < b.min || daysFromNow(b.vence) < 60);

  const alerts: AlertItem[] = [
    ...retiros.map(({ e, r }) => ({
      tone: "ambar" as Tone,
      title: `${e.sujeto} · en retiro`,
      text: `${e.producto}${r.leche ? ` · leche hasta ${fmtDate(r.leche)}` : ""}${r.carne ? ` · carne hasta ${fmtDate(r.carne)}` : ""}. No entregar leche ni sacrificar antes.`,
    })),
    ...vacState
      .filter((s) => s.tone !== "verde")
      .map((s) => ({
        tone: s.tone,
        title: `${s.v.name} · ${!s.ev ? "sin registro" : (s.dueIn ?? 0) < 0 ? "vencida" : "próxima"}`,
        text: s.ev
          ? `Última aplicación ${fmtDate(s.ev.fecha)}${s.next ? `; corresponde ${fmtDate(s.next)}` : ""}. ${s.v.aplica}.`
          : `${s.v.aplica}. ${s.v.nota}.`,
        action: { label: "Registrar", run: () => setOpen("evento") },
      })),
    ...positivos.map((r) => ({
      tone: "rojo" as Tone,
      title: `${r.tag} · CMT 3 (mastitis)`,
      text: "Ordeñe al final, tome muestra para cultivo y antibiograma, y no medique sin diagnóstico.",
    })),
    ...botBajo.map((b) => ({
      tone: "ambar" as Tone,
      title: `Botiquín · ${b.item}`,
      text:
        b.cant < b.min
          ? `Quedan ${b.cant}; el mínimo es ${b.min}.`
          : `Vence el ${fmtDate(b.vence)} (lote ${b.lote}).`,
    })),
  ].slice(0, 10);

  const porTipo = (
    ["Vacunación", "Tratamiento", "Desparasitación", "Diagnóstico", "Control"] as const
  ).map((t) => ({
    label: t,
    value: events.filter((e) => e.tipo === t).length,
    tone: TIPO_TONE[t],
  }));
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today().getFullYear(), today().getMonth() - 5 + i, 1);
    const sum = events
      .filter((e) => {
        const f = new Date(`${e.fecha}T12:00:00`);
        return f.getMonth() === d.getMonth() && f.getFullYear() === d.getFullYear();
      })
      .reduce((a, e) => a + e.costo, 0);
    return { l: d.toLocaleDateString("es-CO", { month: "short" }), v: sum / 1e6 };
  });

  const eventCols: Col<HealthEvent>[] = [
    { key: "f", label: "Fecha", sort: (e) => e.fecha, render: (e) => fmtDate(e.fecha) },
    {
      key: "t",
      label: "Tipo",
      sort: (e) => e.tipo,
      render: (e) => <Badge tone={TIPO_TONE[e.tipo]}>{e.tipo}</Badge>,
    },
    { key: "s", label: "Animal o lote", sort: (e) => e.sujeto, render: (e) => <b>{e.sujeto}</b> },
    { key: "p", label: "Producto", sort: (e) => e.producto, render: (e) => e.producto },
    { key: "m", label: "Motivo", render: (e) => e.motivo },
    {
      key: "r",
      label: "Retiro (leche / carne)",
      render: (e) =>
        e.retiroLeche || e.retiroCarne ? `${e.retiroLeche} d / ${e.retiroCarne} d` : "Sin retiro",
    },
    {
      key: "c",
      label: "Costo",
      align: "right",
      sort: (e) => e.costo,
      render: (e) => money(e.costo),
    },
  ];

  const saveEvent = (v: Record<string, string>) => {
    const p = productOf(v.producto ?? "");
    add({
      tipo: (v.tipo as HealthEvent["tipo"]) ?? "Tratamiento",
      sujeto: v.sujeto ?? "",
      fecha: v.fecha ?? iso(today()),
      producto: v.producto ?? "",
      motivo: v.motivo ?? "",
      dosis: v.dosis ?? p?.dosis ?? "",
      responsable: v.responsable ?? "",
      costo: Number(v.costo) || 0,
      retiroLeche: Number(v.retiroLeche ?? p?.retiroLeche ?? 0),
      retiroCarne: Number(v.retiroCarne ?? p?.retiroCarne ?? 0),
    });
    setOpen(null);
    notify("Evento sanitario registrado. Los retiros se calcularon solos.", "ok");
  };

  const chk = events
    .filter((e) => e.sujeto === check)
    .map((e) => ({ e, r: retiroActivo(e) }))
    .filter((x) => x.r.leche || x.r.carne);
  const chkLeche = chk
    .map((x) => x.r.leche)
    .filter(Boolean)
    .sort()
    .pop();
  const chkCarne = chk
    .map((x) => x.r.carne)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <section className="page">
      <PageHead
        kicker="Sanidad"
        icon={<ShieldCheck size={30} aria-hidden="true" />}
        title="Sanidad y bienestar"
        lead="Vacunación, tratamientos, retiros de leche y carne, mastitis y botiquín, con trazabilidad completa."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("evento")}>
              Registrar evento sanitario
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("cmt")}>
              Prueba CMT
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setTab("retiros")}>
              Verificar retiro
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          Los retiros son de referencia: siempre prevalecen el prospecto del producto y el criterio
          del veterinario.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            reset();
            resetCmt();
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
          { key: "eventos", label: "Eventos", badge: events.length },
          { key: "retiros", label: "Retiros", badge: retiros.length },
          { key: "calendario", label: "Calendario sanitario" },
          { key: "mastitis", label: "Mastitis (CMT)" },
          { key: "botiquin", label: "Botiquín", badge: botBajo.length },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="verde"
              icon={<Syringe size={18} />}
              label="Plan sanitario al día"
              value={`${cobertura} %`}
              meta={`${vacState.filter((s) => s.tone === "verde").length} de ${vacState.length} vacunas vigentes`}
              goal="100 %"
            />
            <Stat
              tone="ambar"
              icon={<Pill size={18} />}
              label="En retiro"
              value={retiros.length}
              meta="Tratamientos con retiro activo"
            />
            <Stat
              tone="azul"
              label="Eventos (30 días)"
              value={ev30}
              meta="Vacunas, tratamientos y controles"
            />
            <Stat
              tone="violeta"
              label="Costo sanitario (90 días)"
              value={moneyM(costo90)}
              meta={`${money(costo90 / Math.max(1, 90))} por día`}
            />
            <Stat
              tone="rojo"
              icon={<TestTube size={18} />}
              label="Mastitis CMT 3"
              value={positivos.length}
              meta={`${sospechosos.length} sospechosas (CMT 2)`}
            />
            <Stat
              tone="ambar"
              label="Botiquín por atender"
              value={botBajo.length}
              meta="Bajo mínimo o por vencer"
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Atención hoy" sub="Pendientes sanitarios ordenados por urgencia.">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Eventos por tipo" sub="Historial completo">
              <Donut
                slices={porTipo.filter((p) => p.value > 0)}
                center={
                  <>
                    <strong>{events.length}</strong>
                    <small>eventos</small>
                  </>
                }
                format={(n) => String(n)}
              />
            </Panel>
          </div>
          <Panel title="Costo sanitario por mes" sub="Millones de pesos">
            <BarChart
              labels={meses.map((m) => m.l)}
              series={[
                {
                  name: "Costo",
                  tone: "violeta",
                  values: meses.map((m) => Math.round(m.v * 100) / 100),
                },
              ]}
              height={170}
            />
          </Panel>
        </>
      )}

      {tab === "eventos" && (
        <Panel
          title="Historial sanitario"
          sub="Todo evento queda con producto, dosis, responsable y retiro."
        >
          <DataTable
            cols={eventCols}
            rows={[...events].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(e) => `${e.sujeto} ${e.producto} ${e.motivo} ${e.tipo}`}
            placeholder="Buscar por animal, producto o motivo…"
          />
        </Panel>
      )}

      {tab === "retiros" && (
        <>
          <Panel
            title="¿Puedo entregar la leche o vender este animal?"
            sub="Verificador de retiros por animal."
            icon={<ShieldCheck size={20} />}
          >
            <div className="kf-grid">
              <label htmlFor="chk">
                Animal
                <select id="chk" value={check} onChange={(e) => setCheck(e.target.value)}>
                  {animalTags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={chkLeche || chkCarne ? "kit-verdict no" : "kit-verdict ok"}>
              <strong>
                {chkLeche || chkCarne ? "No entregar todavía" : "Sin retiro registrado"}
              </strong>
              <span>
                {chkLeche ? `Leche en retiro hasta ${fmtDate(chkLeche)}. ` : "Leche libre. "}
                {chkCarne ? `Carne en retiro hasta ${fmtDate(chkCarne)}.` : "Carne libre."}
              </span>
            </div>
          </Panel>
          <Panel
            title="Retiros activos"
            sub="Fechas de liberación calculadas a partir del producto aplicado."
          >
            <DataTable
              cols={[
                {
                  key: "s",
                  label: "Animal o lote",
                  render: (x: (typeof retiros)[number]) => <b>{x.e.sujeto}</b>,
                },
                { key: "p", label: "Producto", render: (x) => x.e.producto },
                {
                  key: "l",
                  label: "Leche libre desde",
                  render: (x) =>
                    x.r.leche ? (
                      <Badge tone="ambar">
                        {fmtDate(x.r.leche)} · {daysFromNow(x.r.leche)} d
                      </Badge>
                    ) : (
                      <Badge tone="verde">Libre</Badge>
                    ),
                },
                {
                  key: "c",
                  label: "Carne libre desde",
                  render: (x) =>
                    x.r.carne ? (
                      <Badge tone="ambar">
                        {fmtDate(x.r.carne)} · {daysFromNow(x.r.carne)} d
                      </Badge>
                    ) : (
                      <Badge tone="verde">Libre</Badge>
                    ),
                },
              ]}
              rows={retiros}
              empty="No hay animales en retiro."
            />
          </Panel>
        </>
      )}

      {tab === "calendario" && (
        <>
          <Panel title="Plan de vacunación" sub="Calculado desde la última aplicación registrada.">
            <DataTable
              cols={[
                {
                  key: "n",
                  label: "Vacuna",
                  render: (s: (typeof vacState)[number]) => <b>{s.v.name}</b>,
                },
                { key: "a", label: "A quién", render: (s) => s.v.aplica },
                {
                  key: "u",
                  label: "Última aplicación",
                  render: (s) => (s.ev ? fmtDate(s.ev.fecha) : "Sin registro"),
                },
                {
                  key: "x",
                  label: "Próxima",
                  render: (s) =>
                    s.next ? `${fmtDate(s.next)} (${s.dueIn} d)` : s.ev ? "No se repite" : "—",
                },
                {
                  key: "e",
                  label: "Estado",
                  render: (s) => (
                    <Badge tone={s.tone}>
                      {s.tone === "verde"
                        ? "Vigente"
                        : s.tone === "ambar"
                          ? "Por vencer"
                          : "Pendiente"}
                    </Badge>
                  ),
                },
                { key: "o", label: "Nota", render: (s) => s.v.nota },
              ]}
              rows={vacState}
            />
          </Panel>
          <div className="kit-grid2">
            <Panel title="Cobertura por vacuna" sub="Porcentaje del plan vigente">
              {vacState.map((s) => (
                <Progress
                  key={s.v.name}
                  label={s.v.name}
                  value={s.tone === "verde" ? 100 : s.tone === "ambar" ? 60 : 0}
                  tone={s.tone}
                  right={
                    s.tone === "verde" ? "Vigente" : s.tone === "ambar" ? "Por vencer" : "Pendiente"
                  }
                />
              ))}
            </Panel>
            <Panel title="Otras prácticas del plan" sub="Sugeridas; las confirma el veterinario.">
              <ul className="kit-facts">
                <li>
                  <b>Desparasitación</b> según conteo de huevos (OPG), no por calendario fijo.
                </li>
                <li>
                  <b>Garrapatas y mosca del cuerno</b>: tratar al superar el umbral del lote.
                </li>
                <li>
                  <b>Terneras</b>: brucelosis entre 3 y 8 meses, con marca indeleble.
                </li>
                <li>
                  <b>Antes del parto</b>: vitaminas y minerales, y calcio posparto en vacas de alto
                  riesgo.
                </li>
                <li>
                  <b>Búfalas</b>: confirmar con el veterinario los protocolos propios de la especie.
                </li>
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === "mastitis" && (
        <>
          <Panel
            title="Matriz CMT por cuarto"
            sub="N y T: negativo · 1: débil · 2: positivo · 3: fuertemente positivo."
            icon={<TestTube size={20} />}
          >
            <div className="ptable-wrap">
              <table className="ptable cmt">
                <thead>
                  <tr>
                    <th>Animal</th>
                    {Q.map((q) => (
                      <th key={q}>{Q_LABEL[q]}</th>
                    ))}
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {latestCmt.map((r) => (
                    <tr key={r.tag}>
                      <td data-label="Animal">
                        <b className="mono">{r.tag}</b>
                      </td>
                      {Q.map((q) => (
                        <td key={q} data-label={Q_LABEL[q]}>
                          <Badge tone={CMT_TONE[r[q]] ?? "gris"}>{CMT_LEVELS[r[q]]}</Badge>
                        </td>
                      ))}
                      <td data-label="Fecha">{fmtDate(r.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Qué hacer según el resultado"
            sub="Guía rápida; el diagnóstico lo confirma el laboratorio."
          >
            <ul className="kit-facts">
              <li>
                <b>N o T</b>: sin acción; repita en el próximo control.
              </li>
              <li>
                <b>1</b>: observe y repita en 48 horas; revise la rutina de ordeño.
              </li>
              <li>
                <b>2 o 3</b>: separe del lote, ordeñe al final, tome muestra para cultivo y
                antibiograma, y trate solo con indicación veterinaria.
              </li>
              <li>
                <b>Retiro</b>: todo tratamiento intramamario genera retiro de leche; el sistema lo
                calcula al registrarlo.
              </li>
              <li>
                <b>Búfalas</b>: la interpretación de células somáticas difiere de la de las vacas;
                use referencias de la especie.
              </li>
            </ul>
          </Panel>
        </>
      )}

      {tab === "botiquin" && (
        <Panel title="Botiquín veterinario" sub="Existencias, lotes y vencimientos.">
          <DataTable
            cols={[
              {
                key: "i",
                label: "Producto",
                sort: (b: (typeof BOTIQUIN)[number]) => b.item,
                render: (b) => <b>{b.item}</b>,
              },
              { key: "l", label: "Lote", render: (b) => b.lote },
              {
                key: "v",
                label: "Vence",
                sort: (b) => b.vence,
                render: (b) => `${fmtDate(b.vence)} (${daysFromNow(b.vence)} d)`,
              },
              {
                key: "c",
                label: "Existencia",
                align: "right",
                sort: (b) => b.cant,
                render: (b) => `${b.cant} / mín. ${b.min}`,
              },
              {
                key: "e",
                label: "Estado",
                render: (b) =>
                  b.cant < b.min ? (
                    <Badge tone="rojo">Bajo mínimo</Badge>
                  ) : daysFromNow(b.vence) < 60 ? (
                    <Badge tone="ambar">Vence pronto</Badge>
                  ) : (
                    <Badge tone="verde">Normal</Badge>
                  ),
              },
            ]}
            rows={BOTIQUIN}
            search={(b) => b.item}
          />
        </Panel>
      )}

      {open === "evento" && (
        <FormDialog
          open
          title="Registrar evento sanitario"
          sub="Elija el producto: los retiros de leche y carne se calculan y quedan en el historial."
          fields={[
            {
              name: "tipo",
              label: "Tipo",
              type: "select",
              options: ["Vacunación", "Tratamiento", "Desparasitación", "Diagnóstico", "Control"],
            },
            { name: "fecha", label: "Fecha", type: "date" },
            {
              name: "sujeto",
              label: "Animal o lote",
              type: "text",
              placeholder: "Ej. BOV-004 o Lote de ordeño",
            },
            {
              name: "producto",
              label: "Producto",
              type: "select",
              options: PRODUCTS.map((p) => p.name),
            },
            { name: "motivo", label: "Motivo o diagnóstico", type: "text" },
            { name: "responsable", label: "Responsable", type: "text", value: "Dra. Marcela Ruiz" },
            { name: "costo", label: "Costo (COP)", type: "number", value: "0" },
          ]}
          preview={(v) => {
            const p = productOf(v.producto ?? "");
            if (!p) return null;
            const f = v.fecha ?? iso(today());
            return (
              <>
                <h3 className="fsec-t">
                  {p.tipo} · {p.dosis}
                </h3>
                <ul className="kit-facts">
                  <li>
                    Leche:{" "}
                    {p.retiroLeche ? (
                      <>
                        retiro de <b>{p.retiroLeche} días</b>, libre desde{" "}
                        <b>{fmtDate(addDays(f, p.retiroLeche))}</b>
                      </>
                    ) : (
                      <b>sin retiro</b>
                    )}
                  </li>
                  <li>
                    Carne:{" "}
                    {p.retiroCarne ? (
                      <>
                        retiro de <b>{p.retiroCarne} días</b>, libre desde{" "}
                        <b>{fmtDate(addDays(f, p.retiroCarne))}</b>
                      </>
                    ) : (
                      <b>sin retiro</b>
                    )}
                  </li>
                </ul>
              </>
            );
          }}
          onSubmit={saveEvent}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "cmt" && (
        <FormDialog
          open
          title="Registrar prueba CMT"
          sub="Resultado por cuarto: N, T, 1, 2 o 3."
          fields={[
            { name: "tag", label: "Animal", type: "select", options: animalTags },
            { name: "fecha", label: "Fecha", type: "date" },
            ...Q.map((q) => ({
              name: q,
              label: Q_LABEL[q],
              type: "select" as const,
              options: CMT_LEVELS,
            })),
          ]}
          onSubmit={(v) => {
            addCmt({
              tag: v.tag ?? "",
              fecha: v.fecha ?? iso(today()),
              AI: CMT_LEVELS.indexOf(v.AI ?? "N"),
              AD: CMT_LEVELS.indexOf(v.AD ?? "N"),
              PI: CMT_LEVELS.indexOf(v.PI ?? "N"),
              PD: CMT_LEVELS.indexOf(v.PD ?? "N"),
            });
            setOpen(null);
            notify("Prueba CMT registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
