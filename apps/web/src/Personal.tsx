import { CalendarDays, GraduationCap, ListChecks, UserRound, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHead } from "./components";
import {
  ARL_TARIFA,
  AUX_TRANSPORTE,
  COURSES,
  type Course,
  LABORES,
  PEOPLE,
  type Person,
  SHIFTS,
  SMMLV,
  TASKS,
  type Task,
} from "./erpData";
import {
  type AlertItem,
  Alerts,
  Badge,
  type Col,
  DataTable,
  Donut,
  FormDialog,
  Panel,
  Stat,
  Tabs,
  type Tone,
  daysBetween,
  daysFromNow,
  downloadCsv,
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

type Tab = "panel" | "personas" | "turnos" | "nomina" | "tareas" | "capacitacion";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const LAB_TONE: Record<string, Tone> = {
  Ordeño: "azul",
  Rotación: "verde",
  Sanidad: "rojo",
  Cercas: "ambar",
  Alimentación: "violeta",
  Mantenimiento: "gris",
  Descanso: "gris",
};
const NEXT: Record<Task["estado"], Task["estado"]> = {
  Pendiente: "En curso",
  "En curso": "Hecha",
  Hecha: "Pendiente",
};

function payroll(p: Person, extras: number, dias: number) {
  const jornal = p.contrato === "Jornal";
  const base = jornal ? p.salario * dias : p.salario / 2;
  const aux = !jornal && p.salario <= 2 * SMMLV ? AUX_TRANSPORTE / 2 : 0;
  const valorHora = (jornal ? p.salario / 8 : p.salario / 220) * 1.25;
  const he = extras * valorHora;
  const devengado = base + aux + he;
  const ibc = base + he;
  const salud = ibc * 0.04;
  const pension = ibc * 0.04;
  const netoPagar = devengado - salud - pension;
  const emp = {
    salud: ibc * 0.085,
    pension: ibc * 0.12,
    arl: ibc * (ARL_TARIFA[p.riesgoARL] ?? 0.02436),
    caja: ibc * 0.04,
    cesantias: (base + aux) * 0.0833,
    intereses: (base + aux) * 0.01,
    prima: (base + aux) * 0.0833,
    vacaciones: base * 0.0417,
  };
  const costoEmpresa = devengado + Object.values(emp).reduce((a, b) => a + b, 0);
  return { base, aux, he, devengado, salud, pension, netoPagar, emp, costoEmpresa };
}

export function PersonalScreen() {
  const { notify } = useApp();
  const [people, addPerson, resetP] = useStore<Person>("personas", PEOPLE);
  const [tasksBase, addTask, resetT] = useStore<Task>("tareas", TASKS);
  const [taskChanges, addTaskChange, resetTC] = useStore<{
    titulo: string;
    estado: Task["estado"];
  }>("tareas-estado", []);
  const [courses, addCourse, resetCo] = useStore<Course>("cursos", COURSES);
  const shiftsSeed = isDemoScope() ? SHIFTS : {};
  const [shifts, setShifts] = useState<Record<string, string[]>>(shiftsSeed);
  const [tab, setTab] = useState<Tab>("panel");
  const [open, setOpen] = useState<"persona" | "tarea" | "curso" | null>(null);
  const [sel, setSel] = useState(PEOPLE[1]?.nombre ?? "");
  const [extras, setExtras] = useState(6);
  const [dias, setDias] = useState(12);

  const tasks = tasksBase.map((t) => ({
    ...t,
    estado: taskChanges.filter((c) => c.titulo === t.titulo).pop()?.estado ?? t.estado,
  }));
  const activos = people.filter((p) => p.estado !== "Retirado");
  const pays = activos.map((p) => ({ p, r: payroll(p, p.nombre === sel ? extras : 0, dias) }));
  const totalNomina = pays.reduce((s, x) => s + x.r.costoEmpresa, 0);
  const vencidos = courses.filter((c) => daysFromNow(c.vence) < 0);
  const porVencer = courses.filter((c) => daysFromNow(c.vence) >= 0 && daysFromNow(c.vence) <= 45);
  const atrasadas = tasks.filter((t) => t.estado !== "Hecha" && daysFromNow(t.limite) < 0);

  const alerts: AlertItem[] = [
    ...atrasadas.map((t) => ({
      tone: "rojo" as Tone,
      title: `Tarea atrasada · ${t.titulo}`,
      text: `${t.responsable} · límite ${fmtDate(t.limite)}`,
      action: {
        label: "Avanzar",
        run: () => addTaskChange({ titulo: t.titulo, estado: NEXT[t.estado] }),
      },
    })),
    ...vencidos.map((c) => ({
      tone: "rojo" as Tone,
      title: `${c.persona} · curso vencido`,
      text: `${c.curso} venció el ${fmtDate(c.vence)}.`,
    })),
    ...porVencer.map((c) => ({
      tone: "ambar" as Tone,
      title: `${c.persona} · curso por vencer`,
      text: `${c.curso} vence el ${fmtDate(c.vence)}.`,
    })),
    ...people
      .filter((p) => p.estado === "Vacaciones")
      .map((p) => ({
        tone: "azul" as Tone,
        title: `${p.nombre} en vacaciones`,
        text: "Revise la cobertura de sus turnos esta semana.",
      })),
  ];

  const sp = pays.find((x) => x.p.nombre === sel);
  const peopleCols: Col<Person>[] = [
    {
      key: "n",
      label: "Nombre",
      sort: (p) => p.nombre,
      render: (p) => (
        <>
          <b>{p.nombre}</b>
          <br />
          <small className="hint">{p.documento}</small>
        </>
      ),
    },
    { key: "c", label: "Cargo", sort: (p) => p.cargo, render: (p) => p.cargo },
    { key: "k", label: "Contrato", render: (p) => p.contrato },
    {
      key: "i",
      label: "Antigüedad",
      sort: (p) => p.ingreso,
      render: (p) => `${num(daysBetween(p.ingreso, iso(today())) / 365, 1)} años`,
    },
    {
      key: "s",
      label: "Salario",
      align: "right",
      sort: (p) => p.salario,
      render: (p) => (p.contrato === "Jornal" ? `${money(p.salario)} / día` : money(p.salario)),
    },
    { key: "a", label: "Seguridad social", render: (p) => `${p.eps} · ARL riesgo ${p.riesgoARL}` },
    {
      key: "t",
      label: "Teléfono",
      render: (p) => <a href={`tel:${p.telefono.replace(/\s/g, "")}`}>{p.telefono}</a>,
    },
    {
      key: "e",
      label: "Estado",
      render: (p) => (
        <Badge
          tone={
            p.estado === "Activo"
              ? "verde"
              : p.estado === "Vacaciones"
                ? "azul"
                : p.estado === "Incapacidad"
                  ? "ambar"
                  : "gris"
          }
        >
          {p.estado}
        </Badge>
      ),
    },
  ];

  const cover = DIAS.map((_, i) => ({
    ordeno: Object.values(shifts).filter((s) => s[i] === "Ordeño").length,
  }));

  return (
    <section className="page">
      <PageHead
        kicker="Personal"
        icon={<UserRound size={30} aria-hidden="true" />}
        title="Personal, turnos y nómina"
        lead="Trabajadores, turnos de la semana, nómina con aportes y prestaciones, tareas y capacitación."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setOpen("tarea")}>
              Asignar tarea
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen("persona")}>
              Nueva persona
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setTab("nomina")}>
              Liquidar nómina
            </button>
          </>
        }
      />
      <div className="kit-toolbar">
        <p className="hint">
          Salario mínimo y auxilio de transporte de referencia ({money(SMMLV)} y{" "}
          {money(AUX_TRANSPORTE)}); actualícelos cada año.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetP();
            resetT();
            resetTC();
            resetCo();
            setShifts(shiftsSeed);
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
          { key: "personas", label: "Personas", badge: activos.length },
          { key: "turnos", label: "Turnos" },
          { key: "nomina", label: "Nómina" },
          {
            key: "tareas",
            label: "Tareas",
            badge: tasks.filter((t) => t.estado !== "Hecha").length,
          },
          { key: "capacitacion", label: "Capacitación y SST" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="azul"
              icon={<UserRound size={18} />}
              label="Personas activas"
              value={activos.length}
              meta={`${people.filter((p) => p.estado === "Vacaciones").length} en vacaciones`}
            />
            <Stat
              tone="violeta"
              icon={<Wallet size={18} />}
              label="Costo de nómina (quincena)"
              value={moneyM(totalNomina)}
              meta="Salario, aportes y prestaciones"
            />
            <Stat
              tone="ambar"
              icon={<ListChecks size={18} />}
              label="Tareas abiertas"
              value={tasks.filter((t) => t.estado !== "Hecha").length}
              meta={`${atrasadas.length} atrasadas`}
            />
            <Stat
              tone="rojo"
              icon={<GraduationCap size={18} />}
              label="Cursos vencidos"
              value={vencidos.length}
              meta={`${porVencer.length} por vencer`}
            />
          </div>
          <div className="kit-grid2">
            <Panel title="Atención" sub="Tareas, cursos y cobertura">
              <Alerts items={alerts} />
            </Panel>
            <Panel title="Costo de nómina por persona" sub="Quincena, costo total">
              <Donut
                slices={pays.map((x, i) => ({
                  label: x.p.nombre,
                  value: x.r.costoEmpresa,
                  tone: (["azul", "verde", "ambar", "violeta", "gris"] as Tone[])[i % 5] ?? "gris",
                }))}
                format={(n) => moneyM(n)}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === "personas" && (
        <Panel title="Personal" sub="Contrato, seguridad social y contacto.">
          <DataTable
            cols={peopleCols}
            rows={people}
            search={(p) => `${p.nombre} ${p.cargo} ${p.documento}`}
            toolbar={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    "personal",
                    ["Nombre", "Documento", "Cargo", "Contrato", "Salario", "EPS", "Estado"],
                    people.map((p) => [
                      p.nombre,
                      p.documento,
                      p.cargo,
                      p.contrato,
                      p.salario,
                      p.eps,
                      p.estado,
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

      {tab === "turnos" && (
        <Panel
          title="Planilla semanal de turnos"
          sub="Toque una celda para cambiar la labor. La fila inferior muestra la cobertura del ordeño."
          icon={<CalendarDays size={20} />}
        >
          <div className="ptable-wrap">
            <table className="ptable shifts">
              <thead>
                <tr>
                  <th>Persona</th>
                  {DIAS.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(shifts).map(([name, s]) => (
                  <tr key={name}>
                    <td data-label="Persona">
                      <b>{name}</b>
                    </td>
                    {s.map((l, i) => (
                      <td key={DIAS[i]} data-label={DIAS[i]}>
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() =>
                            setShifts({
                              ...shifts,
                              [name]: s.map((x, j) =>
                                j === i
                                  ? (LABORES[(LABORES.indexOf(x) + 1) % LABORES.length] ?? x)
                                  : x,
                              ),
                            })
                          }
                        >
                          <Badge tone={LAB_TONE[l] ?? "gris"}>{l}</Badge>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="cover-row">
                  <td data-label="Cobertura">
                    <b>Ordeño cubierto</b>
                  </td>
                  {cover.map((c, i) => (
                    <td key={DIAS[i]} data-label={DIAS[i]}>
                      <Badge tone={c.ordeno >= 1 ? "verde" : "rojo"}>
                        {c.ordeno >= 1
                          ? `${c.ordeno} persona${c.ordeno > 1 ? "s" : ""}`
                          : "Sin cubrir"}
                      </Badge>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "nomina" && (
        <div className="kit-grid2">
          <Panel title="Liquidación quincenal" sub="Seleccione una persona y ajuste horas extra.">
            <div className="kf-grid">
              <label htmlFor="nm-p">
                Persona
                <select id="nm-p" value={sel} onChange={(e) => setSel(e.target.value)}>
                  {activos.map((p) => (
                    <option key={p.nombre}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="nm-h">
                Horas extra diurnas
                <input
                  id="nm-h"
                  type="number"
                  min={0}
                  value={extras}
                  onChange={(e) => setExtras(Number(e.target.value))}
                />
              </label>
              {sp?.p.contrato === "Jornal" && (
                <label htmlFor="nm-d">
                  Días trabajados
                  <input
                    id="nm-d"
                    type="number"
                    min={0}
                    max={15}
                    value={dias}
                    onChange={(e) => setDias(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
            {sp && (
              <ul className="kit-facts big">
                <li>
                  <span>Salario de la quincena</span>
                  <b>{money(sp.r.base)}</b>
                </li>
                <li>
                  <span>Auxilio de transporte</span>
                  <b>{money(sp.r.aux)}</b>
                </li>
                <li>
                  <span>Horas extra (recargo 25 %)</span>
                  <b>{money(sp.r.he)}</b>
                </li>
                <li>
                  <span>Total devengado</span>
                  <b>{money(sp.r.devengado)}</b>
                </li>
                <li>
                  <span>Salud (4 %)</span>
                  <b className="neg">− {money(sp.r.salud)}</b>
                </li>
                <li>
                  <span>Pensión (4 %)</span>
                  <b className="neg">− {money(sp.r.pension)}</b>
                </li>
                <li>
                  <span>
                    <strong>Neto a pagar</strong>
                  </span>
                  <b>{money(sp.r.netoPagar)}</b>
                </li>
              </ul>
            )}
          </Panel>
          <Panel title="Costo para el empleador" sub="Aportes y provisión de prestaciones sociales">
            {sp && (
              <ul className="kit-facts big">
                <li>
                  <span>Salud (8,5 %)*</span>
                  <b>{money(sp.r.emp.salud)}</b>
                </li>
                <li>
                  <span>Pensión (12 %)</span>
                  <b>{money(sp.r.emp.pension)}</b>
                </li>
                <li>
                  <span>ARL riesgo {sp.p.riesgoARL}</span>
                  <b>{money(sp.r.emp.arl)}</b>
                </li>
                <li>
                  <span>Caja de compensación (4 %)</span>
                  <b>{money(sp.r.emp.caja)}</b>
                </li>
                <li>
                  <span>Cesantías (8,33 %)</span>
                  <b>{money(sp.r.emp.cesantias)}</b>
                </li>
                <li>
                  <span>Intereses de cesantías</span>
                  <b>{money(sp.r.emp.intereses)}</b>
                </li>
                <li>
                  <span>Prima de servicios (8,33 %)</span>
                  <b>{money(sp.r.emp.prima)}</b>
                </li>
                <li>
                  <span>Vacaciones (4,17 %)</span>
                  <b>{money(sp.r.emp.vacaciones)}</b>
                </li>
                <li>
                  <span>
                    <strong>Costo total de la quincena</strong>
                  </span>
                  <b>{money(sp.r.costoEmpresa)}</b>
                </li>
              </ul>
            )}
            <p className="hint">
              * Puede aplicar exoneración según el tipo de empleador. Porcentajes de referencia:
              valide con su contador.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  "nomina-quincena",
                  ["Persona", "Devengado", "Salud", "Pensión", "Neto", "Costo empleador"],
                  pays.map((x) => [
                    x.p.nombre,
                    Math.round(x.r.devengado),
                    Math.round(x.r.salud),
                    Math.round(x.r.pension),
                    Math.round(x.r.netoPagar),
                    Math.round(x.r.costoEmpresa),
                  ]),
                )
              }
            >
              Exportar nómina (CSV)
            </button>
          </Panel>
        </div>
      )}

      {tab === "tareas" && (
        <div className="kanban">
          {(["Pendiente", "En curso", "Hecha"] as const).map((col) => (
            <section key={col} className="kanban-col">
              <h3>
                {col}{" "}
                <span className="kit-badge">{tasks.filter((t) => t.estado === col).length}</span>
              </h3>
              {tasks
                .filter((t) => t.estado === col)
                .map((t) => (
                  <article
                    key={t.titulo}
                    className={`kanban-card ${t.estado !== "Hecha" && daysFromNow(t.limite) < 0 ? "late" : ""}`}
                  >
                    <strong>{t.titulo}</strong>
                    <small>
                      {t.responsable} · {t.area}
                    </small>
                    <div className="kc-foot">
                      <Badge
                        tone={
                          t.estado === "Hecha"
                            ? "verde"
                            : daysFromNow(t.limite) < 0
                              ? "rojo"
                              : daysFromNow(t.limite) <= 1
                                ? "ambar"
                                : "gris"
                        }
                      >
                        {fmtDate(t.limite)}
                      </Badge>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          addTaskChange({ titulo: t.titulo, estado: NEXT[t.estado] });
                          notify(`Tarea movida a ${NEXT[t.estado]}.`, "ok");
                        }}
                      >
                        {t.estado === "Hecha"
                          ? "Reabrir"
                          : t.estado === "Pendiente"
                            ? "Empezar"
                            : "Terminar"}
                      </button>
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}

      {tab === "capacitacion" && (
        <Panel
          title="Capacitación y seguridad en el trabajo"
          sub="Cursos obligatorios o recomendados, con vencimiento."
          icon={<GraduationCap size={20} />}
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen("curso")}>
              Registrar curso
            </button>
          }
        >
          <DataTable
            cols={[
              {
                key: "p",
                label: "Persona",
                sort: (c: Course) => c.persona,
                render: (c) => <b>{c.persona}</b>,
              },
              { key: "c", label: "Curso", render: (c) => c.curso },
              { key: "f", label: "Realizado", render: (c) => fmtDate(c.fecha) },
              { key: "v", label: "Vence", sort: (c) => c.vence, render: (c) => fmtDate(c.vence) },
              {
                key: "e",
                label: "Estado",
                render: (c) => (
                  <Badge
                    tone={
                      daysFromNow(c.vence) < 0
                        ? "rojo"
                        : daysFromNow(c.vence) <= 45
                          ? "ambar"
                          : "verde"
                    }
                  >
                    {daysFromNow(c.vence) < 0
                      ? "Vencido"
                      : daysFromNow(c.vence) <= 45
                        ? `Vence en ${daysFromNow(c.vence)} d`
                        : "Vigente"}
                  </Badge>
                ),
              },
            ]}
            rows={[...courses].sort((a, b) => (a.vence < b.vence ? -1 : 1))}
            search={(c) => `${c.persona} ${c.curso}`}
          />
        </Panel>
      )}

      {open === "persona" && (
        <FormDialog
          open
          title="Nueva persona"
          fields={[
            { name: "nombre", label: "Nombre completo", type: "text" },
            { name: "documento", label: "Documento", type: "text" },
            {
              name: "cargo",
              label: "Cargo",
              type: "select",
              options: [
                "Ordeñador(a)",
                "Vaquero",
                "Mayordomo",
                "Jornalero",
                "Tractorista",
                "Administrador(a)",
              ],
            },
            {
              name: "contrato",
              label: "Contrato",
              type: "select",
              options: ["Término indefinido", "Término fijo", "Obra o labor", "Jornal"],
            },
            {
              name: "salario",
              label: "Salario mensual o jornal diario",
              type: "number",
              value: String(SMMLV),
            },
            { name: "eps", label: "EPS", type: "text" },
            { name: "telefono", label: "Teléfono", type: "text" },
          ]}
          onSubmit={(v) => {
            addPerson({
              nombre: v.nombre ?? "",
              documento: v.documento ?? "",
              cargo: v.cargo ?? "",
              contrato: (v.contrato as Person["contrato"]) ?? "Término fijo",
              ingreso: iso(today()),
              salario: Number(v.salario),
              riesgoARL: 3,
              eps: v.eps ?? "",
              estado: "Activo",
              telefono: v.telefono ?? "",
            });
            setOpen(null);
            notify("Persona registrada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "tarea" && (
        <FormDialog
          open
          title="Asignar tarea"
          fields={[
            { name: "titulo", label: "Tarea", type: "text" },
            {
              name: "responsable",
              label: "Responsable",
              type: "select",
              options: activos.map((p) => p.nombre),
            },
            {
              name: "area",
              label: "Área",
              type: "select",
              options: LABORES.filter((l) => l !== "Descanso"),
            },
            { name: "limite", label: "Fecha límite", type: "date" },
          ]}
          onSubmit={(v) => {
            addTask({
              titulo: v.titulo ?? "",
              responsable: v.responsable ?? "",
              area: v.area ?? "",
              limite: v.limite ?? iso(today()),
              estado: "Pendiente",
            });
            setOpen(null);
            setTab("tareas");
            notify("Tarea asignada.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "curso" && (
        <FormDialog
          open
          title="Registrar curso"
          fields={[
            {
              name: "persona",
              label: "Persona",
              type: "select",
              options: activos.map((p) => p.nombre),
            },
            {
              name: "curso",
              label: "Curso",
              type: "select",
              options: [
                "Manipulación de alimentos",
                "Buenas prácticas de ordeño",
                "Primeros auxilios",
                "Aplicación segura de medicamentos veterinarios",
                "Manejo de bovinos y bienestar animal",
                "Trabajo seguro con maquinaria",
              ],
            },
            { name: "fecha", label: "Fecha de realización", type: "date" },
            { name: "vence", label: "Fecha de vencimiento", type: "date" },
          ]}
          onSubmit={(v) => {
            addCourse({
              persona: v.persona ?? "",
              curso: v.curso ?? "",
              fecha: v.fecha ?? iso(today()),
              vence: v.vence ?? iso(today()),
            });
            setOpen(null);
            notify("Curso registrado.", "ok");
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
