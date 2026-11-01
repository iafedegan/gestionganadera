import { Mic, MicOff, Square, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { todayLocal } from "./labels";
import {
  type VoiceField,
  detectCommand,
  detectConfirmation,
  detectCorrection,
  endsWithSave,
  extractAnswers,
  interpretAnswer,
  needsAnswer,
  questionFor,
  sanityDoubt,
  speakableValue,
} from "./lib/voice";
import { isIOS } from "./native";

/**
 * Llena un formulario conversando. Se puede decir todo en una frase («vaca cero uno, en la tarde,
 * dieciocho litros»): la app llena lo que entienda y solo pregunta lo que falte. Las casillas
 * siguen editables y lo que se corrija a mano se conserva.
 */

interface RecognitionAlternative {
  transcript: string;
}
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean };
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start(): void;
  abort(): void;
  stop(): void;
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
/** Cuánto se espera a que empiece a hablar antes de volver a preguntar. */
const WAIT_FOR_SPEECH_MS = 10_000;
/** Silencio tras palabras aún sin confirmar para dar la frase por terminada. */
const END_OF_PHRASE_MS = 1_100;
const SILENT_KEY = "gg.voz.silencio";

type Status = "idle" | "speaking" | "listening" | "paused";

const readSilent = () => {
  try {
    return localStorage.getItem(SILENT_KEY) === "1";
  } catch {
    return false;
  }
};

export function VoiceAssistant(props: {
  fields: VoiceField[];
  values: Record<string, string>;
  /** Puede devolver otros campos que el valor deja resueltos (categoría «vaca» → sexo). */
  onChange(name: string, value: string): string[] | undefined;
  onActive?(name: string | null): void;
  confirmText?: string;
  /** Revisión con los datos de la finca: lo que no cuadre se avisa antes de guardar. */
  review?(values: Record<string, string>): string | null;
  onConfirm(): void;
  autoStart?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const doubted = useRef(new Set<string>());
  const [prompt, setPrompt] = useState("");
  const [heard, setHeard] = useState("");
  const [live, setLive] = useState("");
  const [hearing, setHearing] = useState(false);
  const listenTries = useRef(0);
  const [silent, setSilent] = useState(readSilent);
  const silentRef = useRef(silent);
  const latest = useRef(props);
  latest.current = props;
  // Cada sesión tiene un número: si cambia, la conversación anterior deja de actuar.
  const session = useRef(0);
  const recognizer = useRef<Recognition | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Lo dicho, o cambiado a mano frente a como estaba, ya no se vuelve a preguntar.
  const answered = useRef(new Set<string>());
  const started = useRef<Record<string, string>>({});
  const lang = useRef("es-CO");

  const tick = () => new Promise((r) => setTimeout(r, 0));

  function markField(name: string | null) {
    latest.current.onActive?.(name);
    if (!name) return;
    setTimeout(() => {
      root.current
        ?.closest("dialog")
        ?.querySelector(".voice-field")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  /*
   * iPhone: el micrófono solo enciende de forma fiable al tocar un botón, y hablar en voz alta
   * interrumpe la escucha. Por eso se abre una sola vez, queda abierto toda la conversación y
   * las preguntas van solo en pantalla. Cada frase se separa por la pausa al hablar.
   */
  const ios = useRef<{
    on: boolean;
    used: number;
    waiter: ((h: Heard) => void) | null;
    queued: Heard | null;
    timer?: ReturnType<typeof setTimeout>;
  }>({ on: false, used: 0, waiter: null, queued: null });

  function iosDeliver(h: Heard) {
    const st = ios.current;
    if (st.waiter) {
      const w = st.waiter;
      st.waiter = null;
      w(h);
    } else st.queued = h;
  }

  function iosOpen() {
    const Ctor = getRecognition();
    const st = ios.current;
    if (!Ctor || recognizer.current) return;
    st.on = true;
    st.used = 0;
    const r = new Ctor();
    recognizer.current = r;
    r.lang = lang.current;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      // iOS puede repetir todo lo dicho en cada aviso: se toma solo lo nuevo.
      let full = "";
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        full += `${res?.[0]?.transcript ?? ""} `;
        if (i === e.results.length - 1 && !res?.isFinal) final = false;
      }
      const fresh = full.slice(st.used).trim();
      if (!fresh) return;
      setLive(fresh);
      clearTimeout(st.timer);
      st.timer = setTimeout(
        () => {
          st.used = full.length;
          setLive("");
          iosDeliver({ alts: [fresh] });
        },
        final ? 150 : END_OF_PHRASE_MS,
      );
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      iosDeliver({ error: e.error });
    };
    r.onend = () => {
      recognizer.current = null;
      if (!st.on) return;
      setTimeout(() => {
        if (st.on && !recognizer.current) iosOpen();
      }, 200);
    };
    try {
      r.start();
    } catch {
      recognizer.current = null;
      iosDeliver({ error: "audio-capture" });
    }
  }

  function iosListen(): Promise<Heard> {
    const st = ios.current;
    setStatus("listening");
    if (!recognizer.current) iosOpen();
    if (st.queued) {
      const q = st.queued;
      st.queued = null;
      return Promise.resolve(q);
    }
    return new Promise((resolve) => {
      const limit = setTimeout(() => {
        st.waiter = null;
        resolve({ error: "no-speech" });
      }, 20_000);
      st.waiter = (h) => {
        clearTimeout(limit);
        resolve(h);
      };
    });
  }

  function stopAudio() {
    ios.current.on = false;
    ios.current.waiter = null;
    ios.current.queued = null;
    clearTimeout(ios.current.timer);
    recognizer.current?.abort();
    recognizer.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function saveNow() {
    stopAudio();
    setStatus("idle");
    markField(null);
    setPrompt("");
    latest.current.onConfirm();
  }

  /** Resumen para confirmar; antes avisa si algún valor no parece normal, una sola vez por valor. */
  function confirmation(): string {
    const { fields, values, confirmText } = latest.current;
    let doubt = "";
    const reviewed = latest.current.review?.(values);
    if (reviewed && !doubted.current.has(reviewed)) {
      doubted.current.add(reviewed);
      doubt = `${reviewed} `;
    }
    for (const f of doubt ? [] : fields) {
      const value = values[f.name];
      const issue = sanityDoubt(f, value);
      if (issue && !doubted.current.has(`${f.name}:${value}`)) {
        doubted.current.add(`${f.name}:${value}`);
        doubt = `${issue} `;
        break;
      }
    }
    const summary = fields
      .filter((f) => values[f.name] && values[f.name] !== "0" && f.type !== "date")
      .map((f) => speakableValue(f, values[f.name] ?? ""))
      .join(", ");
    return `${doubt}${summary}. ${confirmText ?? "¿Guardo?"}`;
  }

  function speak(text: string): Promise<void> {
    setPrompt(text);
    if (isIOS() || silentRef.current || !("speechSynthesis" in window)) return Promise.resolve();
    setStatus("speaking");
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-CO";
      u.rate = 1.15;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
      if (voice) u.voice = voice;
      // Algunos navegadores nunca avisan el final: se sigue tras el tiempo estimado.
      const guard = setTimeout(resolve, 1500 + text.length * 90);
      const done = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }

  /**
   * Escucha una frase. Muestra las palabras mientras llegan, se reinicia sola si el navegador
   * corta por silencio y no termina hasta que la persona deja de hablar.
   */
  function listen(id: number): Promise<Heard> {
    const Ctor = getRecognition();
    if (!Ctor) return Promise.resolve({ error: "not-supported" });
    if (isIOS()) return iosListen();
    setStatus("listening");
    setLive("");
    listenTries.current++;
    const deadline = Date.now() + WAIT_FOR_SPEECH_MS;
    return new Promise((resolve) => {
      let settled = false;
      let endTimer: ReturnType<typeof setTimeout> | undefined;
      let finals: string[][] = [];
      let interim = "";
      // Algunos navegadores encienden el micrófono y nunca avisan nada: no se espera para siempre.
      const watchdog = setTimeout(() => finish({ error: "no-speech" }), WAIT_FOR_SPEECH_MS);
      const finish = (v: Heard) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        setHearing(false);
        clearTimeout(endTimer);
        setLive("");
        const r = recognizer.current;
        recognizer.current = null;
        if (r) {
          r.onresult = null;
          r.onerror = null;
          r.onend = null;
          r.abort();
        }
        resolve(v);
      };
      // Une lo ya confirmado y deja las alternativas de la última parte.
      const phrase = (): string[] => {
        const head = finals.slice(0, -1).map((a) => a[0] ?? "");
        const last = finals[finals.length - 1] ?? [];
        const tail = interim ? [interim] : last.length ? last : [""];
        const prefix = (interim ? finals.map((a) => a[0] ?? "") : head).join(" ");
        return tail.map((t) => `${prefix} ${t}`.trim());
      };
      const begin = () => {
        if (settled || session.current !== id) return;
        const r = new Ctor();
        recognizer.current = r;
        r.lang = lang.current;
        // Sin modo continuo: en Android duplica las frases. Se reinicia al terminar cada tramo.
        // En iPhone, cada segundo intento usa el modo continuo por si el otro no entrega texto.
        r.continuous =
          /iPhone|iPad|iPod/.test(navigator.userAgent) && listenTries.current % 2 === 1;
        r.onaudiostart = () => setHearing(true);
        r.onspeechstart = () => setHearing(true);
        r.interimResults = true;
        r.maxAlternatives = 5;
        r.onresult = (e) => {
          clearTimeout(watchdog);
          interim = "";
          const pending: string[] = [];
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (!res) continue;
            if (res.isFinal) {
              const alts: string[] = [];
              for (let k = 0; k < res.length; k++) {
                const t = res[k]?.transcript?.trim();
                if (t) alts.push(t);
              }
              if (alts.length) finals = [...finals, alts];
            } else if (res[0]) pending.push(res[0].transcript);
          }
          interim = pending.join(" ").trim();
          setLive(phrase()[0] ?? "");
          // Si el navegador se queda sin confirmar la frase, se da por terminada tras un silencio.
          clearTimeout(endTimer);
          endTimer = setTimeout(() => finish({ alts: phrase() }), interim ? END_OF_PHRASE_MS : 80);
        };
        r.onerror = (e) => {
          if (e.error === "language-not-supported" && lang.current !== "es-ES") {
            lang.current = "es-ES";
            return;
          }
          if (e.error === "no-speech" || e.error === "aborted") return;
          finish({ error: e.error });
        };
        r.onend = () => {
          if (settled) return;
          // Ya habló: el navegador detectó el fin de la frase, no hay que esperar más.
          if (finals.length || interim) {
            finish({ alts: phrase() });
            return;
          }
          if (Date.now() < deadline) begin();
          else finish({ error: "no-speech" });
        };
        try {
          r.start();
        } catch {
          finish({ error: "audio-capture" });
        }
      };
      begin();
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

  async function pause(id: number, message: string) {
    markField(null);
    if (session.current !== id) return;
    await speak(message);
    if (session.current === id) setStatus("paused");
  }

  function pending(): VoiceField | undefined {
    const { fields, values } = latest.current;
    return fields.find(
      (f) =>
        !answered.current.has(f.name) &&
        values[f.name] === started.current[f.name] &&
        needsAnswer(f, values[f.name]),
    );
  }

  /** Aplica lo que se haya entendido de la frase. Devuelve cuántos datos tomó. */
  function apply(alts: string[], current?: VoiceField): number {
    const { fields, onChange } = latest.current;
    const today = todayLocal();
    const options = alts.map((a) => extractAnswers(fields, a, today, current?.name));
    const best = options.reduce(
      (top, o) => (Object.keys(o.values).length > Object.keys(top.values).length ? o : top),
      options[0] ?? { values: {}, rest: "" },
    );
    const values = { ...best.values };
    if (current && values[current.name] === undefined) {
      // Lo que no se reconoció como otro dato es la respuesta a lo que se acaba de preguntar.
      const said = best.rest || (Object.keys(values).length === 0 ? (alts[0] ?? "") : "");
      const direct =
        current.type === "text" || current.type === "textarea" || current.type === "tag"
          ? interpretAnswer(current, said, today)
          : (alts.map((a) => interpretAnswer(current, a, today)).find((v) => v !== null) ?? null);
      if (direct !== null) values[current.name] = direct;
    }
    for (const [name, value] of Object.entries(values)) {
      answered.current.add(name);
      for (const also of onChange(name, value) ?? []) answered.current.add(also);
    }
    return Object.keys(values).length;
  }

  async function run(id: number, opening: string, firstAsk?: VoiceField): Promise<void> {
    let misses = 0;
    let current = firstAsk ?? pending();
    let say = opening;
    let correcting = false;

    while (session.current === id) {
      markField(current?.name ?? null);
      if (say) await speak(say);
      if (session.current !== id) return;
      const res = await listen(id);
      if (session.current !== id) return;

      if ("error" in res) {
        const stop = fatal(res.error);
        if (stop) return pause(id, stop);
        misses++;
        if (misses >= 2) {
          return pause(
            id,
            "Este celular no me entrega lo que oye. Toque la casilla y use el micrófono del teclado.",
          );
        }
        say = current ? questionFor(current, true) : (latest.current.confirmText ?? "¿Guardo?");
        continue;
      }

      const first = res.alts[0] ?? "";
      setHeard(first);
      const command = detectCommand(first);
      if (command === "detener") return pause(id, "Detenido. Puede seguir escribiendo.");
      if (command === "repetir") {
        say = current ? questionFor(current, true) : "";
        continue;
      }
      if (command === "saltar" && current) {
        if (current.required === false) answered.current.add(current.name);
        else {
          say = `${questionFor(current)} Es obligatorio.`;
          continue;
        }
      }

      if (!current) {
        const fix = res.alts.map((a) => detectCorrection(a, latest.current.fields)).find(Boolean);
        if (fix) {
          current = fix;
          correcting = true;
          say = questionFor(fix);
          continue;
        }
        const yesNo = res.alts.map(detectConfirmation).find(Boolean);
        const taken = apply(res.alts);
        if (taken === 0 && yesNo === "si") return saveNow();
        if (taken === 0 && yesNo === "no") {
          return pause(id, "Listo. Corrija lo que necesite y guarde con el botón.");
        }
        if (taken === 0) {
          misses++;
          if (misses >= MAX_MISSES)
            return pause(id, "No le entendí. Revise y guarde con el botón.");
          say = "Diga sí, no, o el dato que quiera cambiar.";
          continue;
        }
        misses = 0;
      } else if (command !== "saltar") {
        const taken = apply(res.alts, current);
        if (taken === 0) {
          misses++;
          if (misses >= MAX_MISSES) {
            return pause(id, "No le entendí. Escríbalo y toque seguir por voz.");
          }
          say = questionFor(current, true);
          continue;
        }
        misses = 0;
      }

      await tick();
      current = correcting ? undefined : pending();
      correcting = false;
      if (current) {
        say = questionFor(current);
        continue;
      }
      if (endsWithSave(first)) return saveNow();
      say = confirmation();
    }
  }

  function start() {
    stopAudio();
    const id = ++session.current;
    setHeard("");
    // Debe ocurrir aquí, dentro del toque de la persona.
    if (isIOS()) iosOpen();
    if (status !== "paused") {
      answered.current = new Set();
      doubted.current = new Set();
      started.current = { ...latest.current.values };
    }
    const next = pending();
    const opening = status === "paused" && next ? questionFor(next) : "Dígame los datos.";
    void run(id, opening, next);
  }

  function stop() {
    session.current++;
    stopAudio();
    markField(null);
    setLive("");
    setStatus("paused");
    setPrompt("Detenido. Puede seguir escribiendo.");
  }

  function toggleSilent() {
    const next = !silent;
    setSilent(next);
    silentRef.current = next;
    if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      localStorage.setItem(SILENT_KEY, next ? "1" : "0");
    } catch {
      /* sin almacenamiento: vale solo por esta vez */
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: arranca una sola vez y se limpia al cerrar
  useEffect(() => {
    if (props.autoStart && voiceSupported()) start();
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
        <button type="button" className="btn btn-primary btn-sm" onClick={start}>
          <Mic size={16} aria-hidden="true" />
          {status === "paused" ? "Seguir por voz" : "Llenar por voz"}
        </button>
      )}
      {!isIOS() && (
        <button
          type="button"
          className="icon-btn voice-sound"
          aria-pressed={!silent}
          aria-label={silent ? "Activar preguntas en voz alta" : "Silenciar preguntas"}
          title={silent ? "Preguntas solo en pantalla" : "Preguntas en voz alta"}
          onClick={toggleSilent}
        >
          {silent ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
        </button>
      )}
      <div className="voice-text" aria-live="polite">
        {status === "idle" && !prompt && (
          <small>
            Diga todo de una vez o responda lo que le pregunte. Siempre puede corregir a mano.
          </small>
        )}
        {prompt && <strong>{prompt}</strong>}
        {status === "listening" &&
          (live ? (
            <small className="voice-live">«{live}»</small>
          ) : (
            <small className="voice-listening">
              <span className="voice-dot" aria-hidden="true" />{" "}
              {hearing ? "Micrófono activo, escuchando…" : "Escuchando…"}
            </small>
          ))}
        {heard && status !== "listening" && <small>Escuché: «{heard}»</small>}
      </div>
    </div>
  );
}
