import { isDryOffDue } from "@ganaderia/domain";
import { Baby, CalendarClock, Heart, Stethoscope, Syringe } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "./components";
import {
  PARAMS,
  REP_SEED,
  type RepEvent,
  type RepState,
  type RepStatus,
  type Species,
  animalOf,
  milestones,
  repState,
} from "./herd";
import { type EventInput, useHerdData } from "./herdData";
import {
  type AlertItem,
  Alerts,
  Badge,
  BarChart,
  type Col,
  DataTable,
  Donut,
  type FField,
  FormDialog,
  Panel,
  Progress,
  type SpeciesF,
  SpeciesFilter,
  Stat,
  Tabs,
  Timeline,
  type Tone,
  addDays,
  daysFromNow,
  fmtDate,
  iso,
  num,
  today,
  useStore,
} from "./kit";
import { useApp } from "./state";

type Tab = "panel" | "hembras" | "agenda" | "indicadores" | "eventos" | "calculadora";
type Kind = "servicio" | "celo" | "dx" | "parto" | "aborto" | "secado";

const STATUS_TONE: Record<RepStatus, Tone> = {
  Gestante: "verde",
  "Seca gestante": "azul",
  Servida: "ambar",
  Vacía: "rojo",
  "En espera": "gris",
  Novilla: "violeta",
  "Parto reciente": "azul",
};

function formFor(
  kind: Kind,
  tagOptions: string[],
): { title: string; fields: FField[]; sub: string } {
  const tag: FField = { name: "tag", label: "Hembra", type: "select", options: tagOptions };
  const fecha: FField = { name: "fecha", label: "Fecha", type: "date" };
  switch (kind) {
    case "servicio":
      return {
        title: "Registrar servicio",
        sub: "Monta natural o inseminación. El sistema calcula la fecha de diagnóstico, secado y parto.",
        fields: [
          tag,
          fecha,
          {
            name: "via",
            label: "Tipo de servicio",
            type: "select",
            options: ["IA", "Monta", "Transferencia de embrión"],
          },
          {
            name: "macho",
            label: "Reproductor o pajilla",
            type: "text",
            spokenAsTag: true,
            placeholder: "Ej. HOL-221 o TORO-02",
          },
          {
            name: "obs",
            label: "Observaciones (celo, protocolo)",
            type: "textarea",
            required: false,
          },
        ],
      };
    case "celo":
      return {
        title: "Registrar celo observado",
        sub: "En búfalas el celo suele ser silencioso: anote cualquier señal (mucosidad, inquietud, monta).",
        fields: [
          tag,
          fecha,
          { name: "obs", label: "Señales observadas", type: "textarea", required: false },
        ],
      };
    case "dx":
      return {
        title: "Diagnóstico de gestación",
        sub: "Palpación rectal o ecografía. Una vacía vuelve a quedar apta para servicio.",
        fields: [
          tag,
          fecha,
          {
            name: "resultado",
            label: "Resultado",
            type: "select",
            options: ["Preñada", "Vacía", "Dudosa"],
          },
          {
            name: "metodo",
            label: "Método",
            type: "select",
            options: ["Ecografía", "Palpación rectal"],
          },
          { name: "obs", label: "Observaciones", type: "textarea", required: false },
        ],
      };
    case "parto":
      return {
        title: "Registrar parto",
        sub: "El parto crea la cría una sola vez y la deja vinculada con su madre.",
        fields: [
          tag,
          fecha,
          {
            name: "cria",
            label: "Identificación de la cría",
            type: "text",
            spokenAsTag: true,
            placeholder: "Ej. BOV-040",
          },
          {
            name: "sexo",
            label: "Sexo de la cría",
            type: "select",
            options: ["Hembra", "Macho", "Mellizos"],
          },
          { name: "peso", label: "Peso al nacer (kg)", type: "number" },
          {
            name: "facilidad",
            label: "Facilidad de parto",
            type: "select",
            options: ["Normal", "Asistido", "Distocia (cesárea)"],
          },
          {
            name: "obs",
            label: "Calostro, retención de placenta, otros",
            type: "textarea",
            required: false,
          },
        ],
      };
    case "aborto":
      return {
        title: "Registrar aborto",
        sub: "Aísle a la hembra y avise al veterinario: puede ser brucelosis, leptospirosis, IBR o neosporosis.",
        fields: [
          tag,
          fecha,
          {
            name: "obs",
            label: "Edad gestacional y observaciones",
            type: "textarea",
            required: false,
          },
        ],
      };
    default:
      return {
        title: "Registrar secado",
        sub: "Suspensión del ordeño unos 60 días antes del parto, con terapia de vaca seca si el veterinario lo indica.",
        fields: [
          tag,
          fecha,
          { name: "obs", label: "Terapia de secado", type: "textarea", required: false },
        ],
      };
  }
}

function previewFor(kind: Kind, v: Record<string, string>, speciesOf: (tag: string) => Species) {
  const sp: Species = speciesOf(v.tag ?? "");
  const p = PARAMS[sp];
  const f = v.fecha ?? iso(today());
  if (kind === "servicio") {
    const m = milestones(sp, f);
    return (
      <>
        <h3 className="fsec-t">Se calculará para {v.tag}</h3>
        <ul className="kit-facts">
          <li>
            Diagnóstico a partir del <b>{fmtDate(m.dx)}</b> (día {p.dxDesde})
          </li>
          <li>
            Si no queda preñada, nuevo celo hacia el <b>{fmtDate(m.celoSiVacia)}</b>
          </li>
          <li>
            Secado hacia el <b>{fmtDate(m.secado)}</b>
          </li>
          <li>
            Fecha probable de parto: <b>{fmtDate(m.fpp)}</b> ({p.gestacion} días de gestación)
          </li>
        </ul>
      </>
    );
  }
  if (kind === "parto")
    return (
      <p className="hint">
        Se iniciará la espera voluntaria de <b>{p.esperaVoluntaria} días</b> y el seguimiento del
        puerperio. Primer servicio sugerido desde el{" "}
        <b>{fmtDate(addDays(f, p.esperaVoluntaria))}</b>.
      </p>
    );
  if (kind === "celo")
    return (
      <p className="hint">
        Próximo celo esperado hacia el <b>{fmtDate(addDays(f, p.ciclo))}</b> (ciclo de {p.ciclo}{" "}
        días).
      </p>
    );
  return null;
}

export function ReproduccionScreen() {
  const { notify } = useApp();
  const herd = useHerdData();
  const { females, speciesOf } = herd;
  const [sample, add, reset] = useStore<RepEvent>("rep", REP_SEED);
  const events = herd.real ? herd.rep : sample;
  const [tab, setTab] = useState<Tab>("panel");
  const [sp, setSp] = useState<SpeciesF>("todos");
  const [form, setForm] = useState<Kind | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const fichaRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (ficha) fichaRef.current?.showModal();
  }, [ficha]);

  const states = useMemo(
    () =>
      females
        .map((a) => repState(a, events))
        .filter((s) => sp === "todos" || s.animal.species === sp),
    [events, sp, females],
  );
  const count = (st: RepStatus) => states.filter((s) => s.status === st).length;
  const gest = states.filter((s) => s.status === "Gestante" || s.status === "Seca gestante");
  const servidas = states.filter((s) => s.status === "Servida");
  const dxPend = states.filter((s) => s.dxPendiente);
  const vaciasLargas = states.filter(
    (s) =>
      (s.status === "Vacía" || s.status === "En espera") && (s.del ?? 0) > s.p.diasAbiertosMeta,
  );
  const paraSecar = states.filter(
    (s) =>
      s.status === "Gestante" &&
      s.fpp &&
      daysFromNow(s.fpp) <= s.p.secarAntes &&
      (herd.real || s.animal.milk > 0),
  );
  // Secado por días de lactancia: el que definió cada finca en su registro.
  const porLactancia = herd.real
    ? states.filter((s) => {
        const days = herd.dryOffDays(s.animal.tag);
        return (
          days !== null &&
          !paraSecar.includes(s) &&
          isDryOffDue(
            events
              .filter((e) => e.tag === s.animal.tag)
              .map((e) => ({ type: e.tipo, occurredOn: e.fecha })),
            days,
            iso(today()),
          )
        );
      })
    : [];
  const prontoParto = states.filter((s) => s.fpp && daysFromNow(s.fpp) <= 30);
  const aptas = states.filter((s) => s.status === "Vacía" && (s.del ?? 0) >= s.p.esperaVoluntaria);
  const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const diasAbiertos = prom(
    states.filter((s) => s.diasAbiertos !== null).map((s) => s.diasAbiertos as number),
  );
  const dxHechos = events.filter(
    (e) => e.tipo === "dx" && (sp === "todos" || speciesOf(e.tag) === sp),
  );
  const tasaPrenez = dxHechos.length
    ? (dxHechos.filter((e) => e.resultado === "Preñada").length / dxHechos.length) * 100
    : 0;
  const serviciosTot = events.filter(
    (e) => e.tipo === "servicio" && (sp === "todos" || speciesOf(e.tag) === sp),
  ).length;
  const spc = gest.length
    ? serviciosTot / Math.max(1, dxHechos.filter((e) => e.resultado === "Preñada").length)
    : 0;

  const alerts: AlertItem[] = [
    ...prontoParto.map((s) => ({
      tone: "rojo" as Tone,
      title: `${s.animal.tag} · parto en ${Math.max(0, daysFromNow(s.fpp ?? ""))} días`,
      text: `Fecha probable ${fmtDate(s.fpp ?? "")}. Pase al potrero de maternidad y revise ubre y ligamentos.`,
      action: { label: "Ficha", run: () => setFicha(s.animal.tag) },
    })),
    ...dxPend.map((s) => ({
      tone: s.dxAtrasado ? ("rojo" as Tone) : ("ambar" as Tone),
      title: `${s.animal.tag} · ${s.dxAtrasado ? "diagnóstico atrasado" : "diagnosticar gestación"}`,
      text: `Servida el ${fmtDate(s.servicio ?? "")} (${s.macho ?? "sin dato"}). Ventana: día ${s.p.dxDesde} a ${s.p.dxHasta}.`,
      action: { label: "Registrar", run: () => setForm("dx") },
    })),
    ...paraSecar.map((s) => ({
      tone: "azul" as Tone,
      title: `${s.animal.tag} · programar secado`,
      text: `Faltan ${daysFromNow(s.fpp ?? "")} días para el parto${s.animal.milk > 0 ? ` y aún da ${num(s.animal.milk)} L/día` : ""}.`,
      action: { label: "Secar", run: () => setForm("secado") },
    })),
    ...porLactancia.map((s) => ({
      tone: "azul" as Tone,
      title: `${s.animal.tag} · programar secado`,
      text: `Lleva ${s.del} días de lactancia; la finca seca a los ${herd.dryOffDays(s.animal.tag)}.`,
      action: { label: "Secar", run: () => setForm("secado") },
    })),
    ...vaciasLargas.map((s) => ({
      tone: "rojo" as Tone,
      title: `${s.animal.tag} · ${s.del} días sin concebir`,
      text: `Supera la meta de ${s.p.diasAbiertosMeta} días abiertos. Revise nutrición, anestro, endometritis o calidad del semen.`,
      action: { label: "Ficha", run: () => setFicha(s.animal.tag) },
    })),
    ...aptas.map((s) => ({
      tone: "verde" as Tone,
      title: `${s.animal.tag} · apta para servicio`,
      text: `Ya superó la espera voluntaria (${s.p.esperaVoluntaria} días). Observe celo o programe inseminación.`,
    })),
  ].slice(0, 9);

  // Partos esperados por mes (próximos 10 meses)
  const months = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(today().getFullYear(), today().getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("es-CO", { month: "short" }),
    };
  });
  const byMonth = (s: Species) =>
    months.map(
      (m) =>
        states.filter(
          (x) =>
            x.animal.species === s &&
            x.fpp &&
            `${new Date(`${x.fpp}T12:00:00`).getFullYear()}-${new Date(`${x.fpp}T12:00:00`).getMonth()}` ===
              m.key,
        ).length,
    );

  const hembrasCols: Col<RepState>[] = [
    {
      key: "tag",
      label: "Hembra",
      sort: (s) => s.animal.tag,
      render: (s) => <b className="mono">{s.animal.tag}</b>,
    },
    { key: "sp", label: "Especie", sort: (s) => s.animal.species, render: (s) => s.p.label },
    {
      key: "st",
      label: "Estado",
      sort: (s) => s.status,
      render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>,
    },
    {
      key: "del",
      label: "Días en leche",
      sort: (s) => s.del ?? -1,
      align: "right",
      render: (s) => (s.del === null ? "—" : s.del),
    },
    {
      key: "ab",
      label: "Días abiertos",
      sort: (s) => s.diasAbiertos ?? -1,
      align: "right",
      render: (s) => (s.diasAbiertos === null ? "—" : s.diasAbiertos),
    },
    {
      key: "sv",
      label: "Servicios",
      sort: (s) => s.servicios,
      align: "right",
      render: (s) => s.servicios,
    },
    {
      key: "us",
      label: "Último servicio",
      sort: (s) => s.servicio ?? "",
      render: (s) => (s.servicio ? `${fmtDate(s.servicio)} · ${s.macho ?? ""}` : "—"),
    },
    {
      key: "fpp",
      label: "Parto probable",
      sort: (s) => s.fpp ?? "9",
      render: (s) => (s.fpp ? `${fmtDate(s.fpp)} (${daysFromNow(s.fpp)} d)` : "—"),
    },
  ];

  // Agenda: hitos futuros
  const agenda = states
    .flatMap((s) => {
      const out: { fecha: string; tag: string; titulo: string; tone: Tone }[] = [];
      if (s.status === "Servida" && s.servicio) {
        const m = milestones(s.animal.species, s.servicio);
        out.push({
          fecha: m.dx,
          tag: s.animal.tag,
          titulo: "Diagnóstico de gestación",
          tone: "ambar",
        });
        out.push({
          fecha: m.celoSiVacia,
          tag: s.animal.tag,
          titulo: "Posible retorno a celo (si no está preñada)",
          tone: "gris",
        });
      }
      if (s.fpp && s.servicio) {
        const m = milestones(s.animal.species, s.servicio);
        if (s.status === "Gestante" && s.animal.milk > 0)
          out.push({ fecha: m.secado, tag: s.animal.tag, titulo: "Secado", tone: "azul" });
        out.push({
          fecha: m.preparto,
          tag: s.animal.tag,
          titulo: "Dieta preparto y traslado a maternidad",
          tone: "violeta",
        });
        out.push({
          fecha: m.fpp,
          tag: s.animal.tag,
          titulo: "Fecha probable de parto",
          tone: "rojo",
        });
      }
      if (s.status === "En espera" && s.parto)
        out.push({
          fecha: addDays(s.parto, s.p.esperaVoluntaria),
          tag: s.animal.tag,
          titulo: "Termina espera voluntaria",
          tone: "verde",
        });
      return out;
    })
    .filter((x) => daysFromNow(x.fecha) >= -3 && daysFromNow(x.fecha) <= 120)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  const saveReal = async (kind: Kind, v: Record<string, string>) => {
    const tag = v.tag ?? "";
    const occurredOn = v.fecha ?? iso(today());
    const note = v.obs?.trim() ? { note: v.obs.trim() } : {};
    let event: EventInput;
    let calfWarning: string | null = null;
    if (kind === "servicio") {
      event = {
        type: "servicio",
        occurredOn,
        data: { via: v.via as "IA", sire: v.macho ?? "", ...note },
      };
    } else if (kind === "dx") {
      event = {
        type: "dx",
        occurredOn,
        data: { result: v.resultado as "Preñada", method: v.metodo as "Ecografía", ...note },
      };
    } else if (kind === "parto") {
      const calfTag = v.cria?.trim();
      const calfSex = v.sexo as "Hembra" | "Macho" | "Mellizos" | undefined;
      if (calfTag && (calfSex === "Hembra" || calfSex === "Macho")) {
        calfWarning = await herd.registerCalf(
          tag,
          calfTag,
          calfSex === "Hembra" ? "hembra" : "macho",
          occurredOn,
        );
      }
      event = {
        type: "parto",
        occurredOn,
        data: {
          ...(calfTag ? { calfTag } : {}),
          ...(calfSex ? { calfSex } : {}),
          ...(Number(v.peso) > 0 ? { birthWeightKg: Number(v.peso) } : {}),
          ...(v.facilidad ? { ease: v.facilidad as "Normal" } : {}),
          ...note,
        },
      };
    } else {
      event = { type: kind, occurredOn, data: note };
    }
    await herd.record([{ tag, event }]);
    setForm(null);
    notify(
      calfWarning
        ? `Parto guardado, pero la cría no se creó: ${calfWarning}`
        : "Evento reproductivo guardado. Se enviará al sincronizar.",
      calfWarning ? "warn" : "ok",
    );
  };

  const save = (v: Record<string, string>) => {
    if (!form) return;
    if (herd.real) {
      saveReal(form, v).catch((err: unknown) =>
        notify(err instanceof Error ? err.message : "No se pudo guardar el evento.", "warn"),
      );
      return;
    }
    const e: RepEvent = { tipo: form, tag: v.tag ?? "", fecha: v.fecha ?? iso(today()) };
    for (const k of ["via", "macho", "resultado", "cria", "sexo", "peso", "obs"] as const)
      if (v[k]) e[k] = v[k];
    if (form === "dx" && v.metodo) e.obs = `${v.metodo}${v.obs ? ` · ${v.obs}` : ""}`;
    add(e);
    setForm(null);
    notify("Evento reproductivo registrado (prototipo en este navegador).", "ok");
  };

  const fs = ficha
    ? (states.find((s) => s.animal.tag === ficha) ??
      females.map((a) => repState(a, events)).find((s) => s.animal.tag === ficha))
    : null;
  const fe = ficha
    ? events.filter((e) => e.tag === ficha).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    : [];
  const tagOptions = herd.real
    ? females.map((a) => a.tag)
    : females.filter((a) => a.cat !== "Novilla" || a.weight > 330).map((a) => a.tag);
  const cfg = form ? formFor(form, tagOptions) : null;

  // Calculadora
  const [cSp, setCSp] = useState<Species>("bovino");
  const [cDate, setCDate] = useState(iso(today()));
  const cm = milestones(cSp, cDate);

  const ACTIONS: { kind: Kind; label: string; primary?: boolean }[] = [
    { kind: "servicio", label: "Registrar servicio", primary: true },
    { kind: "dx", label: "Diagnóstico" },
    { kind: "parto", label: "Parto" },
    { kind: "celo", label: "Celo" },
    { kind: "secado", label: "Secado" },
    { kind: "aborto", label: "Aborto" },
  ];

  return (
    <section className="page">
      <PageHead
        kicker="Reproducción"
        icon={<Heart size={30} aria-hidden="true" />}
        title="Reproducción y fertilidad"
        lead="Servicios, diagnósticos, partos y secado con las reglas propias de bovinos y de búfalas."
        actions={ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            className={a.primary ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setForm(a.kind)}
          >
            {a.label}
          </button>
        ))}
      />
      <div className="kit-toolbar">
        <SpeciesFilter value={sp} onChange={setSp} />
        {!herd.real && (
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
        )}
      </div>
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "panel", label: "Panel", badge: alerts.length },
          { key: "hembras", label: "Hembras", badge: states.length },
          { key: "agenda", label: "Agenda", badge: agenda.length },
          { key: "indicadores", label: "Indicadores" },
          { key: "eventos", label: "Eventos" },
          { key: "calculadora", label: "Calculadora" },
        ]}
      />

      {tab === "panel" && (
        <>
          <div className="kit-stats">
            <Stat
              tone="verde"
              icon={<Baby size={18} />}
              label="Gestantes"
              value={gest.length}
              meta={`${prontoParto.length} paren en 30 días`}
            />
            <Stat
              tone="ambar"
              icon={<Stethoscope size={18} />}
              label="Por diagnosticar"
              value={dxPend.length}
              meta={`${servidas.length} servidas sin confirmar`}
            />
            <Stat
              tone="azul"
              icon={<CalendarClock size={18} />}
              label="Días abiertos (prom.)"
              value={num(diasAbiertos, 0)}
              meta="Desde el último parto"
              goal={sp === "bufalino" ? "≤ 150 d" : "≤ 110 d"}
            />
            <Stat
              tone="violeta"
              icon={<Syringe size={18} />}
              label="Tasa de preñez"
              value={`${num(tasaPrenez, 0)} %`}
              meta={`${dxHechos.length} diagnósticos`}
              goal="≥ 50 %"
            />
            <Stat
              tone="rojo"
              label="Vacías sobre la meta"
              value={vaciasLargas.length}
              meta="Requieren revisión"
            />
            <Stat
              tone="verde"
              label="Servicios por concepción"
              value={num(spc, 1)}
              meta="Servicios / preñeces"
              goal="≤ 2,0"
            />
          </div>
          <div className="kit-grid2">
            <Panel
              title="Atención hoy"
              sub="Lo que el veterinario debería resolver primero."
              icon={<CalendarClock size={20} />}
            >
              <Alerts items={alerts} />
            </Panel>
            <Panel
              title="Estado del hato reproductivo"
              sub={`${states.length} hembras en el análisis`}
            >
              <Donut
                center={
                  <>
                    <strong>{states.length}</strong>
                    <small>hembras</small>
                  </>
                }
                slices={(Object.keys(STATUS_TONE) as RepStatus[])
                  .map((k) => ({ label: k, value: count(k), tone: STATUS_TONE[k] }))
                  .filter((s) => s.value > 0)}
                format={(n) => String(n)}
              />
            </Panel>
          </div>
          <Panel
            title="Partos esperados por mes"
            sub="Según la fecha probable de parto de las gestantes"
          >
            <BarChart
              labels={months.map((m) => m.label)}
              stacked
              series={[
                ...(sp !== "bufalino"
                  ? [{ name: "Bovinos", tone: "azul" as Tone, values: byMonth("bovino") }]
                  : []),
                ...(sp !== "bovino"
                  ? [{ name: "Búfalas", tone: "violeta" as Tone, values: byMonth("bufalino") }]
                  : []),
              ]}
            />
          </Panel>
        </>
      )}

      {tab === "hembras" && (
        <Panel
          title="Hembras en producción y reproducción"
          sub="Toque una fila para ver la ficha y la línea de tiempo."
        >
          <DataTable
            cols={hembrasCols}
            rows={states}
            search={(s) => `${s.animal.tag} ${s.status} ${s.macho ?? ""}`}
            placeholder="Buscar por arete, estado o reproductor…"
            onRow={(s) => setFicha(s.animal.tag)}
          />
        </Panel>
      )}

      {tab === "agenda" && (
        <Panel
          title="Agenda reproductiva"
          sub="Próximos 120 días, generada a partir de cada servicio y parto."
        >
          <Timeline
            items={agenda.map((a) => ({
              date: a.fecha,
              title: `${a.tag} · ${a.titulo}`,
              text:
                daysFromNow(a.fecha) <= 0 ? "Hoy o atrasado" : `en ${daysFromNow(a.fecha)} días`,
              tone: a.tone,
            }))}
          />
        </Panel>
      )}

      {tab === "indicadores" && (
        <>
          <Panel
            title="Bovinos frente a búfalas"
            sub="Valores de referencia editables por el veterinario de la finca."
          >
            <div className="ptable-wrap">
              <table className="ptable">
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    <th>Bovinos</th>
                    <th>Búfalas</th>
                    <th>Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Gestación",
                      `${PARAMS.bovino.gestacion} días`,
                      `${PARAMS.bufalino.gestacion} días`,
                      "La búfala gesta unas cinco semanas más.",
                    ],
                    [
                      "Pubertad",
                      `${PARAMS.bovino.pubertadMeses} meses`,
                      `${PARAMS.bufalino.pubertadMeses} meses`,
                      "Sirva por peso y desarrollo, no solo por edad.",
                    ],
                    [
                      "Primer parto (meta)",
                      `${PARAMS.bovino.primerPartoMeses} meses`,
                      `${PARAMS.bufalino.primerPartoMeses} meses`,
                      "Adelantarlo acorta la vida improductiva.",
                    ],
                    [
                      "Espera voluntaria",
                      `${PARAMS.bovino.esperaVoluntaria} días`,
                      `${PARAMS.bufalino.esperaVoluntaria} días`,
                      "Antes de esto el útero aún involuciona.",
                    ],
                    [
                      "Días abiertos (meta)",
                      `≤ ${PARAMS.bovino.diasAbiertosMeta}`,
                      `≤ ${PARAMS.bufalino.diasAbiertosMeta}`,
                      "Cada día extra cuesta leche y terneros.",
                    ],
                    [
                      "Intervalo entre partos",
                      `≈ ${PARAMS.bovino.iepMeta} d`,
                      `≈ ${PARAMS.bufalino.iepMeta} d`,
                      "En búfalas es mayor por el celo silente y la estacionalidad.",
                    ],
                    [
                      "Ciclo estral",
                      "21 días",
                      "21 días (más variable)",
                      "Observe con más frecuencia a las búfalas.",
                    ],
                    [
                      "Diagnóstico de gestación",
                      "30–45 días",
                      "35–60 días",
                      "La ecografía temprana ahorra días abiertos.",
                    ],
                  ].map((r) => (
                    <tr key={r[0]}>
                      {r.map((c, i) => (
                        <td
                          key={`${r[0]}${i}`}
                          data-label={["Parámetro", "Bovinos", "Búfalas", "Lectura"][i]}
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
          <div className="kit-grid2">
            <Panel title="Desempeño actual" sub="Calculado con los eventos registrados.">
              <Progress
                label="Tasa de preñez"
                value={tasaPrenez}
                tone={tasaPrenez >= 50 ? "verde" : "ambar"}
                right={`${num(tasaPrenez, 0)} % · meta ≥ 50 %`}
              />
              <Progress
                label="Hembras sin servicio y aptas"
                value={aptas.length}
                max={Math.max(1, states.length)}
                tone="ambar"
                right={`${aptas.length} de ${states.length}`}
              />
              <Progress
                label="Diagnósticos al día"
                value={states.length - dxPend.length}
                max={Math.max(1, states.length)}
                tone="verde"
                right={`${dxPend.length} pendientes`}
              />
              <Progress
                label="Vacías dentro de la meta"
                value={states.length - vaciasLargas.length}
                max={Math.max(1, states.length)}
                tone={vaciasLargas.length ? "rojo" : "verde"}
                right={`${vaciasLargas.length} sobre la meta`}
              />
            </Panel>
            <Panel
              title="Estacionalidad de partos"
              sub="En búfalas la actividad sexual baja en ciertas épocas."
            >
              <BarChart
                labels={["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]}
                series={[
                  { name: "Bovinos", tone: "azul", values: [5, 4, 6, 7, 6, 5, 4, 5, 6, 5, 4, 5] },
                  {
                    name: "Búfalas",
                    tone: "violeta",
                    values: [1, 1, 2, 3, 4, 2, 1, 0, 1, 2, 3, 4],
                  },
                ]}
                height={170}
              />
              <p className="hint">
                Datos de ejemplo. Con el historial real se verá cuándo conviene concentrar los
                servicios en búfalas.
              </p>
            </Panel>
          </div>
        </>
      )}

      {tab === "eventos" && (
        <Panel title="Historial de eventos" sub={`${events.length} eventos reproductivos`}>
          <DataTable
            cols={[
              {
                key: "f",
                label: "Fecha",
                sort: (e: RepEvent) => e.fecha,
                render: (e) => fmtDate(e.fecha),
              },
              {
                key: "t",
                label: "Tipo",
                sort: (e) => e.tipo,
                render: (e) => (
                  <Badge
                    tone={
                      e.tipo === "parto"
                        ? "azul"
                        : e.tipo === "aborto"
                          ? "rojo"
                          : e.tipo === "dx"
                            ? "ambar"
                            : "verde"
                    }
                  >
                    {e.tipo === "dx" ? "diagnóstico" : e.tipo}
                  </Badge>
                ),
              },
              {
                key: "tag",
                label: "Hembra",
                sort: (e) => e.tag,
                render: (e) => <b className="mono">{e.tag}</b>,
              },
              {
                key: "d",
                label: "Detalle",
                render: (e) =>
                  [
                    e.via,
                    e.macho,
                    e.resultado,
                    e.cria && `cría ${e.cria}`,
                    e.peso && `${e.peso} kg`,
                    e.obs,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—",
              },
            ]}
            rows={[...events]
              .filter((e) => sp === "todos" || speciesOf(e.tag) === sp)
              .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))}
            search={(e) => `${e.tag} ${e.tipo} ${e.macho ?? ""} ${e.obs ?? ""}`}
          />
        </Panel>
      )}

      {tab === "calculadora" && (
        <Panel
          title="Calculadora de fechas"
          sub="Escriba la fecha del servicio y obtenga todos los hitos."
        >
          <div className="kf-grid">
            <label htmlFor="c-sp">
              Especie
              <select id="c-sp" value={cSp} onChange={(e) => setCSp(e.target.value as Species)}>
                <option value="bovino">Bovino ({PARAMS.bovino.gestacion} d)</option>
                <option value="bufalino">Bufalino ({PARAMS.bufalino.gestacion} d)</option>
              </select>
            </label>
            <label htmlFor="c-d">
              Fecha del servicio
              <input
                id="c-d"
                type="date"
                value={cDate}
                onChange={(e) => setCDate(e.target.value)}
              />
            </label>
          </div>
          <ul className="kit-facts big">
            <li>
              <span>Diagnóstico de gestación</span>
              <b>{fmtDate(cm.dx)}</b>
            </li>
            <li>
              <span>Retorno a celo si está vacía</span>
              <b>{fmtDate(cm.celoSiVacia)}</b>
            </li>
            <li>
              <span>Secado</span>
              <b>{fmtDate(cm.secado)}</b>
            </li>
            <li>
              <span>Dieta preparto</span>
              <b>{fmtDate(cm.preparto)}</b>
            </li>
            <li>
              <span>Fecha probable de parto</span>
              <b>{fmtDate(cm.fpp)}</b>
            </li>
          </ul>
        </Panel>
      )}

      {cfg && form && (
        <FormDialog
          open
          title={cfg.title}
          sub={cfg.sub}
          fields={cfg.fields}
          preview={(v) => previewFor(form, v, speciesOf)}
          onSubmit={save}
          onClose={() => setForm(null)}
        />
      )}

      <dialog
        ref={fichaRef}
        className="dialog dialog-form"
        onClose={() => setFicha(null)}
        aria-labelledby="fh-title"
      >
        {fs && (
          <div>
            <header className="dialog-head">
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => fichaRef.current?.close()}
              >
                ✕
              </button>
              <h2 id="fh-title">Ficha reproductiva · {fs.animal.tag}</h2>
            </header>
            <div className="dialog-body">
              <section className="fsec">
                <div className="kit-stats tight">
                  <Stat
                    tone={STATUS_TONE[fs.status]}
                    label="Estado"
                    value={fs.status}
                    meta={`${fs.p.label} · ${fs.animal.breed}`}
                  />
                  <Stat
                    tone="azul"
                    label="Días en leche"
                    value={fs.del ?? "—"}
                    meta={fs.parto ? `Parto ${fmtDate(fs.parto)}` : "Sin parto"}
                  />
                  <Stat
                    tone="violeta"
                    label="Parto probable"
                    value={fs.fpp ? fmtDate(fs.fpp) : "—"}
                    meta={fs.fpp ? `en ${daysFromNow(fs.fpp)} días` : "No gestante"}
                  />
                </div>
                <h3 className="fsec-t">Recomendación</h3>
                <p>
                  {fs.status === "Gestante" && fs.fpp && daysFromNow(fs.fpp) <= 30
                    ? "Maternidad: vigile ubre, ligamentos y comportamiento; tenga listo el calostro."
                    : fs.status === "Servida"
                      ? `Programe el diagnóstico entre el día ${fs.p.dxDesde} y ${fs.p.dxHasta} del servicio.`
                      : fs.status === "Vacía" && (fs.del ?? 0) > fs.p.diasAbiertosMeta
                        ? "Supera los días abiertos de la meta: revise condición corporal, ciclicidad y semen; considere sincronización."
                        : fs.status === "Vacía"
                          ? "Apta para servicio: observe celo o programe inseminación."
                          : fs.status === "Parto reciente"
                            ? "Vigile retención de placenta, hipocalcemia y cetosis en las primeras semanas."
                            : "Siga el plan reproductivo y registre los eventos."}
                </p>
                <h3 className="fsec-t">Línea de tiempo</h3>
                <Timeline
                  items={fe.map((e) => ({
                    date: e.fecha,
                    title:
                      e.tipo === "dx"
                        ? `Diagnóstico: ${e.resultado}`
                        : e.tipo[0]?.toUpperCase() + e.tipo.slice(1),
                    text: [e.via, e.macho, e.cria && `cría ${e.cria}`, e.obs]
                      .filter(Boolean)
                      .join(" · "),
                    tone:
                      e.tipo === "parto"
                        ? "azul"
                        : e.tipo === "aborto"
                          ? "rojo"
                          : e.tipo === "dx"
                            ? "ambar"
                            : "verde",
                  }))}
                />
                {!herd.real && animalOf(fs.animal.tag) && (
                  <p className="hint">
                    Hato demostrativo · lote {fs.animal.lot} · {fs.animal.weight} kg
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
