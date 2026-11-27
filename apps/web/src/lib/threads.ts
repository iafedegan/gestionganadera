import type { UrgentAlertDto } from "@ganaderia/contracts";

/**
 * Las urgencias se leen como una conversación por persona: el veterinario ve a cada quien que
 * le escribió, y quien reporta ve a su veterinario. Dentro van todos sus avisos y mensajes.
 */
export interface Thread {
  key: string;
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
  const groups = new Map<string, { name: string; alerts: UrgentAlertDto[] }>();
  for (const a of items.filter(takesPart)) {
    const [key, name] = !a.mine
      ? [`de:${a.authorId}`, a.authorName]
      : a.ackBy
        ? [`con:${a.ackBy}`, a.ackBy]
        : ["equipo", "Su veterinario"];
    const g = groups.get(key) ?? { name, alerts: [] };
    g.alerts.push(a);
    groups.set(key, g);
  }
  return [...groups]
    .map(([key, g]) => {
      const alerts = [...g.alerts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latest = alerts.reduce((x, y) => (activity(y) > activity(x) ? y : x));
      return {
        key,
        name: g.name,
        alerts,
        pending: alerts.filter(toAttend),
        preview: previewOf(latest),
        at: activity(latest),
      };
    })
    .sort(
      (a, b) =>
        Number(b.pending.length > 0) - Number(a.pending.length > 0) || b.at.localeCompare(a.at),
    );
}
