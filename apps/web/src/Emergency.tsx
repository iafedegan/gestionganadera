import { DATA_CONSENT_VERSION } from "@ganaderia/contracts";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { useActiveFarm, useFarms } from "./animals";
import { ApiError, NetworkError, api } from "./lib/api";
import { useApp } from "./state";

/**
 * Emergencia detectada en el chat: avisa de inmediato al Secretario Técnico de la TECNIG@N
 * de la región. Si el dueño aún no autorizó compartir la finca, se le pide con un toque.
 */

export type AlertStatus = "enviando" | "enviado" | "autorizar" | "sin_senal" | "error";
export interface EmergencyState {
  reason: string;
  question: string;
  status: AlertStatus;
  detail?: string;
}

const RESEND_AFTER = 30 * 60_000;

export function useEmergencyAlert() {
  const { orgId, notify } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [alert, setAlert] = useState<EmergencyState | null>(null);
  const farmId = active || (farms.length === 1 ? farms[0]?.id : undefined);

  const send = useCallback(
    async (reason: string, question: string) => {
      const base = { reason, question };
      const key = `gg.urgencia.${orgId}.${reason}`;
      // Varios mensajes sobre la misma urgencia no generan avisos repetidos.
      if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < RESEND_AFTER) {
        setAlert({ ...base, status: "enviado" });
        return;
      }
      setAlert({ ...base, status: "enviando" });
      try {
        await api.escalate({
          organizationId: orgId,
          ...(farmId ? { farmId } : {}),
          topic: "sanidad",
          question: `URGENTE · posible ${reason}. El productor escribió en el asistente: «${question.slice(0, 1700)}»`,
        });
        sessionStorage.setItem(key, String(Date.now()));
        setAlert({ ...base, status: "enviado" });
        notify("Aviso de emergencia enviado al técnico.", "warn");
      } catch (e) {
        if (e instanceof ApiError && e.code === "COMPARTIR_REQUERIDO")
          setAlert({ ...base, status: "autorizar" });
        else if (e instanceof NetworkError) setAlert({ ...base, status: "sin_senal" });
        else
          setAlert({
            ...base,
            status: "error",
            ...(e instanceof ApiError ? { detail: e.message } : {}),
          });
      }
    },
    [orgId, farmId, notify],
  );

  const authorize = useCallback(async () => {
    if (!alert) return;
    try {
      const cur = await api.consent();
      await api.saveConsent({
        version: DATA_CONSENT_VERSION,
        sectorAnalysis: cur.consent?.sectorAnalysis ?? false,
        shareTechnical: true,
      });
      await send(alert.reason, alert.question);
    } catch (e) {
      setAlert({
        ...alert,
        status: "error",
        ...(e instanceof ApiError ? { detail: e.message } : {}),
      });
    }
  }, [alert, send]);

  return { alert, send, authorize, clear: () => setAlert(null) };
}

export function EmergencyCard(props: {
  alert: EmergencyState;
  onAuthorize(): void;
  onRetry(): void;
}) {
  const { status, reason, detail } = props.alert;
  return (
    <section className="emg" role="alert">
      <header>
        <AlertTriangle size={24} aria-hidden="true" />
        <div>
          <strong>Posible emergencia: {reason}</strong>
          <p>Llame ya a su veterinario. No espere la respuesta ni medique al animal.</p>
        </div>
      </header>
      {status === "enviando" && <p className="emg-state">Avisando al técnico…</p>}
      {status === "enviado" && (
        <p className="emg-state ok">
          <CheckCircle2 size={18} aria-hidden="true" /> Aviso enviado al Secretario Técnico de su
          región. Vea la respuesta en Asistencia técnica.
        </p>
      )}
      {status === "autorizar" && (
        <>
          <p className="emg-state">
            Para avisarle al técnico debe autorizar que vea los datos de su finca.
          </p>
          <button type="button" className="emg-btn" onClick={props.onAuthorize}>
            <Send size={18} aria-hidden="true" /> Autorizar compartir mi finca y avisar
          </button>
        </>
      )}
      {(status === "sin_senal" || status === "error") && (
        <>
          <p className="emg-state">
            El aviso NO se envió.{" "}
            {status === "sin_senal" ? "No hay señal." : (detail ?? "Hubo un error.")}
          </p>
          <button type="button" className="emg-btn" onClick={props.onRetry}>
            <Send size={18} aria-hidden="true" /> Intentar de nuevo
          </button>
        </>
      )}
    </section>
  );
}
