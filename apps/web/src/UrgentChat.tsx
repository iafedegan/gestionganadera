import type { UrgentAlertDto, UrgentMessageDto } from "@ganaderia/contracts";
import { ArrowUp, Camera, ClipboardList, Mic, Phone, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UrgentRecordSheet } from "./UrgentRecord";
import { fechaHora } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { type Media, prepareMedia, prepareVoice } from "./lib/media";
import { phoneNumber, smsLink } from "./lib/sms";
import type { Thread } from "./lib/threads";
import { useVoiceNote } from "./lib/useVoiceNote";
import { useApp } from "./state";

/**
 * Chat con una persona: cada aviso urgente aparece como un caso, seguido de sus mensajes,
 * fotos, videos y notas de voz. Se responde sobre el animal que se escoja.
 */

const EVERY = 4_000;
const GENERAL = "general";

export function UrgentChat({
  thread,
  onClose,
  onAttend,
  onDelete,
  since,
  subtitle,
}: {
  thread: Thread;
  onClose(): void;
  /** El veterinario lee antes de confirmar y confirma desde aquí. */
  onAttend?(): void;
  /** Borra el chat para esta persona; responde si se borró. */
  onDelete?(): Promise<boolean>;
  /** Cuándo la persona borró el chat: lo anterior no se muestra. */
  since?: string | null;
  /** Papel y ganadería de la persona. */
  subtitle?: string;
}) {
  const { online } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<Record<string, UrgentMessageDto[]>>({});
  const [direct, setDirect] = useState<UrgentMessageDto[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { userId } = thread;
  // Un tema por animal: si hay varios avisos del mismo, se responde en el más reciente.
  const topics = [...new Map(thread.alerts.map((a) => [a.animal?.tag ?? a.reason, a])).entries()];
  const latest = thread.alerts.reduce<UrgentAlertDto | undefined>(
    (x, y) =>
      !x || (y.lastMessage?.createdAt ?? y.createdAt) > (x.lastMessage?.createdAt ?? x.createdAt)
        ? y
        : x,
    undefined,
  );
  // Con urgencia sin confirmar se responde sobre ella; si no, conversación normal.
  const fallback = userId && thread.pending.length === 0 ? GENERAL : latest?.id;
  const target = picked ?? fallback ?? GENERAL;
  const alert = thread.alerts.find((a) => a.id === target);
  const viewed = thread.alerts.find((a) => a.id === viewing)?.animal;
  const ids = thread.alerts.map((a) => a.id).join(",");

  const load = useCallback(() => {
    if (!online || document.hidden) return;
    Promise.all(
      ids
        .split(",")
        .filter(Boolean)
        .map((id) => api.urgentMessages(id).then((r) => [id, r.items] as const)),
    ).then(
      (all) => setMessages(Object.fromEntries(all)),
      () => undefined,
    );
    if (userId)
      api.chatMessages(userId).then(
        (r) => setDirect(r.items),
        () => undefined,
      );
  }, [ids, userId, online]);

  // Todo en orden de llegada: los avisos, sus mensajes y la conversación normal.
  const timeline = [
    ...thread.alerts.map((a) => ({ at: a.createdAt, alert: a, message: null, src: "" })),
    ...thread.alerts.flatMap((a) =>
      (messages[a.id] ?? []).flatMap((m) =>
        since && m.createdAt <= since
          ? []
          : [
              {
                at: m.createdAt,
                alert: null,
                message: m,
                src: `/v1/urgencias/${a.id}/mensajes/${m.id}/archivo`,
              },
            ],
      ),
    ),
    ...direct.map((m) => ({
      at: m.createdAt,
      alert: null,
      message: m,
      src: `/v1/chats/${userId}/mensajes/${m.id}/archivo`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const total = timeline.length;

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
  }, [total]);

  async function send(input: { body?: string; media?: Media }) {
    setBusy(true);
    setError(null);
    try {
      if (alert) await api.urgentSend(alert.id, input);
      else if (userId) await api.chatSend(userId, input);
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

  const voice = useVoiceNote({
    onRecorded: (blob) => {
      void (async () => {
        const media = await prepareVoice(blob);
        if ("error" in media) setError(media.error);
        else await send({ media });
      })();
    },
    onError: setError,
  });

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

  const about = alert ?? latest;
  const phone = about
    ? phoneNumber(
        about.mine
          ? about.recipients.find((r) => r.name === about.ackBy)?.phone
          : about.authorPhone,
      )
    : "";

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
            {subtitle ??
              (thread.alerts.length === 1 && latest
                ? `${latest.reason}${latest.animal ? ` · ${latest.animal.tag}` : ""}`
                : `${thread.alerts.length} avisos`)}
          </small>
        </div>
        {onDelete && (
          <button
            type="button"
            className="uc-btn"
            aria-label="Borrar chat"
            onClick={async () => {
              if (await onDelete()) ref.current?.close();
            }}
          >
            <Trash2 size={20} />
          </button>
        )}
        {(phone || about) && (
          <a
            className="uc-btn"
            href={phone ? `tel:${phone}` : smsLink("", `GanSmart: ${about?.reason ?? ""}`)}
            aria-label="Llamar"
          >
            <Phone size={20} />
          </a>
        )}
      </header>
      <div className="uc-list" ref={list} aria-live="polite">
        {total === 0 && <p className="uc-system">Escriba el primer mensaje a {thread.name}.</p>}
        {timeline.map(({ alert: a, message: m, src }) =>
          a ? (
            <article key={a.id} className={a.ackBy ? "uc-case ok" : "uc-case"}>
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
          ) : (
            m && (
              <div key={m.id} className={m.mine ? "uc-msg mine" : "uc-msg"}>
                {m.mediaType?.startsWith("image/") && (
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt="Foto enviada" />
                  </a>
                )}
                {m.mediaType?.startsWith("video/") && (
                  // biome-ignore lint/a11y/useMediaCaption: video grabado en el potrero, sin subtítulos
                  <video src={src} controls playsInline preload="metadata" />
                )}
                {m.mediaType?.startsWith("audio/") && (
                  // biome-ignore lint/a11y/useMediaCaption: nota de voz, sin transcripción
                  <audio src={src} controls preload="metadata" aria-label="Nota de voz" />
                )}
                {m.body && <p>{m.body}</p>}
                <small>{fechaHora(m.createdAt)}</small>
              </div>
            )
          ),
        )}
        {thread.alerts.some((a) => a.mine && !a.ackBy) && (
          <p className="uc-system">
            Mientras confirman, mande fotos o videos del animal: ya los pueden ver.
          </p>
        )}
        {busy && <p className="uc-system">Enviando…</p>}
      </div>
      {/* Fuera de la lista: el aviso se ve aunque la conversación sea larga. */}
      {error && (
        <p className="uc-error" role="alert">
          {error}
        </p>
      )}
      {onAttend && (
        <button type="button" className="uc-attend" onClick={onAttend}>
          {thread.pending.length > 1
            ? `Voy a atender (${thread.pending.length} avisos)`
            : "Voy a atender"}
        </button>
      )}
      {topics.length + (userId ? 1 : 0) > 1 && (
        // biome-ignore lint/a11y/useSemanticElements: grupo de opciones sobre el campo de texto
        <div className="uc-topics" role="group" aria-label="Responder sobre">
          <span>Sobre:</span>
          {userId && (
            <button
              type="button"
              aria-pressed={target === GENERAL}
              onClick={() => setPicked(GENERAL)}
            >
              General
            </button>
          )}
          {topics.map(([label, a]) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={alert ? label === (alert.animal?.tag ?? alert.reason) : false}
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
        {voice.recording ? (
          <>
            <button
              type="button"
              className="uc-btn uc-cam"
              aria-label="Descartar nota de voz"
              onClick={() => voice.stop(false)}
            >
              <Trash2 size={22} />
            </button>
            <output className="uc-rec">
              <span className="uc-rec-dot" /> Grabando {voice.clock}
            </output>
            <button
              type="button"
              className="uc-btn uc-send"
              aria-label="Enviar nota de voz"
              onClick={() => voice.stop(true)}
            >
              <ArrowUp size={22} />
            </button>
          </>
        ) : (
          <>
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
            {!text.trim() && voice.supported ? (
              <button
                type="button"
                className="uc-btn uc-send"
                aria-label="Grabar nota de voz"
                disabled={busy || !online}
                onClick={() => {
                  setError(null);
                  void voice.start();
                }}
              >
                <Mic size={22} />
              </button>
            ) : (
              <button
                type="submit"
                className="uc-btn uc-send"
                aria-label="Enviar"
                disabled={busy || !online || !text.trim()}
              >
                <ArrowUp size={22} />
              </button>
            )}
          </>
        )}
      </form>
    </dialog>,
    document.body,
  );
}
