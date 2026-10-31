import { Baby, Droplet, Heart, Milk, Scale, ShieldAlert, Stethoscope, Syringe } from "lucide-react";
import type { ReactNode } from "react";
import { CMT_LEVELS, type RepEvent, repState } from "./herd";
import { toAnimal, toRep } from "./herdData";
import { LineChart, num } from "./kit";
import { fecha, todayLocal } from "./labels";
import { activeWithdrawals, milkSummary, weightSummary } from "./lib/animalHistory";
import type { LocalAnimalEvent, LocalHerdAnimal } from "./lib/localdb";

/** Pestañas de la hoja de vida con el historial real del animal. Solo muestran lo registrado. */

function Empty(props: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {props.icon}
      <p>{props.text}</p>
    </div>
  );
}

function Fact(props: { label: string; value: ReactNode; meta?: string }) {
  return (
    <div className="hist-fact">
      <small>{props.label}</small>
      <strong>{props.value}</strong>
      {props.meta && <small>{props.meta}</small>}
    </div>
  );
}

const Pending = ({ e }: { e: LocalAnimalEvent }) =>
  e.syncState === "sincronizado" ? null : <small className="hist-pending">Sin enviar</small>;

const CMT_QUARTERS = [
  ["AI", "Anterior izq."],
  ["AD", "Anterior der."],
  ["PI", "Posterior izq."],
  ["PD", "Posterior der."],
] as const;

export function ClinicalHistory({ events }: { events: LocalAnimalEvent[] }) {
  const clinical = events.filter((e) => e.type === "salud" || e.type === "cmt");
  const withdrawal = activeWithdrawals(events, todayLocal());
  if (clinical.length === 0) {
    return (
      <Empty
        icon={<Stethoscope size={26} aria-hidden="true" />}
        text="Sin vacunas, tratamientos ni pruebas registradas. Se registran en Sanidad."
      />
    );
  }
  return (
    <>
      {(withdrawal.milkUntil || withdrawal.meatUntil) && (
        <div className="banner banner-warn hist-alert" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>
            <strong>En retiro.</strong>
            {withdrawal.milkUntil && ` Leche hasta el ${fecha(withdrawal.milkUntil)}.`}
            {withdrawal.meatUntil && ` Carne hasta el ${fecha(withdrawal.meatUntil)}.`}
          </span>
        </div>
      )}
      <ul className="timeline">
        {clinical.map((e) => {
          if (e.type === "salud") {
            const d = e.data;
            return (
              <li key={e.id}>
                <span className="tl-dot" aria-hidden="true">
                  <Syringe size={14} />
                </span>
                <div>
                  <strong>
                    {d.kind} · {d.product}
                  </strong>
                  <span>{fecha(e.occurredOn)}</span>
                  {d.reason && <small>Motivo: {d.reason}</small>}
                  {d.dose && <small>Dosis: {d.dose}</small>}
                  {d.responsible && <small>Responsable: {d.responsible}</small>}
                  {(d.milkWithdrawalDays > 0 || d.meatWithdrawalDays > 0) && (
                    <small>
                      Retiro: leche {d.milkWithdrawalDays} d · carne {d.meatWithdrawalDays} d
                    </small>
                  )}
                  <Pending e={e} />
                </div>
              </li>
            );
          }
          if (e.type !== "cmt") return null;
          const max = Math.max(e.data.AI, e.data.AD, e.data.PI, e.data.PD);
          return (
            <li key={e.id}>
              <span className="tl-dot" aria-hidden="true">
                <Droplet size={14} />
              </span>
              <div>
                <strong>
                  Prueba CMT{max >= 4 ? " · mastitis" : max === 3 ? " · sospechosa" : " · normal"}
                </strong>
                <span>{fecha(e.occurredOn)}</span>
                <small>
                  {CMT_QUARTERS.map(([q, label]) => `${label}: ${CMT_LEVELS[e.data[q]]}`).join(
                    " · ",
                  )}
                </small>
                <Pending e={e} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const repDetail = (e: RepEvent) =>
  [
    e.via,
    e.macho && `Reproductor: ${e.macho}`,
    e.resultado,
    e.cria && `Cría: ${e.cria}`,
    e.sexo,
    e.peso && `${e.peso} kg al nacer`,
    e.obs,
  ]
    .filter(Boolean)
    .join(" · ");

const REP_LABEL: Record<RepEvent["tipo"], string> = {
  servicio: "Servicio",
  celo: "Celo",
  dx: "Diagnóstico de gestación",
  parto: "Parto",
  aborto: "Aborto",
  secado: "Secado",
};

export function ReproductiveHistory(props: {
  animal: LocalHerdAnimal;
  events: LocalAnimalEvent[];
}) {
  const reproductive = props.events.flatMap((e) => {
    const rep = toRep(e);
    return rep ? [{ e, rep }] : [];
  });
  if (reproductive.length === 0) {
    return (
      <Empty
        icon={<Heart size={26} aria-hidden="true" />}
        text="Sin servicios, partos ni diagnósticos registrados. Se registran en Reproducción."
      />
    );
  }
  const state = repState(
    toAnimal(props.animal, []),
    reproductive.map((r) => r.rep),
  );
  const partos = reproductive.filter((r) => r.rep.tipo === "parto").length;
  return (
    <>
      <div className="hist-facts">
        <Fact label="Estado" value={state.status} />
        <Fact label="Partos" value={num(partos)} />
        {state.del !== null && <Fact label="Días desde el parto" value={num(state.del)} />}
        <Fact label="Servicios desde el parto" value={num(state.servicios)} />
        {state.fpp && <Fact label="Parto probable" value={fecha(state.fpp)} />}
      </div>
      <ul className="timeline">
        {reproductive.map(({ e, rep }) => (
          <li key={e.id}>
            <span className="tl-dot" aria-hidden="true">
              {rep.tipo === "parto" ? <Baby size={14} /> : <Heart size={14} />}
            </span>
            <div>
              <strong>{REP_LABEL[rep.tipo]}</strong>
              <span>{fecha(rep.fecha)}</span>
              {repDetail(rep) && <small>{repDetail(rep)}</small>}
              <Pending e={e} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function MilkHistory({ events }: { events: LocalAnimalEvent[] }) {
  const m = milkSummary(events);
  if (m.days.length === 0) {
    return (
      <Empty
        icon={<Milk size={26} aria-hidden="true" />}
        text={
          m.since
            ? "Sin ordeños registrados en esta lactancia. Se registran en Producción."
            : "Sin ordeños registrados. Se registran en Producción."
        }
      />
    );
  }
  return (
    <>
      <div className="hist-facts">
        <Fact label="Promedio por día" value={`${num(m.average, 1)} L`} />
        <Fact
          label="Pico de la lactancia"
          value={`${num(m.peak?.liters ?? 0, 1)} L`}
          {...(m.peak ? { meta: fecha(m.peak.date) } : {})}
        />
        <Fact
          label="Total de la lactancia"
          value={`${num(m.total, 1)} L`}
          {...(m.since ? { meta: `Desde el ${fecha(m.since)}` } : {})}
        />
      </div>
      {m.days.length > 1 && (
        <LineChart
          height={170}
          unit="L"
          labels={m.days.map((d) => shortDate(d.date))}
          series={[{ name: "Litros por día", tone: "azul", points: m.days.map((d) => d.liters) }]}
        />
      )}
      <ul className="hist-rows">
        {[...m.days].reverse().map((d) => (
          <li key={d.date}>
            <span>{fecha(d.date)}</span>
            <strong>{num(d.liters, 1)} L</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

const gain = (g: number | null) => (g === null ? "—" : `${g > 0 ? "+" : ""}${num(g, 0)} g/día`);

export function WeightHistory({ events }: { events: LocalAnimalEvent[] }) {
  const w = weightSummary(events);
  if (!w.last) {
    return (
      <Empty
        icon={<Scale size={26} aria-hidden="true" />}
        text="Sin pesajes registrados. Se registran en Producción."
      />
    );
  }
  return (
    <>
      <div className="hist-facts">
        <Fact label="Último peso" value={`${num(w.last.kg, 1)} kg`} meta={fecha(w.last.date)} />
        <Fact label="Ganancia promedio" value={gain(w.averageGainG)} />
      </div>
      {w.rows.length > 1 && (
        <LineChart
          height={170}
          unit="kg"
          labels={w.rows.map((r) => shortDate(r.date))}
          series={[{ name: "Peso", tone: "verde", points: w.rows.map((r) => r.kg) }]}
        />
      )}
      <ul className="hist-rows">
        {[...w.rows].reverse().map((r, i) => (
          <li key={`${r.date}-${i}`}>
            <span>
              {fecha(r.date)} · {r.method}
            </span>
            <strong>{num(r.kg, 1)} kg</strong>
            <small>{gain(r.dailyGainG)}</small>
          </li>
        ))}
      </ul>
    </>
  );
}
