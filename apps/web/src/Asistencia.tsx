import { ClipboardCheck, FileText, KeyRound, Users } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import { GRANTS as GRANTS_DEMO, type Grant, RECOS, type Reco, VISITS, type Visit } from "./erpData";
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
  Timeline,
  type Tone,
  daysFromNow,
  demoOnly,
  downloadCsv,
  fmtDate,
  iso,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "agenda" | "recomendaciones" | "informe" | "accesos" | "indicadores";
const AREAS: Visit["area"][] = [
  "Veterinaria",
  "Zootecnia",
  "Agronomía",
  "Buenas prácticas",
  "Gestión",
];
const EST_TONE: Record<Reco["estado"], Tone> = {
  Abierta: "ambar",
  "En curso": "azul",
  Cumplida: "verde",
  Descartada: "gris",
};
const PRI_TONE: Record<Reco["prioridad"], Tone> = { Alta: "rojo", Media: "ambar", Baja: "gris" };
const NEXT: Record<Reco["estado"], Reco["estado"]> = {
  Abierta: "En curso",
  "En curso": "Cumplida",
  Cumplida: "Abierta",
  Descartada: "Abierta",
};

export function AsistenciaScreen() {
  // Datos de ejemplo solo en la cuenta demo; las cuentas reales empiezan vacías.
  const GRANTS = demoOnly(GRANTS_DEMO);
  const { notify } = useApp();
  const [visits, addVisit, resetV] = useStore<Visit>("visitas", VISITS);
  const [recosBase, addReco, resetR] = useStore<Reco>("recos", RECOS);
  const [changes, addChange, resetC] = useStore<{ id: string; estado: Reco["estado"] }>(
    "reco-estado",
    [],
  );
  const [revocados, addRev, resetG] = useStore<{ asesor: string; activo: boolean }>("grants", []);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"visita" | "reco" | "acceso" | null>(null);
  const [rep, setRep] = useState(visits.find((v) => v.estado === "Realizada")?.id ?? "");
  const [extraGrants, addGrant] = useStore<Grant>("grants-new", []);

  const recos = recosBase.map((r) => ({
    ...r,
    estado: changes.find((c) => c.id === r.id)?.estado ?? r.estado,
  }));
  const grants = [...extraGrants, ...GRANTS].map((g) => {
    const ov = revocados.find((x) => x.asesor === g.asesor);
    const vigente = daysFromNow(g.hasta) >= 0;
    return { ...g, activo: (ov ? ov.activo : g.activo) && vigente };
  });
  const abiertas = recos.filter((r) => r.estado === "Abierta" || r.estado === "En curso");
  const vencidas = abiertas.filter((r) => daysFromNow(r.limite) < 0);
  const cumplidas = recos.filter((r) => r.estado === "Cumplida");
  const cumplimiento =
    (cumplidas.length / Math.max(1, recos.filter((r) => r.estado !== "Descartada").length)) * 100;
  const proximas = visits
    .filter((v) => v.estado === "Programada" && daysFromNow(v.fecha) >= 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  const alerts: AlertItem[] = [
    ...vencidas.map((r) => ({
      tone: "rojo" as Tone,
      title: `Vencida · ${r.texto}`,
      text: `${r.responsable} · límite ${fmtDate(r.limite)} (${Math.abs(daysFromNow(r.limite))} días de atraso)`,
      action: {
        label: "Avanzar",
        run: () => {
          addChange({ id: r.id, estado: NEXT[r.estado] });
          notify("Estado actualizado.", "ok");
        },
      },
    })),
    ...proximas.slice(0, 2).map((v) => ({
      tone: "azul" as Tone,
      title: `Visita ${v.area.toLowerCase()} en ${daysFromNow(v.fecha)} días`,
      text: `${v.asesor} · ${v.objetivo}`,
    })),
    ...grants
      .filter((g) => g.activo && daysFromNow(g.hasta) <= 15)
      .map((g) => ({
        tone: "ambar" as Tone,
        title: `Acceso de ${g.asesor} vence pronto`,
        text: `Vigente hasta ${fmtDate(g.hasta)}. Renueve o déjelo vencer.`,
      })),
  ];

  const recoCols: Col<Reco>[] = [
    { key: "t", label: "Recomendación", sort: (r) => r.texto, render: (r) => <b>{r.texto}</b> },
    { key: "a", label: "Área", sort: (r) => r.area, render: (r) => r.area },
    {
      key: "p",
      label: "Prioridad",
      sort: (r) => ["Alta", "Media", "Baja"].indexOf(r.prioridad),
      render: (r) => <Badge tone={PRI_TONE[r.prioridad]}>{r.prioridad}</Badge>,
    },
    { key: "r", label: "Responsable", sort: (r) => r.responsable, render: (r) => r.responsable },
    {
      key: "l",
      label: "Fecha límite",
      sort: (r) => r.limite,
      render: (r) => (
        <span className={daysFromNow(r.limite) < 0 && r.estado !== "Cumplida" ? "neg" : ""}>
          {fmtDate(r.limite)}
        </span>
      ),
    },
    {
      key: "e",
      label: "Estado",
      sort: (r) => r.estado,
      render: (r) => (
        <button
          type="button"
          className="chip-btn"
          title="Cambiar estado"
          onClick={(e) => {
            e.stopPropagation();
            addChange({ id: r.id, estado: NEXT[r.estado] });
            notify(`«${r.texto.slice(0, 40)}…» pasó a ${NEXT[r.estado]}.`, "ok");
          }}
        >
          <Badge tone={EST_TONE[r.estado]}>{r.estado} ›</Badge>
        </button>
      ),
    },
  ];

  const visit = visits.find((v) => v.id === rep);
  const visitRecos = recos.filter((r) => r.visita === rep);
  const porArea = AREAS.map((a) => ({
    a,
    total: recos.filter((r) => r.area === a).length,
    ok: recos.filter((r) => r.area === a && r.estado === "Cumplida").length,
  }));

  return (
    <section className="page">
      <PageHead
        kicker="Asistencia técnica"
        icon={<Users size={30} aria-hidden="true" />}
        title="Asistencia técnica"
        lead="Visitas, recomendaciones con responsable y fecha, informes y acceso controlado de asesores."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("visita")}>
              Programar visita
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("reco")}>
              Registrar recomendación
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setTab("informe")}>
              Generar informe
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          Toque el estado de una recomendación para avanzarla: Abierta → En curso → Cumplida.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetV();
            resetR();
            resetC();
            resetG();
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
          { key: "agenda", label: "Agenda de visitas", badge: proximas.length },
          { key: "recomendaciones", label: "Recomendaciones", badge: abiertas.length },
          { key: "informe", label: "Informe de visita" },
          { key: "accesos", label: "Acceso de asesores" },
          { key: "indicadores", label: "Cumplimiento" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="azul"
              icon={<Users size={18} />}
              label="Próximas visitas"
              value={proximas.length}
              meta={
                proximas[0] ? `La siguiente: ${fmtDate(proximas[0].fecha)}` : "Ninguna programada"
              }
            />
            <Stat
              tone="ambar"
              icon={<ClipboardCheck size={18} />}
              label="Recomendaciones abiertas"
              value={abiertas.length}
              meta={`${recos.filter((r) => r.estado === "En curso").length} en curso`}
            />
            <Stat
              tone="rojo"
              label="Vencidas"
              value={vencidas.length}
              meta="Pasaron su fecha límite"
            />
            <Stat
              tone="verde"
              label="Cumplimiento"
              value={`${Math.round(cumplimiento)} %`}
              meta={`${cumplidas.length} cumplidas`}
              goal="≥ 80 %"
            />
            <Stat
              tone="violeta"
              icon={<KeyRound size={18} />}
              label="Asesores con acceso"
              value={grants.filter((g) => g.activo).length}
              meta="Permisos vigentes"
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Atención" sub="Compromisos vencidos, visitas próximas y accesos.">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Estado de las recomendaciones" sub={`${recos.length} en total`}>
              <Donut
                slices={(Object.keys(EST_TONE) as Reco["estado"][])
                  .map((e) => ({
                    label: e,
                    value: recos.filter((r) => r.estado === e).length,
                    tone: EST_TONE[e],
                  }))
                  .filter((s) => s.value > 0)}
                center={
                  <>
                    <strong>{recos.length}</strong>
                    <small>recomendaciones</small>
                  </>
                }
                format={(n) => String(n)}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "agenda" && (
        <div className="kit-grid2">
          <Panel title="Próximas visitas" sub="Programadas">
            <Timeline
              items={proximas.map((v) => ({
                date: v.fecha,
                title: `${v.area} · ${v.asesor}`,
                text: v.objetivo,
                tone: "azul",
              }))}
            />
          </Panel>
          <Panel title="Historial de visitas" sub="Realizadas, con sus hallazgos">
            <Timeline
              items={visits
                .filter((v) => v.estado === "Realizada")
                .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
                .map((v) => ({
                  date: v.fecha,
                  title: `${v.id} · ${v.area} · ${v.asesor}`,
                  text: v.hallazgos ?? v.objetivo,
                  tone: "verde",
                }))}
            />
          </Panel>
        </div>
      )}

      {tab === "recomendaciones" && (
        <Panel
          title="Seguimiento de recomendaciones"
          sub="Cada una con responsable, prioridad y fecha límite."
        >
          <DataTable
            cols={recoCols}
            rows={[...recos].sort((a, b) => (a.limite < b.limite ? -1 : 1))}
            search={(r) => `${r.texto} ${r.responsable} ${r.area} ${r.estado}`}
            placeholder="Buscar recomendación, responsable o área…"
            toolbar={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    "recomendaciones",
                    ["Recomendación", "Área", "Prioridad", "Responsable", "Límite", "Estado"],
                    recos.map((r) => [
                      r.texto,
                      r.area,
                      r.prioridad,
                      r.responsable,
                      r.limite,
                      r.estado,
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

      {tab === "informe" && (
        <>
          <div className="kit-toolbar no-print">
            <label htmlFor="rep" className="inline-field">
              Visita
              <select id="rep" value={rep} onChange={(e) => setRep(e.target.value)}>
                {visits
                  .filter((v) => v.estado === "Realizada")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {fmtDate(v.fecha)} · {v.area}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <FileText size={16} aria-hidden="true" /> Imprimir o guardar PDF
            </button>
          </div>
          {visit && (
            <article className="card report">
              <header className="report-head">
                <div>
                  <p className="kicker">Informe de asistencia técnica · {visit.id}</p>
                  <h2>{visit.objetivo}</h2>
                  <p className="hint">
                    Finca demostrativa · {fmtDate(visit.fecha)} · {visit.duracion ?? 2} horas
                  </p>
                </div>
                <Badge tone="verde">Realizada</Badge>
              </header>
              <dl className="report-meta">
                <div>
                  <dt>Asesor</dt>
                  <dd>{visit.asesor}</dd>
                </div>
                <div>
                  <dt>Área</dt>
                  <dd>{visit.area}</dd>
                </div>
                <div>
                  <dt>Recomendaciones</dt>
                  <dd>{visitRecos.length}</dd>
                </div>
                <div>
                  <dt>Cumplidas</dt>
                  <dd>{visitRecos.filter((r) => r.estado === "Cumplida").length}</dd>
                </div>
              </dl>
              <h3>Hallazgos</h3>
              <p>{visit.hallazgos ?? "Sin hallazgos registrados."}</p>
              <h3>Recomendaciones y compromisos</h3>
              <ol className="report-list">
                {visitRecos.map((r) => (
                  <li key={r.id}>
                    <b>{r.texto}</b>
                    <span>
                      Responsable: {r.responsable} · Prioridad {r.prioridad.toLowerCase()} · Límite{" "}
                      {fmtDate(r.limite)} · <Badge tone={EST_TONE[r.estado]}>{r.estado}</Badge>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="report-sign">
                <div>
                  <span /> <small>{visit.asesor}</small>
                </div>
                <div>
                  <span /> <small>Propietario o administrador</small>
                </div>
              </div>
            </article>
          )}
        </>
      )}

      {tab === "accesos" && (
        <Panel
          title="Acceso de asesores"
          sub="Solo a los módulos y fechas que usted autorice; revocable en cualquier momento."
          icon={<KeyRound size={20} />}
          action={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen("acceso")}
            >
              Dar acceso
            </button>
          }
        >
          <DataTable
            cols={[
              {
                key: "a",
                label: "Asesor",
                render: (g: (typeof grants)[number]) => (
                  <>
                    <b>{g.asesor}</b>
                    <br />
                    <small className="hint">{g.rol}</small>
                  </>
                ),
              },
              {
                key: "m",
                label: "Módulos",
                render: (g) => (
                  <span className="badge-row">
                    {g.modulos.map((m) => (
                      <Badge key={m} tone="azul">
                        {m}
                      </Badge>
                    ))}
                  </span>
                ),
              },
              {
                key: "v",
                label: "Vigencia",
                render: (g) => `${fmtDate(g.desde)} – ${fmtDate(g.hasta)}`,
              },
              {
                key: "e",
                label: "Estado",
                render: (g) => (
                  <Badge tone={g.activo ? "verde" : "gris"}>
                    {g.activo ? "Activo" : daysFromNow(g.hasta) < 0 ? "Vencido" : "Revocado"}
                  </Badge>
                ),
              },
              {
                key: "x",
                label: "Acción",
                render: (g) =>
                  daysFromNow(g.hasta) < 0 ? (
                    <small className="hint">Venció</small>
                  ) : (
                    <button
                      type="button"
                      className={g.activo ? "btn btn-ghost btn-sm danger" : "btn btn-ghost btn-sm"}
                      onClick={() => {
                        addRev({ asesor: g.asesor, activo: !g.activo });
                        notify(
                          g.activo
                            ? `Acceso de ${g.asesor} revocado.`
                            : `Acceso de ${g.asesor} restablecido.`,
                          "ok",
                        );
                      }}
                    >
                      {g.activo ? "Revocar" : "Restablecer"}
                    </button>
                  ),
              },
            ]}
            rows={grants}
          />
        </Panel>
      )}

      {tab === "indicadores" && (
        <div className="kit-grid2">
          <Panel title="Cumplimiento por área" sub="Recomendaciones cumplidas sobre el total">
            {porArea
              .filter((a) => a.total)
              .map((a) => (
                <Progress
                  key={a.a}
                  label={a.a}
                  value={a.ok}
                  max={a.total}
                  tone={a.ok / a.total >= 0.8 ? "verde" : a.ok / a.total >= 0.5 ? "ambar" : "rojo"}
                  right={`${a.ok} de ${a.total}`}
                />
              ))}
          </Panel>
          <Panel title="Visitas por área" sub="Historial completo">
            <BarChart
              labels={AREAS.map((a) => a.split(" ")[0] ?? a)}
              series={[
                {
                  name: "Visitas",
                  tone: "azul",
                  values: AREAS.map((a) => visits.filter((v) => v.area === a).length),
                },
              ]}
              height={180}
            />
          </Panel>
        </div>
      )}

      {open === "visita" && (
        <FormDialog
          open
          title="Programar visita"
          fields={[
            { name: "fecha", label: "Fecha", type: "date" },
            {
              name: "asesor",
              label: "Asesor",
              type: "select",
              options: ["Dra. Marcela Ruiz", "Ing. Julián Torres", "Zoot. Paula Gómez"],
            },
            { name: "area", label: "Área", type: "select", options: AREAS },
            { name: "objetivo", label: "Objetivo de la visita", type: "textarea" },
          ]}
          onSubmit={(v) => {
            addVisit({
              id: `V-${12 + visits.length}`,
              fecha: v.fecha ?? iso(today()),
              asesor: v.asesor ?? "",
              area: (v.area as Visit["area"]) ?? "Veterinaria",
              objetivo: v.objetivo ?? "",
              estado: "Programada",
            });
            setOpen(null);
            notify("Visita programada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "reco" && (
        <FormDialog
          open
          title="Registrar recomendación"
          fields={[
            { name: "visita", label: "Visita", type: "select", options: visits.map((v) => v.id) },
            { name: "area", label: "Área", type: "select", options: AREAS },
            { name: "texto", label: "Recomendación", type: "textarea" },
            {
              name: "prioridad",
              label: "Prioridad",
              type: "select",
              options: ["Alta", "Media", "Baja"],
            },
            {
              name: "responsable",
              label: "Responsable",
              type: "select",
              options: ["Luis Martínez", "Ana Rojas", "Pedro Gómez", "Propietario"],
            },
            { name: "limite", label: "Fecha límite", type: "date" },
          ]}
          onSubmit={(v) => {
            addReco({
              id: `R-${30 + recosBase.length}`,
              visita: v.visita ?? "",
              area: (v.area as Visit["area"]) ?? "Gestión",
              texto: v.texto ?? "",
              prioridad: (v.prioridad as Reco["prioridad"]) ?? "Media",
              responsable: v.responsable ?? "",
              limite: v.limite ?? iso(today()),
              estado: "Abierta",
            });
            setOpen(null);
            notify("Recomendación registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "acceso" && (
        <FormDialog
          open
          title="Dar acceso a un asesor"
          sub="El asesor solo verá los módulos elegidos hasta la fecha indicada."
          fields={[
            { name: "asesor", label: "Nombre", type: "text" },
            {
              name: "rol",
              label: "Rol",
              type: "select",
              options: [
                "Médico veterinario",
                "Zootecnista",
                "Asistente técnico",
                "Laboratorio",
                "Contador",
              ],
            },
            {
              name: "modulos",
              label: "Módulos",
              type: "select",
              options: [
                "Animales, Reproducción, Sanidad",
                "Producción, Pasturas",
                "Economía, Contabilidad",
                "Todos los de solo lectura",
              ],
            },
            { name: "hasta", label: "Vigente hasta", type: "date" },
          ]}
          onSubmit={(v) => {
            addGrant({
              asesor: v.asesor ?? "",
              rol: v.rol ?? "",
              modulos: (v.modulos ?? "").split(", "),
              desde: iso(today()),
              hasta: v.hasta ?? iso(today()),
              activo: true,
            });
            setOpen(null);
            notify("Acceso concedido.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
