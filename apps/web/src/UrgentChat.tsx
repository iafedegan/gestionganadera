import type { UrgentMessageDto } from "@ganaderia/contracts";
import { ArrowUp, Camera, ClipboardList, Phone, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UrgentRecordSheet } from "./UrgentRecord";
import { fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { type Media, prepareMedia } from "./lib/media";
import { phoneNumber, smsLink } from "./lib/sms";
import type { Thread } from "./lib/threads";
import { useApp } from "./state";

/**
 * Chat de las urgencias con una persona: cada aviso aparece como un caso, seguido de sus
 * mensajes, fotos y videos. Se responde sobre el animal que se escoja.
 */

const EVERY = 4_000;

export function UrgentChat({
  thread,
  onClose,
  onAttend,
}: {
  thread: Thread;
  onClose(): void;
  /** El veterinario lee antes de confirmar y confirma desde aquí. */
  onAttend?(): void;
}) {
  const { online } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<Record<string, UrgentMessageDto[]>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un tema por animal: si hay varios avisos del mismo, se responde en el más reciente.
  const topics = [...new Map(thread.alerts.map((a) => [a.animal?.tag ?? a.reason, a])).entries()];
  const latest = thread.alerts.reduce((x, y) =>
    (y.lastMessage?.createdAt ?? y.createdAt) > (x.lastMessage?.createdAt ?? x.createdAt) ? y : x,
  );
  const alert = thread.alerts.find((a) => a.id === picked) ?? latest;
  const viewed = thread.alerts.find((a) => a.id === viewing)?.animal;
  const ids = thread.alerts.map((a) => a.id).join(",");

  const load = useCallback(() => {
    if (!online || document.hidden) return;
    Promise.all(
      ids.split(",").map((id) => api.urgentMessages(id).then((r) => [id, r.items] as const)),
    ).then(
      (all) => setMessages(Object.fromEntries(all)),
      () => undefined,
    );
  }, [ids, online]);
  const total = Object.values(messages).reduce((n, m) => n + m.length, 0);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, EVERY);
    return () => clearInterval(t);
  }, [load]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: bajar al llegar un mensaje o un aviso
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [total, thread.alerts.length]);

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

  const phone = phoneNumber(
    alert.mine ? alert.recipients.find((r) => r.name === alert.ackBy)?.phone : alert.authorPhone,
  );

  return createPortal(
    <dialog
      ref={ref}
      className="uchat"
      // El cierre de la hoja de vida (o de este chat) no debe cerrar las ventanas de atrás.
      onClose={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="uchat-title"
    >
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
          <h2 id="uchat-title">{thread.name}</h2>
          <small>
            {thread.alerts.length === 1
              ? `${alert.reason}${alert.animal ? ` · ${alert.animal.tag}` : ""}`
              : `${thread.alerts.length} avisos`}
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
        {thread.alerts.map((a) => (
          <Fragment key={a.id}>
            <article className={a.ackBy ? "uc-case ok" : "uc-case"}>
              <header>
                <strong>
                  {a.reason}
                  {a.animal ? ` · ${a.animal.tag}` : ""}
                </strong>
                <small>{[a.farmName, fechaHora(a.createdAt)].filter(Boolean).join(" · ")}</small>
              </header>
              <p>«{a.message}»</p>
              <span className="uc-state">
                {a.ackBy ? `Atiende ${a.ackBy}` : "Esperando confirmación"}
              </span>
              {a.animal && (
                <button type="button" onClick={() => setViewing(a.id)}>
                  <ClipboardList size={16} aria-hidden="true" /> Hoja de vida y trazabilidad
                </button>
              )}
            </article>
            {messages[a.id]?.map((m) => {
              const src = `/v1/urgencias/${a.id}/mensajes/${m.id}/archivo`;
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
          </Fragment>
        ))}
        {thread.alerts.some((a) => a.mine && !a.ackBy) && (
          <p className="uc-system">
            Mientras confirman, mande fotos o videos del animal: ya los pueden ver.
          </p>
        )}
        {busy && <p className="uc-system">Enviando…</p>}
        {error && (
          <p className="uc-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {onAttend && (
        <button type="button" className="uc-attend" onClick={onAttend}>
          {thread.pending.length > 1
            ? `Voy a atender (${thread.pending.length} avisos)`
            : "Voy a atender"}
        </button>
      )}
      {topics.length > 1 && (
        // biome-ignore lint/a11y/useSemanticElements: grupo de opciones sobre el campo de texto
        <div className="uc-topics" role="group" aria-label="Responder sobre">
          <span>Sobre:</span>
          {topics.map(([label, a]) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={label === (alert.animal?.tag ?? alert.reason)}
              onClick={() => setPicked(a.id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {viewed && <UrgentRecordSheet animal={viewed} onClose={() => setViewing(null)} />}
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
