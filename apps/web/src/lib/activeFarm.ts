import { useSyncExternalStore } from "react";
import { dataScope } from "./scope";

/**
 * Finca activa: con varias fincas, el productor elige con cuál trabajar y el resto de la app
 * (Inicio, Animales, Insumos, Mapa, clima) se limita a ella. Vacío = todas. Se recuerda por
 * organización en este dispositivo.
 */
const listeners = new Set<() => void>();
const key = () => `gg.finca.${dataScope.org}`;

function read(): string {
  try {
    return localStorage.getItem(key()) ?? "";
  } catch {
    return "";
  }
}

export function setActiveFarm(id: string): void {
  try {
    if (id) localStorage.setItem(key(), id);
    else localStorage.removeItem(key());
  } catch {
    /* sin almacenamiento: la elección dura mientras la app esté abierta */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Id guardado de la finca activa; puede no existir ya, por eso se valida con `scopedFarm`. */
export function useStoredFarm(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

/** La finca activa si sigue existiendo entre las del usuario; si no, "" (todas). */
export function scopedFarm(stored: string, farms: { id: string }[]): string {
  return stored && farms.some((f) => f.id === stored) ? stored : "";
}
