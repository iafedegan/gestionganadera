import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoiceFormat } from "./media";

/**
 * Graba una nota de voz con el micrófono. Se toca para empezar y se envía o se descarta; al
 * llegar al máximo se envía sola. El micrófono se suelta en cuanto termina.
 */

/** Dos minutos: a 32 kbps son unos 500 KB, lejos del límite de 3 MB. */
const MAX_SECONDS = 120;
const MIN_MS = 800;

const format = () =>
  typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia
    ? null
    : pickVoiceFormat((m) => MediaRecorder.isTypeSupported(m));

export function useVoiceNote(opts: { onRecorded(blob: Blob): void; onError(msg: string): void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const keep = useRef(false);
  const cb = useRef(opts);
  cb.current = opts;
  const [supported] = useState(() => format() !== null);

  const stop = useCallback((send: boolean) => {
    const r = rec.current;
    if (!r) return;
    keep.current = send;
    rec.current = null;
    setStartedAt(null);
    if (r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    const mime = format();
    if (!mime || rec.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      cb.current.onError("Permita el micrófono para grabar notas de voz.");
      return;
    }
    const r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    const began = Date.now();
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    r.onstop = () => {
      for (const t of stream.getTracks()) t.stop();
      if (!keep.current) return;
      if (Date.now() - began < MIN_MS) {
        cb.current.onError("La nota quedó muy corta. Toque el micrófono y hable.");
        return;
      }
      cb.current.onRecorded(new Blob(chunks, { type: r.mimeType || mime }));
    };
    keep.current = false;
    rec.current = r;
    r.start(250);
    setSeconds(0);
    setStartedAt(began);
  }, []);

  // Reloj de la grabación y tope de duración.
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop(true);
    }, 250);
    return () => clearInterval(t);
  }, [startedAt, stop]);

  // Al cerrar el chat se descarta lo que se estuviera grabando.
  useEffect(() => () => stop(false), [stop]);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return { supported, recording: startedAt !== null, clock, start, stop };
}
