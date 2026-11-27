import { Trash2 } from "lucide-react";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { haptic } from "./native";

/** Fila que se borra al deslizarla hacia un lado (o con la tecla Supr). */
export function SwipeRow(props: { children: ReactNode; onDismiss(): void }) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const dragged = useRef(false);

  const remove = (side: number) => {
    haptic(15);
    setGone(true);
    setDx(side * window.innerWidth);
    window.setTimeout(props.onDismiss, 200);
  };
  const end = (e: PointerEvent<HTMLLIElement>) => {
    if (!start.current?.on) {
      start.current = null;
      return;
    }
    const moved = e.clientX - start.current.x;
    start.current = null;
    if (Math.abs(moved) > Math.min(110, e.currentTarget.offsetWidth * 0.35))
      remove(Math.sign(moved));
    else setDx(0);
  };

  return (
    <li
      className={gone ? "swipe gone" : "swipe"}
      onPointerDown={(e) => {
        dragged.current = false;
        start.current = { x: e.clientX, y: e.clientY, on: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const x = e.clientX - s.x;
        // Solo cuenta si el gesto va de lado; hacia arriba o abajo es desplazar la lista.
        if (!s.on) {
          if (Math.abs(x) < 10 || Math.abs(x) < Math.abs(e.clientY - s.y)) return;
          s.on = true;
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setDx(x);
      }}
      onPointerUp={end}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
      // Soltar después de arrastrar no debe abrir la notificación.
      onClickCapture={(e) => {
        if (!dragged.current) return;
        e.preventDefault();
        e.stopPropagation();
        dragged.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") remove(-1);
      }}
    >
      {dx !== 0 && (
        <span className={dx > 0 ? "swipe-bg left" : "swipe-bg"} aria-hidden="true">
          <Trash2 size={20} /> Borrar
        </span>
      )}
      <div
        className={start.current ? "swipe-body dragging" : "swipe-body"}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        {props.children}
      </div>
    </li>
  );
}
