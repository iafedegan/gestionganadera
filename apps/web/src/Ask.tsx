import { AlertTriangle, HelpCircle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Preguntas dentro de la aplicación, en lugar de las ventanas del navegador («localhost dice…»):
 * confirmar una acción o escribir un texto corto. Cada llamada devuelve una promesa con la
 * respuesta; si llegan varias, se responden en orden.
 */

export interface AskOptions {
  title: string;
  message?: string;
  /** Texto del botón que acepta. */
  confirm?: string;
  cancel?: string;
  /** La acción borra o quita algo: el botón va en rojo. */
  danger?: boolean;
}

type Request =
  | { id: number; kind: "confirm"; opts: AskOptions; resolve(v: boolean): void }
  | {
      id: number;
      kind: "text";
      opts: AskOptions & { label: string; value: string; maxLength?: number };
      resolve(v: string | null): void;
    };

let queue: Request[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** ¿Seguir con la acción? Responde `true` solo si la persona acepta. */
export function ask(opts: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { id: ++seq, kind: "confirm", opts, resolve }];
    emit();
  });
}

/** Pide un texto corto (p. ej. un nombre). `null` si la persona cancela o lo deja vacío. */
export function askText(
  opts: AskOptions & { label: string; value?: string; maxLength?: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    queue = [
      ...queue,
      { id: ++seq, kind: "text", opts: { ...opts, value: opts.value ?? "" }, resolve },
    ];
    emit();
  });
}

function answer(value: boolean | string | null) {
  const [first, ...rest] = queue;
  if (!first) return;
  queue = rest;
  if (first.kind === "confirm") first.resolve(value === true);
  else first.resolve(typeof value === "string" && value.trim() ? value.trim() : null);
  emit();
}

/** Se monta una vez en la raíz de la aplicación. */
export function AskHost() {
  const current = useSyncExternalStore(subscribe, () => queue[0] ?? null);
  return current ? <AskDialog key={current.id} req={current} /> : null;
}

function AskDialog({ req }: { req: Request }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(req.kind === "text" ? req.opts.value : "");
  const done = useRef(false);
  const reply = (v: boolean | string | null) => {
    if (done.current) return;
    done.current = true;
    answer(v);
  };
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const { opts } = req;
  const Icon = opts.danger ? AlertTriangle : HelpCircle;

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: tocar fuera cancela; con teclado, Esc (onCancel)
    <dialog
      ref={ref}
      className={opts.danger ? "ask-dialog danger" : "ask-dialog"}
      aria-labelledby="ask-title"
      aria-describedby={opts.message ? "ask-msg" : undefined}
      // Esc o cerrar sin responder cuenta como cancelar; no cierra las ventanas de atrás.
      onCancel={(e) => {
        e.preventDefault();
        reply(req.kind === "confirm" ? false : null);
      }}
      onClose={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) reply(req.kind === "confirm" ? false : null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          reply(req.kind === "confirm" ? true : text);
        }}
      >
        <span className="ask-ic" aria-hidden="true">
          <Icon size={24} />
        </span>
        <h2 id="ask-title">{opts.title}</h2>
        {opts.message && <p id="ask-msg">{opts.message}</p>}
        {req.kind === "text" && (
          <label className="ask-field">
            <span>{req.opts.label}</span>
            <input
              // biome-ignore lint/a11y/noAutofocus: es lo único que se pide en esta ventana
              autoFocus
              value={text}
              maxLength={req.opts.maxLength ?? 120}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <div className="ask-actions">
          <button
            type="button"
            className="btn btn-ghost"
            // biome-ignore lint/a11y/noAutofocus: ante algo que borra, Enter no debe confirmarlo
            autoFocus={req.kind === "confirm" && opts.danger === true}
            onClick={() => reply(req.kind === "confirm" ? false : null)}
          >
            {opts.cancel ?? "Cancelar"}
          </button>
          <button
            type="submit"
            className={opts.danger ? "btn btn-primary ask-danger" : "btn btn-primary"}
            disabled={req.kind === "text" && !text.trim()}
            // biome-ignore lint/a11y/noAutofocus: el foco va a la respuesta, como en el sistema
            autoFocus={req.kind === "confirm" && !opts.danger}
          >
            {opts.confirm ?? "Aceptar"}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
