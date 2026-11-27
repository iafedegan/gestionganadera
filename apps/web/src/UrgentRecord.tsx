import type { UrgentAnimalRecord } from "@ganaderia/contracts";
import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { art } from "./art";
import {
  CATEGORY_LABEL,
  REASON_LABEL,
  SPECIES_LABEL,
  STATUS_LABEL,
  fecha,
  todayLocal,
} from "./labels";
import { ageText } from "./lib/animalTags";

/** Hoja de vida y trazabilidad del animal que llega con un aviso urgente. */

const TYPE: Record<string, string> = {
  entrada: "Ingreso a la finca",
  salud: "Sanidad",
  cmt: "Prueba de mastitis (CMT)",
  servicio: "Servicio",
  celo: "Celo",
  dx: "Diagnóstico de preñez",
  parto: "Parto",
  aborto: "Aborto",
  secado: "Secado",
  leche: "Ordeño",
  peso: "Pesaje",
};
const FIELD: Record<string, string> = {
  kind: "Tipo",
  product: "Producto",
  reason: "Motivo",
  dose: "Dosis",
  responsible: "Responsable",
  milkWithdrawalDays: "Retiro de leche (días)",
  meatWithdrawalDays: "Retiro de carne (días)",
  result: "Resultado",
  method: "Método",
  via: "Vía",
  sire: "Reproductor",
  calfTag: "Cría",
  calfSex: "Sexo de la cría",
  birthWeightKg: "Peso al nacer (kg)",
  liters: "Litros",
  shift: "Jornada",
  kg: "Kilos",
  note: "Nota",
  AI: "Anterior izq.",
  AD: "Anterior der.",
  PI: "Posterior izq.",
  PD: "Posterior der.",
};

const detail = (data: Record<string, unknown>) =>
  Object.entries(data)
    .filter(([k, v]) => FIELD[k] && v !== null && v !== "" && v !== 0)
    .map(([k, v]) => `${FIELD[k]}: ${String(v)}`)
    .join(" · ");

function Timeline({ events }: { events: UrgentAnimalRecord["events"] }) {
  return (
    <ol className="ur-time">
      {events.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: historial de solo lectura
        <li key={i}>
          <strong>{TYPE[e.type] ?? e.type}</strong> <small>{fecha(e.occurredOn)}</small>
          <p>{detail(e.data)}</p>
        </li>
      ))}
    </ol>
  );
}

const TABS = [
  ["resumen", "Resumen"],
  ["clinica", "Historia"],
  ["produccion", "Producción"],
] as const;

/** Pantalla completa con la hoja de vida, ordenada en tres pestañas. */
export function UrgentRecordSheet(props: {
  animal: UrgentAnimalRecord;
  onClose(): void;
  onAttend?(): void;
}) {
  const a = props.animal;
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("resumen");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // Lo clínico y reproductivo aparte de ordeños y pesajes.
  const care = a.events.filter((e) => e.type !== "leche" && e.type !== "peso");
  const output = a.events.filter((e) => e.type === "peso" || e.type === "leche");
  const facts: [string, string][] = [
    ["Especie", SPECIES_LABEL[a.species] ?? a.species],
    ["Sexo", a.sex === "hembra" ? "Hembra" : "Macho"],
    ["Edad", ageText(a.birthDate, todayLocal()) || "Sin dato"],
    ["Estado", STATUS_LABEL[a.status] ?? a.status],
    ["Madre", a.motherTag ?? "Sin dato"],
    ["Padre", a.fatherTag ?? "Sin dato"],
  ];
  const trace: [string, string][] = [
    ["Predio actual", a.farmName],
    [
      "Ingreso",
      a.entry
        ? `${REASON_LABEL[a.entry.reason] ?? a.entry.reason}${a.entry.occurredAt ? ` · ${fecha(a.entry.occurredAt.slice(0, 10))}` : ""}`
        : "Sin dato registrado",
    ],
    [
      "Bosque",
      a.forest
        ? `${a.forest.lossAfterCutoffHa > 0 ? `${a.forest.lossAfterCutoffHa} ha de pérdida desde 2021` : "Sin pérdida desde 2021"} · ${fecha(a.forest.checkedAt.slice(0, 10))}`
        : "Finca sin revisión satelital",
    ],
  ];
  return (
    <dialog ref={ref} className="urs" onClose={props.onClose} aria-labelledby="urs-title">
      <header className="urs-hero">
        <button
          type="button"
          className="urs-close"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          <X size={22} />
        </button>
        <img src={art(a.species === "bufalino" ? "ficha-buffalo" : "ficha-cow")} alt="" />
        <h2 id="urs-title">{a.tag}</h2>
        <p>
          {CATEGORY_LABEL[a.category] ?? a.category} · {a.farmName}
        </p>
        <div className="urs-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? "on" : ""}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="urs-body">
        {tab === "resumen" && (
          <>
            <dl className="urs-facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>Trazabilidad</h3>
            <ol className="ur-time">
              {trace.map(([k, v]) => (
                <li key={k}>
                  <strong>{k}</strong>
                  <p>{v}</p>
                </li>
              ))}
            </ol>
          </>
        )}
        {tab === "clinica" &&
          (care.length ? <Timeline events={care} /> : <p>Sin registros clínicos.</p>)}
        {tab === "produccion" &&
          (output.length ? <Timeline events={output} /> : <p>Sin ordeños ni pesajes.</p>)}
      </div>
      {props.onAttend && (
        <footer className="urs-foot">
          <button type="button" className="urg-btn urg-red" onClick={props.onAttend}>
            <Send size={20} aria-hidden="true" /> Voy a atender
          </button>
        </footer>
      )}
    </dialog>
  );
}
