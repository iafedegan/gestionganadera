import type { ChatContact } from "@ganaderia/contracts";
import { type Thread, trimThread } from "./threads";

/** Una fila de la lista de chats: la persona, con sus mensajes y sus urgencias. */
export interface ChatRow extends Thread {
  contact: ChatContact | null;
  /** Hay algo sin leer. */
  unread: number;
}

/**
 * La persona se quitó de la lista (se borró su chat) y no ha pasado nada después: no se muestra,
 * salvo al buscarla. Vuelve sola cuando escribe o llega una urgencia suya.
 */
export const removedRow = (r: ChatRow): boolean =>
  r.contact?.clearedAt != null && r.at === "" && r.pending.length === 0;

export function buildChats(
  contacts: ChatContact[],
  threads: Thread[],
  unreadAlerts: (t: Thread) => number,
): ChatRow[] {
  const rows = new Map<string, ChatRow>();
  for (const t of threads) rows.set(t.key, { ...t, contact: null, unread: unreadAlerts(t) });
  for (const c of contacts) {
    const key = `u:${c.userId}`;
    const whole = rows.get(key);
    // Si la persona borró el chat, lo anterior no vuelve a aparecer.
    const t = whole && c.clearedAt ? (trimThread(whole, c.clearedAt) ?? undefined) : whole;
    const m = c.lastMessage;
    const newer = m && (!t?.at || m.createdAt > t.at);
    rows.set(key, {
      key,
      userId: c.userId,
      name: c.name,
      alerts: t?.alerts ?? [],
      pending: t?.pending ?? [],
      preview: newer ? `${m.mine ? "Usted: " : ""}${m.preview}` : (t?.preview ?? ""),
      at: newer ? m.createdAt : (t?.at ?? ""),
      contact: c,
      unread: (t ? unreadAlerts(t) : 0) + c.unread,
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(b.pending.length > 0) - Number(a.pending.length > 0) ||
      b.at.localeCompare(a.at) ||
      a.name.localeCompare(b.name, "es"),
  );
}
