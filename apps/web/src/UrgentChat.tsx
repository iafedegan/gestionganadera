import type { UrgentAlertDto, UrgentMessageDto } from "@ganaderia/contracts";
import { ArrowUp, Camera, Phone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { type Media, prepareMedia } from "./lib/media";
import { phoneNumber, smsLink } from "./lib/sms";
import { useApp } from "./state";

/** Chat entre quien reportó la urgencia y quien la atiende: texto, fotos y videos cortos. */

const EVERY = 4_000;

export function UrgentChat({ alert, onClose }: { alert: UrgentAlertDto; onClose(): void }) {
  const { online } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UrgentMessageDto[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!online || document.hidden) return;
    api.urgentMessages(alert.id).then(
      (r) => setItems(r.items),
      () => undefined,
    );
  }, [alert.id, online]);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, EVERY);
    return () => clearInterval(t);
  }, [load]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: bajar al llegar un mensaje
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [items.length]);

  async function send(input: { body?: string; media?: Media }) {
    setBusy(true);
    setError(null);
    try {
      await api.urgentSend(alert.id, input);
      if (input.body) setText("");
      load();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? "Sin internet: el mensaje no salió. Use el mensaje de texto o llame."
          : e instanceof ApiError
            ? e.message
            : "No se pudo enviar.",
      );
    }
    setBusy(false);
  }

  async function attach(f: File) {
    setBusy(true);
    setError(null);
    try {
      const media = await prepareMedia(f);
      if ("error" in media) setError(media.error);
      else await send({ media });
    } catch {
      setError("No se pudo leer el archivo.");
    }
    setBusy(false);
  }

  // Con quién se habla: quien reportó ve al veterinario; el veterinario, a quien reportó.
  const other = alert.mine ? (alert.ackBy ?? "Veterinario") : alert.authorName;
  const phone = phoneNumber(
    alert.mine ? alert.recipients.find((r) => r.name === alert.ackBy)?.phone : alert.authorPhone,
  );

  return createPortal(
    <dialog ref={ref} className="uchat" onClose={onClose} aria-labelledby="uchat-title">
      <header>
        <button
          type="button"
          className="uc-btn"
          aria-label="Cerrar chat"
          onClick={() => ref.current?.close()}
        >
          <X size={22} />
        </button>
        <div>
          <h2 id="uchat-title">{other}</h2>
          <small>
            {alert.reason}
            {alert.animal ? ` · ${alert.animal.tag}` : ""}
          </small>
        </div>
        <a
          className="uc-btn"
          href={phone ? `tel:${phone}` : smsLink("", `GanSmart: ${alert.reason}`)}
          aria-label="Llamar"
        >
          <Phone size={20} />
        </a>
      </header>
      <div className="uc-list" ref={list} aria-live="polite">
        <p className="uc-system">
          {alert.ackBy} atiende esta urgencia. Envíen fotos o videos cortos del animal.
        </p>
        {items.map((m) => {
          const src = `/v1/urgencias/${alert.id}/mensajes/${m.id}/archivo`;
          return (
            <div key={m.id} className={m.mine ? "uc-msg mine" : "uc-msg"}>
              {!m.mine && <strong>{m.authorName}</strong>}
              {m.mediaType?.startsWith("image/") && (
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <img src={src} alt="Foto enviada" />
                </a>
              )}
              {m.mediaType?.startsWith("video/") && (
                // biome-ignore lint/a11y/useMediaCaption: video grabado en el potrero, sin subtítulos
                <video src={src} controls playsInline preload="metadata" />
              )}
              {m.body && <p>{m.body}</p>}
              <small>{fechaHora(m.createdAt)}</small>
            </div>
          );
        })}
        {busy && <p className="uc-system">Enviando…</p>}
        {error && (
          <p className="uc-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send({ body: text.trim() });
        }}
      >
        <button
          type="button"
          className="uc-btn uc-cam"
          aria-label="Enviar foto o video"
          disabled={busy || !online}
          onClick={() => file.current?.click()}
        >
          <Camera size={24} />
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void attach(f);
          }}
        />
        <input
          className="uc-text"
          value={text}
          maxLength={2000}
          placeholder="Escriba un mensaje"
          aria-label="Mensaje"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="uc-btn uc-send"
          aria-label="Enviar"
          disabled={busy || !online || !text.trim()}
        >
          <ArrowUp size={22} />
        </button>
      </form>
    </dialog>,
    document.body,
  );
}
