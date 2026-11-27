import { useSyncExternalStore } from "react";

/**
 * Notificaciones borradas en este dispositivo. Cada clave describe lo que se borró: si cambia
 * (llega otro mensaje, cambia la cuenta de la alerta) vuelve a aparecer.
 */

const STORE = "gg.avisos.borrados";
const MAX = 200;

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let current: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();
const snapshot = () => {
  current ??= new Set(read());
  return current;
};

export function dismiss(...keys: string[]): void {
  const next = [...new Set([...snapshot(), ...keys])].slice(-MAX);
  current = new Set(next);
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    /* sin almacenamiento: dura mientras la app esté abierta */
  }
  for (const l of listeners) l();
}

export function useDismissed(): ReadonlySet<string> {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, snapshot);
}

export const alertKey = (orgId: string, a: { title: string }) => `a:${orgId}:${a.title}`;
export const chatKey = (r: { key: string; at: string; pending: unknown[] }) =>
  `c:${r.key}:${r.at}:${r.pending.length}`;
