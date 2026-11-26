import {
  DATA_CONSENT_VERSION,
  DATA_POLICY_URLS,
  type DataConsentState,
  type DataRequestDto,
  type DataRequestKind,
} from "@ganaderia/contracts";
import { Download, ExternalLink, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CardHead } from "./components";
import { fecha } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { useApp } from "./state";

/*
 * Protocolo de datos del productor (Plan CTeI 2026–2030, §6.2.6): consentimiento informado antes de
 * registrar, acceso permanente a los datos propios y solicitudes de rectificación o supresión.
 */

const cacheKey = (userId: string) => `gg.consent.${userId}`;
function readCache(userId: string | undefined): DataConsentState | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as DataConsentState) : null;
  } catch {
    return null;
  }
}
function writeCache(userId: string, s: DataConsentState) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(s));
  } catch {
    /* sin almacenamiento: se vuelve a consultar al servidor */
  }
}

const msg = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión. Inténtelo cuando tenga señal."
    : e instanceof ApiError
      ? e.message
      : "No se pudo completar. Intente de nuevo.";

const OPTIONS = {
  sectorAnalysis:
    "Usar los datos de mi finca de forma agregada y anónima, nunca con mi nombre, para estudios del sector ganadero.",
  shareTechnical:
    "Compartir el expediente de mi finca con el Secretario Técnico del TECNIG@N de mi región para recibir acompañamiento técnico.",
} as const;

function PolicyLinks() {
  return (
    <p className="hint policy-hint">
      Ley 1581 de 2012. Consulte la{" "}
      <a href={DATA_POLICY_URLS.fedegan} target="_blank" rel="noopener noreferrer">
        política de datos de FEDEGÁN <ExternalLink size={12} aria-hidden="true" />
      </a>{" "}
      y la{" "}
      <a href={DATA_POLICY_URLS.fng} target="_blank" rel="noopener noreferrer">
        del Fondo Nacional del Ganado <ExternalLink size={12} aria-hidden="true" />
      </a>
      .
    </p>
  );
}

/**
 * Pide la autorización la primera vez (o si cambió el texto) antes de seguir usando la app.
 * Sin conexión y sin respuesta guardada no bloquea: se pide apenas haya señal.
 */
export function ConsentGate() {
  const { session, online } = useApp();
  const userId = session?.userId;
  const [state, setState] = useState<DataConsentState | null>(() => readCache(userId));

  useEffect(() => {
    setState(readCache(userId));
    if (!userId || !online) return;
    api.consent().then(
      (s) => {
        setState(s);
        writeCache(userId, s);
      },
      () => undefined,
    );
  }, [userId, online]);

  if (!userId || !state?.required) return null;
  return (
    <ConsentDialog
      onSaved={(s) => {
        setState(s);
        writeCache(userId, s);
      }}
    />
  );
}

/** Las autorizaciones sobre la finca solo las decide quien la administra. */
const ownsData = (role: string | null) => role === "propietario" || role === "admin_entidad";

function ConsentDialog({ onSaved }: { onSaved(s: DataConsentState): void }) {
  const { logout, role } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [sectorAnalysis, setSector] = useState(false);
  const [shareTechnical, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api.saveConsent({ version: DATA_CONSENT_VERSION, sectorAnalysis, shareTechnical }),
      );
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form consent-dialog"
      aria-labelledby="consent-t"
      // Escape no lo cierra: hay que aceptar o salir.
      onCancel={(e) => e.preventDefault()}
    >
      <header className="dialog-head">
        <ShieldCheck size={22} aria-hidden="true" />
        <h2 id="consent-t">Sus datos, sus reglas</h2>
      </header>
      <div className="dialog-body">
        <p className="eco-text">
          Antes de seguir, lea cómo se cuida la información de su finca. Es corto.
        </p>
        <dl className="consent-list">
          <div>
            <dt>Qué se guarda</dt>
            <dd>
              Sus datos de contacto y los de su finca: ubicación y lindero, animales, partos,
              ordeños, pesajes, sanidad, insumos y lo que usted registre.
            </dd>
          </div>
          <div>
            <dt>Para qué</dt>
            <dd>
              Para prestarle el servicio: sus registros, alertas, indicadores, el expediente de su
              finca y la asistencia técnica que usted pida.
            </dd>
          </div>
          <div>
            <dt>Quién lo ve</dt>
            <dd>
              Dentro de la app, usted y las personas que usted invite a su ganadería. Nadie más,
              salvo que usted lo autorice abajo.
            </dd>
          </div>
          <div>
            <dt>Sus derechos</dt>
            <dd>
              Ver y descargar sus datos cuando quiera, pedir que se corrijan o se borren y cambiar
              estas autorizaciones en Configuración → Mis datos.
            </dd>
          </div>
        </dl>

        {ownsData(role) && (
          <fieldset className="consent-opts">
            <legend>Opcional: marque solo si está de acuerdo</legend>
            <label className="chk-row">
              <input
                type="checkbox"
                checked={sectorAnalysis}
                onChange={(e) => setSector(e.target.checked)}
              />
              <span>{OPTIONS.sectorAnalysis}</span>
            </label>
            <label className="chk-row">
              <input
                type="checkbox"
                checked={shareTechnical}
                onChange={(e) => setShare(e.target.checked)}
              />
              <span>{OPTIONS.shareTechnical}</span>
            </label>
          </fieldset>
        )}

        <PolicyLinks />
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
        <div className="aula-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void accept()}
          >
            {busy ? "Guardando…" : "Acepto y continúo"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            No acepto, salir
          </button>
        </div>
      </div>
    </dialog>
  );
}

const KIND_LABEL: Record<DataRequestKind, string> = {
  rectificacion: "Corregir un dato",
  supresion: "Borrar mis datos",
  consulta: "Pregunta sobre mis datos",
};
const STATUS_LABEL: Record<DataRequestDto["status"], string> = {
  recibida: "Recibida",
  en_tramite: "En trámite",
  resuelta: "Resuelta",
};

/** Configuración → Mis datos: autorizaciones, copia de los datos y solicitudes. */
export function MisDatosCard() {
  const { session, online, notify, role } = useApp();
  const userId = session?.userId;
  const [state, setState] = useState<DataConsentState | null>(() => readCache(userId));
  const [requests, setRequests] = useState<DataRequestDto[] | null>(null);
  const [busy, setBusy] = useState<"guardar" | "descargar" | "enviar" | null>(null);
  const [kind, setKind] = useState<DataRequestKind>("rectificacion");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId || !online) return;
    api.consent().then(
      (s) => {
        setState(s);
        writeCache(userId, s);
      },
      () => undefined,
    );
    api.dataRequests().then(
      (r) => setRequests(r.items),
      () => undefined,
    );
  }, [userId, online]);
  useEffect(() => load(), [load]);

  async function toggle(key: "sectorAnalysis" | "shareTechnical", value: boolean) {
    if (!state?.consent || !userId) return;
    setBusy("guardar");
    try {
      const next = await api.saveConsent({
        version: DATA_CONSENT_VERSION,
        sectorAnalysis: key === "sectorAnalysis" ? value : state.consent.sectorAnalysis,
        shareTechnical: key === "shareTechnical" ? value : state.consent.shareTechnical,
      });
      setState(next);
      writeCache(userId, next);
      notify("Autorización actualizada.", "ok");
    } catch (e) {
      notify(msg(e), "warn");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("descargar");
    try {
      await api.downloadMyData();
    } catch (e) {
      notify(msg(e), "warn");
    } finally {
      setBusy(null);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy("enviar");
    setError(null);
    try {
      const r = await api.addDataRequest({ kind, message: text.trim() });
      setRequests((prev) => [r, ...(prev ?? [])]);
      setText("");
      notify("Solicitud recibida. Queda registrada con su fecha.", "ok");
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(null);
    }
  }

  const c = state?.consent;
  return (
    <article className="card mis-datos">
      <CardHead
        icon={<ShieldCheck size={24} aria-hidden="true" />}
        title="Mis datos"
        sub="Usted decide quién ve la información de su finca."
      />
      {!online && <p className="hint">Necesita conexión para ver o cambiar sus autorizaciones.</p>}
      {c && ownsData(role) && (
        <>
          <p className="hint">
            Autorizó el tratamiento de sus datos el {fecha(c.acceptedAt.slice(0, 10))} (texto{" "}
            {c.version}).
          </p>
          <label className="chk-row">
            <input
              type="checkbox"
              checked={c.sectorAnalysis}
              disabled={!online || busy !== null}
              onChange={(e) => void toggle("sectorAnalysis", e.target.checked)}
            />
            <span>{OPTIONS.sectorAnalysis}</span>
          </label>
          <label className="chk-row">
            <input
              type="checkbox"
              checked={c.shareTechnical}
              disabled={!online || busy !== null}
              onChange={(e) => void toggle("shareTechnical", e.target.checked)}
            />
            <span>{OPTIONS.shareTechnical}</span>
          </label>
        </>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        disabled={!online || busy !== null}
        onClick={() => void download()}
      >
        <Download size={18} aria-hidden="true" />
        {busy === "descargar" ? "Preparando…" : "Descargar una copia de mis datos"}
      </button>

      <form className="datos-form" onSubmit={send}>
        <h3 className="eco-sub">Pedir una corrección o que se borren</h3>
        <label>
          Qué necesita
          <select value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind)}>
            {(Object.keys(KIND_LABEL) as DataRequestKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cuéntenos
          <textarea
            rows={3}
            maxLength={2000}
            value={text}
            placeholder="Ej.: el área de mi finca es 40 hectáreas, no 4."
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!online || busy !== null || text.trim().length < 10}
        >
          {busy === "enviar" ? "Enviando…" : "Enviar solicitud"}
        </button>
      </form>

      {requests && requests.length > 0 && (
        <ul className="datos-reqs">
          {requests.map((r) => (
            <li key={r.id}>
              <span>
                {KIND_LABEL[r.kind]} · {fecha(r.createdAt.slice(0, 10))}
              </span>
              <small>{STATUS_LABEL[r.status]}</small>
            </li>
          ))}
        </ul>
      )}
      <PolicyLinks />
    </article>
  );
}
