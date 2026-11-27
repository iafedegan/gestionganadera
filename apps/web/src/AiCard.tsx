import type { AiConfigDto } from "@ganaderia/contracts";
import { CheckCircle2, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { CardHead } from "./components";
import { ApiError, NetworkError, api } from "./lib/api";
import { useApp } from "./state";

const msg = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión. Esta sección necesita internet."
    : e instanceof ApiError
      ? e.message
      : "No se pudo completar. Intente de nuevo.";

/** Clave de Google Gemini para el asistente. Solo la ve y la cambia el propietario. */
export function AiCard() {
  const { orgId, role, online, notify } = useApp();
  const [cfg, setCfg] = useState<AiConfigDto | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "propietario" || !online) return;
    api.aiConfig(orgId).then(
      (c) => {
        setCfg(c);
        setModel(c.model);
      },
      (e) => setError(msg(e)),
    );
  }, [orgId, role, online]);

  if (role !== "propietario") return null;

  async function save(apiKey: string | null) {
    setBusy(true);
    setError(null);
    try {
      const c = await api.saveAiConfig({
        organizationId: orgId,
        apiKey,
        ...(model.trim() ? { model: model.trim() } : {}),
      });
      setCfg(c);
      setModel(c.model);
      setKey("");
      notify(apiKey ? "Clave guardada: el asistente ya usa Gemini." : "Clave quitada.", "ok");
    } catch (e) {
      setError(msg(e));
    }
    setBusy(false);
  }

  return (
    <article className="card ai-card">
      <CardHead
        icon={<Sparkles size={24} aria-hidden="true" />}
        title="Inteligencia artificial"
        sub="Ponga su clave de Google Gemini para activar el asistente."
      />
      {cfg?.configured ? (
        <p className="banner banner-info ai-state">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>
            Gemini activo. Clave terminada en <strong>••••{cfg.last4}</strong>.
          </span>
        </p>
      ) : (
        <p className="hint">
          {cfg?.serverAssistant
            ? "Hoy responde el asistente del servidor. Con su clave, responderá Gemini."
            : "El asistente está apagado hasta que guarde una clave."}
        </p>
      )}
      <form
        className="ai-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void save(key.trim());
        }}
      >
        <label>
          {cfg?.configured ? "Nueva clave de API" : "Clave de API de Gemini"}
          <input
            type="password"
            value={key}
            autoComplete="off"
            spellCheck={false}
            placeholder="Pegue aquí su clave"
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label>
          Modelo
          <input
            type="text"
            value={model}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        {error && (
          <p className="banner banner-warn" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={!online || busy || key.trim().length < 20}
        >
          {busy ? "Comprobando con Google…" : "Guardar clave"}
        </button>
        {cfg?.configured && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={!online || busy}
            onClick={() => void save(null)}
          >
            <Trash2 size={16} aria-hidden="true" /> Quitar la clave
          </button>
        )}
      </form>
      <a
        className="ai-link"
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noopener noreferrer"
      >
        Crear una clave en Google AI Studio <ExternalLink size={14} aria-hidden="true" />
      </a>
      <p className="hint">
        La clave se guarda cifrada en el servidor y no vuelve a mostrarse. Al usar el asistente, la
        pregunta y un resumen de los datos de su finca se envían a Google.
      </p>
    </article>
  );
}
