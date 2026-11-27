import type { ChatContact, Role } from "@ganaderia/contracts";
import { Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ask } from "./Ask";
import { Avatar } from "./Avatar";
import { CowBot } from "./CowBot";
import { markThreadRead, unreadAlerts, useUrgentCenter } from "./Emergency";
import { SwipeRow } from "./SwipeRow";
import { UrgentChat } from "./UrgentChat";
import { api } from "./lib/api";
import { type ChatRow, buildChats, removedRow } from "./lib/chats";
import { chime, systemNotify, titleBadge } from "./lib/notify";
import { haptic } from "./native";
import { useApp } from "./state";

/**
 * Chats como en una mensajería: el asistente fijo arriba y una fila por persona del equipo, con
 * su último mensaje, lo sin leer y las urgencias.
 */

const EVERY = 5_000;
const HIDDEN_EVERY = 20_000;
const ROLE: Record<Role, string> = {
  propietario: "Propietario",
  admin_entidad: "Administrador",
  mayordomo: "Mayordomo",
  operario: "Operario",
  veterinario: "Veterinario",
  tecnico: "Asesor técnico",
};

const initials = (name: string) =>
  name
    .replace(/\(.*?\)|^(Dra?\.)\s*/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** Hora si es de hoy, «Ayer» o la fecha, como en cualquier lista de chats. */
function when(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days <= 0) return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return days === 1 ? "Ayer" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

const about = (r: ChatRow) =>
  r.contact ? `${ROLE[r.contact.role]} · ${r.contact.organizationName}` : "";

/**
 * Toda fila de una persona se puede deslizar: si hay mensajes se borran para quien desliza; si
 * no, la persona sale de la lista. Con una urgencia sin atender se explica qué hacer.
 */
export const removable = (r: ChatRow) => r.contact !== null;

export function useChatCenter() {
  const { session, online, notify } = useApp();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  // La fila abierta; si cambia de clave (alguien confirmó), se sigue por el aviso.
  const [open, setOpen] = useState<{ key: string; alertId?: string } | null>(null);
  const openAlert = useCallback((alertId: string) => setOpen({ key: "", alertId }), []);
  const { threads, attend } = useUrgentCenter(openAlert);

  const load = useCallback(() => {
    if (!session || !online) return;
    api.chats().then(
      (r) => setContacts(r.items),
      () => undefined,
    );
  }, [session, online]);
  useEffect(() => {
    load();
    let t = setInterval(load, document.hidden ? HIDDEN_EVERY : EVERY);
    const onVisible = () => {
      clearInterval(t);
      t = setInterval(load, document.hidden ? HIDDEN_EVERY : EVERY);
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Mensaje nuevo de alguien del equipo: suena y avisa una sola vez.
  useEffect(() => {
    for (const c of contacts) {
      const m = c.lastMessage;
      if (!m || m.mine || c.unread === 0) continue;
      const key = `gg.chat.visto.${m.id}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, "1");
      } catch {
        continue;
      }
      haptic(200);
      chime(false);
      notify(`${c.name}: ${m.preview}`, "warn");
      if (document.hidden) void systemNotify(`Mensaje de ${c.name}`, m.preview, `dm-${c.userId}`);
    }
  }, [contacts, notify]);

  const rows = buildChats(contacts, threads, unreadAlerts);
  const row = open
    ? (rows.find((r) => r.alerts.some((a) => a.id === open.alertId)) ??
      rows.find((r) => r.key === open.key))
    : undefined;
  useEffect(() => {
    if (row) markThreadRead(row);
  }, [row]);

  const unread = rows.filter((r) => r.unread > 0 || r.pending.length > 0).length;
  useEffect(() => {
    titleBadge(unread);
    return () => titleBadge(0);
  }, [unread]);

  const openRow = useCallback((r: ChatRow) => {
    const alertId = r.alerts.at(-1)?.id;
    setOpen({ key: r.key, ...(alertId ? { alertId } : {}) });
  }, []);

  /** Borra el chat para esta persona, después de confirmarlo. */
  const remove = useCallback(
    async (r: ChatRow): Promise<boolean> => {
      if (!r.contact) return false;
      // Una urgencia sin confirmar no se esconde: primero alguien tiene que atenderla.
      if (r.pending.length > 0) {
        const go = await ask({
          title: "Primero atienda la urgencia",
          message:
            "Esta conversación tiene una urgencia sin confirmar. Ábrala y toque «Voy a atender»; después la puede borrar.",
          confirm: "Abrir conversación",
          cancel: "Ahora no",
        });
        if (go) openRow(r);
        return false;
      }
      if (!online) {
        notify("Sin conexión: el chat se puede borrar cuando vuelva la señal.", "warn");
        return false;
      }
      const name = r.name.replace(/\s*\(.*\)$/, "");
      const ok = await ask(
        r.at
          ? {
              title: `¿Borrar el chat con ${name}?`,
              message: `Se borra solo para usted: ${name} conserva sus mensajes.`,
              confirm: "Borrar chat",
              danger: true,
            }
          : {
              title: `¿Quitar a ${name} de sus chats?`,
              message: "Vuelve a aparecer si le escribe. Para escribirle, búsquelo arriba.",
              confirm: "Quitar",
              danger: true,
            },
      );
      if (!ok) return false;
      try {
        await api.chatClear(r.contact.userId);
      } catch {
        notify("No se pudo borrar el chat. Intente de nuevo.", "warn");
        return false;
      }
      load();
      return true;
    },
    [online, notify, load, openRow],
  );

  const node = row ? (
    <UrgentChat
      key={row.key}
      thread={row}
      since={row.contact?.clearedAt ?? null}
      {...(removable(row) && row.pending.length === 0 ? { onDelete: () => remove(row) } : {})}
      {...(row.contact ? { subtitle: about(row) } : {})}
      onClose={() => {
        setOpen(null);
        load();
      }}
      {...(row.pending.length > 0 ? { onAttend: () => attend(row.pending) } : {})}
    />
  ) : null;

  return {
    node,
    rows,
    unread,
    remove,
    open: openRow,
  };
}

export function ChatRows(props: {
  rows: ChatRow[];
  onOpen(r: ChatRow): void;
  /** Al deslizar una fila se borra (de las notificaciones, o el chat). `false` la devuelve. */
  onDismiss?(r: ChatRow): unknown;
  /** Qué filas se pueden deslizar; por defecto, todas. */
  canDismiss?(r: ChatRow): boolean;
  /** Borrar pregunta antes: la fila espera la respuesta y en PC lleva su botón de papelera. */
  confirm?: boolean;
}) {
  return (
    <ul className="chats" aria-label="Conversaciones">
      {props.rows.map((r) => {
        const urgent = r.pending.length > 0;
        const row = (
          <button
            key={r.key}
            type="button"
            className={urgent ? "ch-row urgent" : r.unread ? "ch-row new" : "ch-row"}
            onClick={() => {
              haptic(8);
              props.onOpen(r);
            }}
          >
            <Avatar className="ch-av" initials={initials(r.name)} src={r.contact?.avatar ?? null} />
            <span className="ch-main">
              <span className="ch-top">
                <strong>{r.name}</strong>
                <time>{when(r.at)}</time>
              </span>
              <span className="ch-bottom">
                <small>{r.preview || about(r)}</small>
                {urgent ? (
                  <b className="ch-urg">Urgente</b>
                ) : (
                  r.unread > 0 && <b className="ch-count">{r.unread}</b>
                )}
              </span>
            </span>
          </button>
        );
        return props.onDismiss && (props.canDismiss?.(r) ?? true) ? (
          <SwipeRow
            key={r.key}
            onDismiss={() => props.onDismiss?.(r)}
            {...(props.confirm ? { confirm: true } : {})}
          >
            {row}
            {props.confirm && (
              <button
                type="button"
                className="ch-del"
                aria-label={`Borrar el chat con ${r.name}`}
                title="Borrar chat"
                onClick={() => void props.onDismiss?.(r)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </SwipeRow>
        ) : (
          <li key={r.key}>{row}</li>
        );
      })}
    </ul>
  );
}

type Filter = "todos" | "sin_leer" | "urgentes";
const FILTERS: [Filter, string][] = [
  ["todos", "Todos"],
  ["sin_leer", "No leídos"],
  ["urgentes", "Urgentes"],
];

const plain = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function ChatsDialog(props: {
  rows: ChatRow[];
  onOpen(r: ChatRow): void;
  onAssistant(): void;
  /** Borra el chat con una persona; responde si se borró. */
  onDelete(r: ChatRow): Promise<boolean>;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const term = plain(search.trim());
  // Quien se quitó de la lista solo aparece al buscarlo.
  const listed = term ? props.rows : props.rows.filter((r) => !removedRow(r));
  const hidden = props.rows.length - listed.length;
  const shown = listed.filter(
    (r) =>
      (filter === "todos" ||
        (filter === "urgentes" ? r.pending.length > 0 : r.unread > 0 || r.pending.length > 0)) &&
      plain(`${r.name} ${about(r)}`).includes(term),
  );
  return createPortal(
    <dialog
      ref={ref}
      className="chats-dialog"
      aria-labelledby="chats-title"
      onClose={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <header>
        <h2 id="chats-title">Chats</h2>
        <button
          type="button"
          className="ch-close"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          <X size={22} />
        </button>
        <label className="ch-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={search}
            placeholder="Buscar una persona"
            aria-label="Buscar una persona"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {/* biome-ignore lint/a11y/useSemanticElements: grupo de filtros */}
        <div className="ch-filters" role="group" aria-label="Filtrar">
          {FILTERS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="ch-scroll">
        {filter === "todos" && !term && (
          <button type="button" className="ch-row ch-ai" onClick={props.onAssistant}>
            <span className="ch-cow" aria-hidden="true">
              <CowBot size={44} />
            </span>
            <span className="ch-main">
              <span className="ch-top">
                <strong>Su super ganadero</strong>
                <em>Asistente</em>
              </span>
              <span className="ch-bottom">
                <small>Pregunte por sus fincas y animales</small>
              </span>
            </span>
          </button>
        )}
        <ChatRows
          rows={shown}
          onOpen={props.onOpen}
          onDismiss={props.onDelete}
          canDismiss={removable}
          confirm
        />
        {shown.length === 0 && (
          <p className="ch-empty">
            {props.rows.length === 0
              ? "Cuando tenga personas en su equipo, aparecerán aquí."
              : hidden > 0 && filter === "todos" && !term
                ? "No tiene chats abiertos. Busque arriba a una persona del equipo para escribirle."
                : "No hay conversaciones con ese filtro."}
          </p>
        )}
        {hidden > 0 && shown.length > 0 && filter === "todos" && !term && (
          <p className="ch-hint">
            {hidden === 1
              ? "1 persona quitada de la lista: búsquela arriba para escribirle."
              : `${hidden} personas quitadas de la lista: búsquelas arriba para escribirles.`}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
