import type { UrgentAlertDto } from "@ganaderia/contracts";
import { AlertTriangle, CheckCircle2, MessageCircle, Phone, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { UrgentRecord } from "./UrgentRecord";
import { useActiveFarm, useFarms } from "./animals";
import { fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { haptic } from "./native";
import { useApp } from "./state";

/**
 * Emergencias: la aplicación no responde por su cuenta, avisa al veterinario del equipo.
 * Quien reporta ve cuándo confirman; el veterinario ve el aviso apenas abre la aplicación.
 */

export interface PickedAnimal {
  id: string;
  tag: string;
}

export interface EmergencyState {
  reason: string;
  message: string;
  status: "enviando" | "enviado" | "sin_senal" | "error";
  animal: PickedAnimal | null;
  alert?: UrgentAlertDto;
  detail?: string;
}

const EVERY = 15_000;

/** Avisos recientes, revisados cada pocos segundos mientras la app está abierta. */
export function useUrgentList(active: boolean) {
  const { orgId, online } = useApp();
  const [items, setItems] = useState<UrgentAlertDto[]>([]);
  const load = useCallback(() => {
    if (!orgId || !online || document.hidden) return;
    api.urgent(orgId).then(
      (r) => setItems(r.items),
      () => undefined,
    );
  }, [orgId, online]);
  useEffect(() => {
    if (!active) return;
    load();
    const t = setInterval(load, EVERY);
    document.addEventListener("visibilitychange", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [active, load]);
  return { items, reload: load };
}

export function useEmergencyAlert() {
  const { orgId } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [state, setState] = useState<EmergencyState | null>(null);
  const farmId = active || (farms.length === 1 ? farms[0]?.id : undefined);
  const { items } = useUrgentList(state?.status === "enviado" && !state.alert?.ackBy);

  const send = useCallback(
    async (reason: string, message: string, animal: PickedAnimal | null) => {
      setState({ reason, message, animal, status: "enviando" });
      try {
        const alert = await api.urgentCreate({
          organizationId: orgId,
          ...(animal ? { animalId: animal.id } : farmId ? { farmId } : {}),
          reason,
          message: message.slice(0, 1500),
        });
        setState({ reason, message, animal, status: "enviado", alert });
      } catch (e) {
        setState({
          reason,
          message,
          animal,
          status: e instanceof NetworkError ? "sin_senal" : "error",
          ...(e instanceof ApiError ? { detail: e.message } : {}),
        });
      }
    },
    [orgId, farmId],
  );

  const fresh = items.find((a) => a.id === state?.alert?.id);
  const alert = state && fresh ? { ...state, alert: fresh } : state;
  const clear = useCallback(() => setState(null), []);
  return { alert, send, clear };
}

/** Número para llamar o escribir; a los celulares colombianos se les antepone el 57. */
const digits = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `57${d}` : d;
};

export function EmergencyCard(props: { alert: EmergencyState; onRetry(): void }) {
  const { status, reason, detail, alert, message } = props.alert;
  const vets = alert?.recipients ?? [];
  const names = vets.map((v) => v.name).join(", ");
  const phone = vets.find((v) => v.phone)?.phone;
  const text = `URGENTE (${reason})${props.alert.animal ? ` · animal ${props.alert.animal.tag}` : ""}: ${message}`;
  return (
    <section className="emg" role="alert">
      <header>
        <AlertTriangle size={24} aria-hidden="true" />
        <div>
          <strong>Emergencia: {reason}</strong>
          <p>No espere una respuesta del asistente: esto lo atiende su veterinario.</p>
        </div>
      </header>
      {alert?.animal && (
        <p className="emg-state">
          Se envió la hoja de vida de {alert.animal.tag} con su trazabilidad (
          {alert.animal.events.length} registros).
        </p>
      )}
      {status === "enviando" && <p className="emg-state">Avisando al veterinario…</p>}
      {status === "enviado" && !alert?.ackBy && (
        <p className="emg-state">
          <Send size={18} aria-hidden="true" />
          {vets.length > 0
            ? `Aviso enviado a ${names}. Esperando que confirme…`
            : "No hay veterinario en su equipo. Invítelo en Configuración y llame ya."}
        </p>
      )}
      {alert?.ackBy && alert.ackAt && (
        <p className="emg-state ok">
          <CheckCircle2 size={18} aria-hidden="true" /> {alert.ackBy} confirmó que atiende (
          {fechaHora(alert.ackAt)}).
        </p>
      )}
      {(status === "sin_senal" || status === "error") && (
        <>
          <p className="emg-state">
            El aviso NO se envió.{" "}
            {status === "sin_senal" ? "No hay señal: llame." : (detail ?? "Hubo un error.")}
          </p>
          <button type="button" className="emg-btn" onClick={props.onRetry}>
            <Send size={18} aria-hidden="true" /> Intentar de nuevo
          </button>
        </>
      )}
      {vets.map((v) =>
        v.phone ? (
          <a key={v.name} className="emg-btn" href={`tel:+${digits(v.phone)}`}>
            <Phone size={18} aria-hidden="true" /> Llamar a {v.name}
          </a>
        ) : null,
      )}
      {status !== "enviando" && (
        <a
          className="emg-btn emg-wa"
          href={`https://wa.me/${phone ? digits(phone) : ""}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} aria-hidden="true" /> Avisar también por WhatsApp
        </a>
      )}
    </section>
  );
}

/** La emergencia pregunta primero por el animal, para enviar su hoja de vida. */
export function AnimalAsk(props: {
  reason: string;
  animals: PickedAnimal[];
  onPick(a: PickedAnimal | null): void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toUpperCase();
  const found = term
    ? props.animals.filter((a) => a.tag.toUpperCase().includes(term)).slice(0, 8)
    : [];
  return (
    <section className="emg" role="alert">
      <header>
        <AlertTriangle size={24} aria-hidden="true" />
        <div>
          <strong>Emergencia: {props.reason}</strong>
          <p>¿Qué animal es? Escriba su arete y tóquelo: se envía su hoja de vida.</p>
        </div>
      </header>
      <input
        className="emg-input"
        value={q}
        placeholder="Ej. CE-004"
        aria-label="Arete del animal"
        autoCapitalize="characters"
        onChange={(e) => setQ(e.target.value)}
      />
      {found.map((a) => (
        <button key={a.id} type="button" className="emg-btn" onClick={() => props.onPick(a)}>
          <Send size={18} aria-hidden="true" /> Avisar por {a.tag}
        </button>
      ))}
      {term && found.length === 0 && <p className="emg-state">No hay un animal con ese arete.</p>}
      <button type="button" className="emg-skip" onClick={() => props.onPick(null)}>
        No sé el arete o son varios: avisar ya
      </button>
    </section>
  );
}

/** Franja roja para quien atiende: veterinario, asesor o dueño. */
export function UrgentBanner() {
  const { notify } = useApp();
  const { items, reload } = useUrgentList(true);
  const seen = useRef(new Set<string>());
  const open = items.filter((a) => a.canAck && !a.mine && !a.ackBy);

  useEffect(() => {
    const fresh = open.filter((a) => !seen.current.has(a.id));
    if (fresh.length === 0) return;
    for (const a of fresh) seen.current.add(a.id);
    haptic(400);
  }, [open]);

  if (open.length === 0) return null;
  return (
    <div className="urgent-list">
      {open.map((a) => (
        <section key={a.id} className="emg" role="alert">
          <header>
            <AlertTriangle size={24} aria-hidden="true" />
            <div>
              <strong>URGENTE: {a.reason}</strong>
              <p>
                {a.authorName}
                {a.farmName ? ` · ${a.farmName}` : ""} · {fechaHora(a.createdAt)}
              </p>
              <p>«{a.message}»</p>
            </div>
          </header>
          {a.animal && (
            <details className="ur-open">
              <summary>Ver hoja de vida y trazabilidad de {a.animal.tag}</summary>
              <UrgentRecord animal={a.animal} />
            </details>
          )}
          <button
            type="button"
            className="emg-btn"
            onClick={() =>
              void api.urgentAck(a.id).then(
                () => {
                  notify("Confirmado: quien avisó ya lo ve.", "ok");
                  reload();
                },
                () => notify("No se pudo confirmar. Revise la conexión.", "warn"),
              )
            }
          >
            <CheckCircle2 size={18} aria-hidden="true" /> Voy a atender
          </button>
        </section>
      ))}
    </div>
  );
}
