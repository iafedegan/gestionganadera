import { useEffect, useRef } from "react";
import type { ModuleKey } from "../modules";

/**
 * «Abrir el formulario X del módulo Y» desde fuera del módulo (botón Anotar, Inicio).
 * Quien pide deja la intención y navega; el módulo la toma al montarse o, si ya estaba
 * abierto, al recibir el evento. Se consume una sola vez.
 */

let pending: { module: ModuleKey; action: string } | null = null;
const EVENT = "gg-intent";

export function requestIntent(module: ModuleKey, action: string): void {
  pending = { module, action };
  window.dispatchEvent(new Event(EVENT));
}

export function takeIntent(module: ModuleKey): string | null {
  if (pending?.module !== module) return null;
  const a = pending.action;
  pending = null;
  return a;
}

/** Llama a `run` con la acción pedida para este módulo, si es una de las `allowed`. */
export function useIntent<A extends string>(
  module: ModuleKey,
  allowed: readonly A[],
  run: (action: A) => void,
): void {
  const cb = useRef(run);
  cb.current = run;
  // biome-ignore lint/correctness/useExhaustiveDependencies: la lista de acciones es fija por módulo
  useEffect(() => {
    const check = () => {
      if (pending?.module !== module || !allowed.includes(pending.action as A)) return;
      const a = takeIntent(module) as A;
      cb.current(a);
    };
    check();
    window.addEventListener(EVENT, check);
    return () => window.removeEventListener(EVENT, check);
  }, [module]);
}
