import type { UrgentAnimalRecord } from "@ganaderia/contracts";
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

export function UrgentRecord({ animal: a }: { animal: UrgentAnimalRecord }) {
  // Lo clínico y reproductivo va a la vista; ordeños y pesajes, en listas aparte.
  const care = a.events.filter((e) => e.type !== "leche" && e.type !== "peso");
  const weights = a.events.filter((e) => e.type === "peso");
  const milk = a.events.filter((e) => e.type === "leche");
  const facts: [string, string][] = [
    ["Especie", SPECIES_LABEL[a.species as "bovino"] ?? a.species],
    ["Categoría", CATEGORY_LABEL[a.category] ?? a.category],
    ["Sexo", a.sex === "hembra" ? "Hembra" : "Macho"],
    ["Edad", ageText(a.birthDate, todayLocal()) || "Sin dato"],
    ["Estado", STATUS_LABEL[a.status] ?? a.status],
    ["Madre", a.motherTag ?? "Sin dato"],
    ["Padre", a.fatherTag ?? "Sin dato"],
  ];
  return (
    <div className="ur">
      <header>
        <img src={art(a.species === "bufalino" ? "ficha-buffalo" : "ficha-cow")} alt="" />
        <div>
          <strong>{a.tag}</strong>
          <small>{a.farmName}</small>
        </div>
      </header>
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Trazabilidad</h4>
      <ul className="ur-trace">
        <li>Predio actual: {a.farmName}</li>
        <li>
          Ingreso:{" "}
          {a.entry
            ? `${REASON_LABEL[a.entry.reason] ?? a.entry.reason}${a.entry.occurredAt ? ` · ${fecha(a.entry.occurredAt.slice(0, 10))}` : ""}`
            : "sin dato registrado"}
        </li>
        <li>
          Bosque:{" "}
          {a.forest
            ? `${a.forest.lossAfterCutoffHa > 0 ? `${a.forest.lossAfterCutoffHa} ha de pérdida desde 2021` : "sin pérdida desde 2021"} (revisado ${fecha(a.forest.checkedAt.slice(0, 10))})`
            : "finca sin revisión satelital"}
        </li>
      </ul>
      <h4>Historia clínica y reproductiva ({care.length})</h4>
      {care.length ? <Timeline events={care} /> : <p>Sin registros.</p>}
      {weights.length > 0 && (
        <details>
          <summary>Pesajes ({weights.length})</summary>
          <Timeline events={weights} />
        </details>
      )}
      {milk.length > 0 && (
        <details>
          <summary>Ordeños ({milk.length})</summary>
          <Timeline events={milk} />
        </details>
      )}
    </div>
  );
}
