import { type RefObject, type TouchEvent, useEffect, useRef, useState } from "react";

/** Vibración corta (Android; iOS no la expone). Respeta reducir movimiento. */
export function haptic(ms = 10): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if ("vibrate" in navigator) navigator.vibrate(ms);
}

export const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent);

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, [query]);
  return on;
}

/** `true` cuando la página se desplazó lo suficiente para mostrar el título compacto. */
export function useScrolled(threshold = 48): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > threshold);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, [threshold]);
  return scrolled;
}

/**
 * Deslizar hacia abajo para cerrar una hoja inferior. Se aplica al panel:
 * `<aside {...swipe.bind}>`; solo actúa cuando el contenido está al inicio.
 */
export function useSwipeDismiss<T extends HTMLElement>(
  onClose: () => void,
  distance = 110,
): { ref: RefObject<T | null>; bind: Record<string, unknown> } {
  const ref = useRef<T>(null);
  const start = useRef<number | null>(null);
  const dy = useRef(0);

  const reset = () => {
    const el = ref.current;
    if (el) {
      el.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
    }
  };

  return {
    ref,
    bind: {
      onTouchStart: (e: TouchEvent) => {
        const el = ref.current;
        start.current = el && el.scrollTop <= 0 ? (e.touches[0]?.clientY ?? null) : null;
        dy.current = 0;
      },
      onTouchMove: (e: TouchEvent) => {
        const el = ref.current;
        if (start.current === null || !el) return;
        const d = (e.touches[0]?.clientY ?? 0) - start.current;
        if (d <= 0) return;
        dy.current = d;
        el.style.transition = "none";
        el.style.transform = `translateY(${d}px)`;
      },
      onTouchEnd: () => {
        if (start.current === null) return;
        const d = dy.current;
        start.current = null;
        if (d > distance) {
          haptic(8);
          onClose();
        } else reset();
      },
    },
  };
}

/** Tirar hacia abajo desde el tope de la página para ejecutar `onRefresh` (como en una app nativa). */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  enabled: boolean,
): { pull: number; refreshing: boolean } {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const down = (e: globalThis.TouchEvent) => {
      const blocked = document.querySelector("dialog[open], .backdrop");
      startY.current = window.scrollY <= 0 && !blocked ? (e.touches[0]?.clientY ?? null) : null;
    };
    const move = (e: globalThis.TouchEvent) => {
      if (startY.current === null) return;
      const d = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (d <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      pullRef.current = Math.min(d * 0.5, 84);
      setPull(pullRef.current);
    };
    const up = async () => {
      if (startY.current === null) return;
      startY.current = null;
      const reached = pullRef.current >= 64;
      pullRef.current = 0;
      setPull(0);
      if (!reached) return;
      haptic(12);
      setRefreshing(true);
      try {
        await cb.current();
      } finally {
        setRefreshing(false);
      }
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [enabled]);

  return { pull, refreshing };
}

/** Evento de instalación (Android/Chrome) y pista para iOS. */
export function useInstall() {
  const [evt, setEvt] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as Event & { prompt(): Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const standalone = isStandalone();
  return {
    standalone,
    canInstall: evt !== null && !standalone,
    iosHint: isIOS() && !standalone,
    prompt: async () => {
      await evt?.prompt();
      setEvt(null);
    },
  };
}
