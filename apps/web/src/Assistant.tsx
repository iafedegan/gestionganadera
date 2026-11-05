import type { AssistantRequest } from "@ganaderia/contracts";
import { ArrowUp, Sparkles, Stethoscope, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useFarms } from "./animals";
import { ApiError, NetworkError, api } from "./lib/api";
import { getSoil, getWeather, texture, thi } from "./lib/farmIntel";
import { useApp } from "./state";

/**
 * Asistente de la finca: el ganadero pregunta en sus palabras y la IA responde con los datos
 * reales del hato, el clima y el suelo. Orienta y anticipa; no reemplaza al veterinario.
 */

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "¿Qué debo revisar hoy en la finca?",
  "¿Qué vacas debo palpar o diagnosticar?",
  "¿Cómo afecta el calor de esta semana a mi ganado?",
  "¿Qué partos vienen en los próximos dos meses?",
  "¿Qué animales están en retiro de leche o carne?",
  "Con mi tipo de suelo, ¿qué debo tener en cuenta en los potreros?",
];

const histKey = (org: string) => `gg.asis.${org}`;
function loadHistory(org: string): Turn[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(histKey(org)) ?? "[]") as Turn[];
    return Array.isArray(v) ? v.slice(-20) : [];
  } catch {
    return [];
  }
}
function saveHistory(org: string, turns: Turn[]) {
  try {
    sessionStorage.setItem(histKey(org), JSON.stringify(turns.slice(-20)));
  } catch {
    /* sin almacenamiento: la conversación vive solo en pantalla */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Clima y suelo ya consultados por «Su finca hoy» (en caché), resumidos para el asistente. */
async function farmSignals(
  lat: number | null,
  lon: number | null,
): Promise<Pick<AssistantRequest, "weather" | "soil">> {
  if (lat === null || lon === null) return {};
  const [w, s] = await Promise.all([getWeather(lat, lon), getSoil(lat, lon)]);
  const out: Pick<AssistantRequest, "weather" | "soil"> = {};
  if (w?.days.length) {
    const tempC = w.current?.temp ?? w.days[0]?.tMax ?? 0;
    const rh = w.current?.rh ?? w.days[0]?.rhMean ?? 70;
    out.weather = {
      tempC: r1(clamp(tempC, -30, 60)),
      maxC: r1(clamp(Math.max(...w.days.map((d) => d.tMax)), -30, 60)),
      thi: Math.round(clamp(thi(tempC, rh), 0, 130)),
      heatDays: clamp(w.days.filter((d) => d.thi >= 79).length, 0, 16),
      rain7d: Math.round(
        clamp(
          w.days.reduce((t, d) => t + d.rain, 0),
          0,
          3000,
        ),
      ),
    };
  }
  const top = s?.layers[0];
  if (top && top.clay != null && top.sand != null && top.silt != null) {
    out.soil = {
      texture: texture(top.clay, top.sand, top.silt).slice(0, 40),
      ph: top.ph != null ? r1(clamp(top.ph, 0, 14)) : null,
      socGkg: top.soc != null ? r1(clamp(top.soc, 0, 1000)) : null,
    };
  }
  return out;
}

/** Negritas y listas simples; todo como texto, sin HTML del modelo. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos fijos de una línea
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) {
      blocks.push(
        <ul key={`l${blocks.length}`}>
          {items.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista estática de la respuesta
            <li key={i}>{inline(t)}</li>
          ))}
        </ul>,
      );
      items = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      items.push(m[1] ?? "");
      continue;
    }
    flush();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      h ? (
        <p key={`p${blocks.length}`} className="asis-h">
          {inline(h[1] ?? "")}
        </p>
      ) : (
        <p key={`p${blocks.length}`}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <>{blocks}</>;
}

/** Tarjeta de Inicio: una puerta de entrada con preguntas listas para tocar. */
export function AssistantCard() {
  const [open, setOpen] = useState<string | null | false>(false);
  return (
    <article className="card asis-card">
      <div className="asis-card-head">
        <span className="asis-badge" aria-hidden="true">
          <Sparkles size={22} />
        </span>
        <div>
          <h2>Pregúntele a su finca</h2>
          <p>
            Responde con los datos de su hato, el clima y el suelo. Orienta; no reemplaza al
            veterinario.
          </p>
        </div>
      </div>
      <div className="asis-chips">
        {SUGGESTIONS.slice(0, 3).map((s) => (
          <button key={s} type="button" className="asis-chip" onClick={() => setOpen(s)}>
            {s}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary asis-open" onClick={() => setOpen(null)}>
        <Sparkles size={18} aria-hidden="true" /> Hacer una pregunta
      </button>
      {open !== false && <AssistantDialog initial={open} onClose={() => setOpen(false)} />}
    </article>
  );
}

export function AssistantDialog(props: { initial: string | null; onClose(): void }) {
  const { orgId, online } = useApp();
  const farms = useFarms();
  const farm = farms.find((f) => f.latitude != null && f.longitude != null) ?? farms[0];
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [turns, setTurns] = useState<Turn[]>(() => loadHistory(orgId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    ref.current?.showModal();
    api
      .assistantStatus()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(null));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: desplazar al final con cada mensaje
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    setError(null);
    const history = turns.slice(-10);
    const next = [...turns, { role: "user" as const, text: q }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const signals = await farmSignals(farm?.latitude ?? null, farm?.longitude ?? null);
      const r = await api.ask({ organizationId: orgId, question: q, history, ...signals });
      const done = [...next, { role: "assistant" as const, text: r.answer }];
      setTurns(done);
      saveHistory(orgId, done);
      setRemaining(r.remaining);
    } catch (e) {
      // La pregunta vuelve a la caja para reintentar sin escribirla de nuevo.
      setTurns(turns);
      setDraft(q);
      if (e instanceof ApiError) {
        if (e.code === "ASISTENTE_NO_CONFIGURADO") setEnabled(false);
        setError(e.message);
      } else if (e instanceof NetworkError) {
        setError("Sin conexión. El asistente necesita internet; sus datos siguen guardados.");
      } else setError("No se pudo obtener la respuesta. Intente de nuevo.");
    }
    setBusy(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: la sugerencia tocada se envía una sola vez
  useEffect(() => {
    if (props.initial && !sentInitial.current && enabled !== false && online) {
      sentInitial.current = true;
      void send(props.initial);
    }
  }, [enabled, online]);

  const clear = () => {
    setTurns([]);
    saveHistory(orgId, []);
    setError(null);
  };

  const off = enabled === false;
  const canSend = online && !off && !busy && draft.trim().length >= 2;

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form asis-dialog"
      onClose={props.onClose}
      aria-labelledby="asis-title"
    >
      <div className="asis">
        <header className="dialog-head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => ref.current?.close()}
          >
            <X size={20} />
          </button>
          <h2 id="asis-title">Asistente de la finca</h2>
          {turns.length > 0 && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Borrar conversación"
              onClick={clear}
            >
              <Trash2 size={18} />
            </button>
          )}
        </header>

        <div className="asis-list" ref={listRef} aria-live="polite">
          <p className="asis-note">
            <Stethoscope size={16} aria-hidden="true" /> Orienta con los datos de su finca. Para
            diagnósticos, medicamentos y urgencias, llame a su veterinario.
          </p>

          {turns.length === 0 && !busy && (
            <div className="asis-empty">
              <span className="asis-badge big" aria-hidden="true">
                <Sparkles size={28} />
              </span>
              <p>
                {farm
                  ? `Pregunte lo que quiera sobre ${farm.name}.`
                  : "Pregunte lo que quiera sobre su finca."}
              </p>
              <div className="asis-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="asis-chip"
                    disabled={!online || off}
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: la conversación solo crece al final
            <div key={i} className={t.role === "user" ? "asis-msg me" : "asis-msg ai"}>
              {t.role === "user" ? <p>{t.text}</p> : <Rich text={t.text} />}
            </div>
          ))}

          {busy && (
            <output className="asis-msg ai asis-typing">
              <span />
              <span />
              <span />
              <small>Revisando su hato y el clima…</small>
            </output>
          )}

          {off && (
            <p className="banner banner-info">
              El asistente todavía no está activado. El administrador del sistema debe configurar la
              clave de la IA en el servidor.
            </p>
          )}
          {!online && !off && (
            <p className="banner banner-warn">Sin señal: el asistente necesita internet.</p>
          )}
          {error && !off && (
            <p className="banner banner-warn" role="alert">
              {error}
            </p>
          )}
        </div>

        <form
          className="asis-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={1500}
            placeholder={off ? "Asistente no disponible" : "Escriba su pregunta…"}
            aria-label="Su pregunta"
            disabled={off}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" className="asis-send" aria-label="Enviar" disabled={!canSend}>
            <ArrowUp size={22} />
          </button>
        </form>
        {remaining !== null && remaining <= 10 && (
          <p className="asis-quota">Quedan {remaining} preguntas hoy para su ganadería.</p>
        )}
      </div>
    </dialog>
  );
}
