import { Mic, MicOff, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { todayLocal } from "./labels";
import {
  type VoiceField,
  detectCommand,
  detectConfirmation,
  detectCorrection,
  interpretAnswer,
  questionFor,
  speakableLabel,
  speakableValue,
} from "./lib/voice";

/**
 * Llena un formulario conversando: pregunta cada dato en voz alta, escucha la respuesta y la deja
 * en su casilla. Las casillas siguen editables: lo que se corrija a mano se conserva.
 */

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const getRecognition = (): RecognitionCtor | null => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSupported = () => typeof window !== "undefined" && getRecognition() !== null;

type Heard = { alts: string[] } | { error: string };
const MAX_MISSES = 3;
const LISTEN_MS = 12_000;

type Status = "idle" | "speaking" | "listening" | "paused";

export function VoiceAssistant(props: {
  fields: VoiceField[];
  values: Record<string, string>;
  onChange(name: string, value: string): void;
  onActive?(name: string | null): void;
  /** Pregunta final y acción al confirmar. */
  confirmText?: string;
  onConfirm(): void;
  autoStart?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [prompt, setPrompt] = useState("");
  const [heard, setHeard] = useState("");
  const latest = useRef(props);
  latest.current = props;
  // Cada sesión tiene un número: si cambia, la conversación anterior deja de actuar.
  const session = useRef(0);
  const recognizer = useRef<Recognition | null>(null);
  const resumeAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  /** Marca el campo que se está preguntando y lo deja a la vista. */
  function markField(name: string) {
    latest.current.onActive?.(name);
    setTimeout(() => {
      root.current
        ?.closest("dialog")
        ?.querySelector(".voice-field")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  function stopAudio() {
    recognizer.current?.abort();
    recognizer.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function speak(text: string): Promise<void> {
    setPrompt(text);
    setStatus("speaking");
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-CO";
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
      if (voice) u.voice = voice;
      // Algunos navegadores nunca avisan el final: se sigue tras el tiempo estimado.
      const guard = setTimeout(resolve, 2500 + text.length * 110);
      const done = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }

  function listen(): Promise<Heard> {
    const Ctor = getRecognition();
    if (!Ctor) return Promise.resolve({ error: "not-supported" });
    setStatus("listening");
    return new Promise((resolve) => {
      const r = new Ctor();
      recognizer.current = r;
      r.lang = "es-CO";
      r.continuous = false;
      r.interimResults = false;
      r.maxAlternatives = 3;
      let settled = false;
      const finish = (v: Heard) => {
        if (settled) return;
        settled = true;
        clearTimeout(limit);
        resolve(v);
      };
      const limit = setTimeout(() => {
        r.abort();
        finish({ error: "no-speech" });
      }, LISTEN_MS);
      r.onresult = (e) => {
        const best = e.results[0];
        const alts: string[] = [];
        if (best) {
          for (let i = 0; i < best.length; i++) {
            const t = best[i]?.transcript;
            if (t) alts.push(t);
          }
        }
        finish({ alts });
      };
      r.onerror = (e) => finish({ error: e.error });
      r.onend = () => finish({ error: "no-speech" });
      try {
        r.start();
      } catch {
        finish({ error: "audio-capture" });
      }
    });
  }

  /** Motivo por el que no se puede seguir por voz; null si basta con volver a preguntar. */
  function fatal(error: string): string | null {
    if (error === "not-allowed" || error === "service-not-allowed")
      return "El micrófono está bloqueado. Permítalo en el navegador o escriba los datos.";
    if (error === "network")
      return "El reconocimiento de voz necesita internet. Sin señal, escriba los datos.";
    if (error === "audio-capture" || error === "not-supported")
      return "No se pudo usar el micrófono. Escriba los datos.";
    return null;
  }

  async function pause(id: number, message: string, at: number) {
    resumeAt.current = at;
    latest.current.onActive?.(null);
    if (session.current !== id) return;
    await speak(message);
    if (session.current === id) setStatus("paused");
  }

  async function confirmStep(id: number): Promise<void> {
    // Da tiempo a que el formulario aplique la última respuesta antes de leerla.
    await new Promise((r) => setTimeout(r, 0));
    const { fields, values, confirmText } = latest.current;
    latest.current.onActive?.(null);
    const summary = fields
      .filter((f) => values[f.name])
      .map((f) => `${speakableLabel(f.label)}: ${speakableValue(f, values[f.name] ?? "")}`)
      .join(". ");
    let misses = 0;
    let say = `${summary}. ${confirmText ?? "¿Guardo?"}`;
    while (session.current === id) {
      await speak(say);
      if (session.current !== id) return;
      const res = await listen();
      if (session.current !== id) return;
      if ("error" in res) {
        const stop = fatal(res.error);
        if (stop) return pause(id, stop, latest.current.fields.length);
        misses++;
      } else {
        setHeard(res.alts[0] ?? "");
        const fix = res.alts.map((a) => detectCorrection(a, latest.current.fields)).find(Boolean);
        if (fix) {
          const at = latest.current.fields.findIndex((f) => f.name === fix.name);
          return walk(id, at, true);
        }
        const answer = res.alts.map(detectConfirmation).find(Boolean);
        if (answer === "si") {
          stopAudio();
          setStatus("idle");
          latest.current.onConfirm();
          return;
        }
        if (answer === "no" || res.alts.some((a) => detectCommand(a) === "detener")) {
          return pause(
            id,
            "Listo. Corrija lo que necesite y guarde con el botón.",
            latest.current.fields.length,
          );
        }
        misses++;
      }
      if (misses >= MAX_MISSES) {
        return pause(
          id,
          "No le entendí. Revise y guarde con el botón.",
          latest.current.fields.length,
        );
      }
      say = "Diga sí para guardar, no para revisar, o corregir y el nombre del dato.";
    }
  }

  /** Recorre los campos desde `start`. Con `single` solo corrige uno y vuelve a la confirmación. */
  async function walk(id: number, start: number, single = false): Promise<void> {
    let i = start;
    let misses = 0;
    let prefix = "";
    while (session.current === id) {
      const fields = latest.current.fields;
      const field = fields[i];
      if (!field) return confirmStep(id);
      markField(field.name);
      await speak(`${prefix}${questionFor(field)}`);
      if (session.current !== id) return;
      const res = await listen();
      if (session.current !== id) return;

      if ("error" in res) {
        const stop = fatal(res.error);
        if (stop) return pause(id, stop, i);
        misses++;
      } else {
        const first = res.alts[0] ?? "";
        setHeard(first);
        const command = detectCommand(first);
        if (command === "detener") return pause(id, "Detenido. Puede seguir escribiendo.", i);
        if (command === "repetir") {
          prefix = "";
          continue;
        }
        if (command === "atras") {
          i = Math.max(0, i - 1);
          misses = 0;
          prefix = "";
          continue;
        }
        if (command === "saltar") {
          if (field.required === false || latest.current.values[field.name]) {
            if (field.required === false) latest.current.onChange(field.name, "");
            if (single) return confirmStep(id);
            i++;
            misses = 0;
            prefix = "";
            continue;
          }
          prefix = "Este dato es obligatorio. ";
          continue;
        }
        const today = todayLocal();
        const value = res.alts
          .map((a) => interpretAnswer(field, a, today))
          .find((v): v is string => v !== null);
        if (value !== undefined) {
          latest.current.onChange(field.name, value);
          if (single) return confirmStep(id);
          i++;
          misses = 0;
          prefix = `${speakableValue(field, value)}. `;
          // Da tiempo a que el formulario muestre el valor y actualice sus opciones.
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }
        misses++;
      }
      if (misses >= MAX_MISSES) {
        return pause(id, "No le entendí. Escríbalo y toque seguir por voz.", i);
      }
      prefix = "No le entendí. ";
    }
  }

  function start(at: number) {
    stopAudio();
    const id = ++session.current;
    setHeard("");
    void walk(id, at);
  }

  function stop() {
    session.current++;
    stopAudio();
    latest.current.onActive?.(null);
    setStatus("paused");
    setPrompt("Detenido. Puede seguir escribiendo.");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: arranca una sola vez y se limpia al cerrar
  useEffect(() => {
    if (props.autoStart && voiceSupported()) start(0);
    return () => {
      session.current++;
      stopAudio();
    };
  }, []);

  if (!voiceSupported()) {
    return (
      <p className="voice-bar voice-off">
        <MicOff size={18} aria-hidden="true" />
        <span>Este navegador no reconoce voz. Use Chrome, o escriba los datos.</span>
      </p>
    );
  }

  const active = status === "speaking" || status === "listening";
  return (
    <div ref={root} className={active ? "voice-bar voice-on" : "voice-bar"}>
      {active ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>
          <Square size={16} aria-hidden="true" /> Detener
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => start(status === "paused" ? resumeAt.current : 0)}
        >
          <Mic size={16} aria-hidden="true" />
          {status === "paused" ? "Seguir por voz" : "Llenar por voz"}
        </button>
      )}
      <div className="voice-text" aria-live="polite">
        {status === "idle" && !prompt && (
          <small>Le pregunto cada dato y usted responde. Siempre puede corregir a mano.</small>
        )}
        {prompt && <strong>{prompt}</strong>}
        {status === "listening" && <small className="voice-listening">Escuchando…</small>}
        {heard && status !== "listening" && <small>Escuché: «{heard}»</small>}
      </div>
    </div>
  );
}
