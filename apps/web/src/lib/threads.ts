import type { UrgentAlertDto } from "@ganaderia/contracts";

/**
 * Las urgencias se leen como una conversación por persona: el veterinario ve a cada quien que
 * le escribió, y quien reporta ve a su veterinario. Dentro van todos sus avisos y mensajes.
 */
export interface Thread {
  key: string;
  /** null mientras nadie confirma: se habla con el equipo. */
  userId: string | null;
  /** Persona con quien se habla. */
  name: string;
  /** Avisos de la conversación, del más viejo al más reciente. */
  alerts: UrgentAlertDto[];
  /** Avisos que esta persona puede y debe confirmar. */
  pending: UrgentAlertDto[];
  /** Último movimiento: texto que se muestra en la lista y su hora. */
  preview: string;
  at: string;
}

export const toAttend = (a: UrgentAlertDto) => a.canAck && !a.mine && !a.ackBy;

/** Lo propio, lo que está por confirmar y lo que esta persona atiende. */
const takesPart = (a: UrgentAlertDto) => a.mine || a.attending || toAttend(a);

const activity = (a: UrgentAlertDto) => a.lastMessage?.createdAt ?? a.createdAt;

function previewOf(a: UrgentAlertDto): string {
  const m = a.lastMessage;
  if (m) return m.mine ? `Usted: ${m.preview}` : m.preview;
  if (!a.mine) return a.message;
  return a.ackBy ? "Confirmó que atiende" : "Esperando confirmación";
}

export function buildThreads(items: UrgentAlertDto[]): Thread[] {
  const groups = new Map<
    string,
    { userId: string | null; name: string; alerts: UrgentAlertDto[] }
  >();
  for (const a of items.filter(takesPart)) {
    const [userId, name] = !a.mine
      ? [a.authorId, a.authorName]
      : a.ackById
        ? [a.ackById, a.ackBy as string]
        : [null, "Su veterinario"];
    const key = userId ? `u:${userId}` : "equipo";
    const g = groups.get(key) ?? { userId, name, alerts: [] };
    g.alerts.push(a);
    groups.set(key, g);
  }
  return [...groups]
    .map(([key, g]) => threadOf(key, g.userId, g.name, g.alerts))
    .sort(
      (a, b) =>
        Number(b.pending.length > 0) - Number(a.pending.length > 0) || b.at.localeCompare(a.at),
    );
}

function threadOf(
  key: string,
  userId: string | null,
  name: string,
  items: UrgentAlertDto[],
): Thread {
  const alerts = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = alerts.reduce((x, y) => (activity(y) > activity(x) ? y : x));
  return {
    key,
    userId,
    name,
    alerts,
    pending: alerts.filter(toAttend),
    preview: previewOf(latest),
    at: activity(latest),
  };
}

/**
 * La conversación después de que la persona borró el chat: quedan los avisos con movimiento
 * posterior y los que aún debe atender, que nunca se esconden. Sin ninguno, no queda nada.
 */
export function trimThread(t: Thread, since: string): Thread | null {
  const alerts = t.alerts.filter((a) => toAttend(a) || activity(a) > since);
  return alerts.length > 0 ? threadOf(t.key, t.userId, t.name, alerts) : null;
}
