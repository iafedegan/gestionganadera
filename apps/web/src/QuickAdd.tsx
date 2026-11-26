import type { Role } from "@ganaderia/contracts";
import { can } from "@ganaderia/domain";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Baby,
  Heart,
  type LucideIcon,
  Milk,
  PlusCircle,
  Scale,
  Sparkles,
  Syringe,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { requestIntent } from "./lib/intent";
import { type ModuleKey, canSeeModule } from "./modules";
import { haptic, useSwipeDismiss } from "./native";

/**
 * «Anotar»: lo que pasa en la finca a un toque, desde cualquier pantalla. Cada opción abre
 * directamente su formulario en el módulo que corresponde, con palabras del día a día.
 */

export interface QuickItem {
  id: string;
  module: ModuleKey;
  action: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: "azul" | "verde" | "rojo" | "ambar" | "violeta";
  need: "event.write" | "animal.write" | null;
}

export const QUICK: QuickItem[] = [
  {
    id: "ordeno",
    module: "produccion",
    action: "ordeno",
    label: "Ordeño",
    hint: "Litros de hoy",
    icon: Milk,
    tone: "azul",
    need: "event.write",
  },
  {
    id: "peso",
    module: "produccion",
    action: "peso",
    label: "Pesaje",
    hint: "Kilos del animal",
    icon: Scale,
    tone: "azul",
    need: "event.write",
  },
  {
    id: "animal",
    module: "animales",
    action: "registrar",
    label: "Animal nuevo",
    hint: "Nació o llegó",
    icon: PlusCircle,
    tone: "verde",
    need: "animal.write",
  },
  {
    id: "sanidad",
    module: "sanidad",
    action: "evento",
    label: "Vacuna o tratamiento",
    hint: "Enfermo o vacunado",
    icon: Syringe,
    tone: "rojo",
    need: "event.write",
  },
  {
    id: "celo",
    module: "reproduccion",
    action: "celo",
    label: "Celo",
    hint: "Lo vio en celo",
    icon: Sparkles,
    tone: "ambar",
    need: "event.write",
  },
  {
    id: "servicio",
    module: "reproduccion",
    action: "servicio",
    label: "Servicio",
    hint: "Monta o inseminación",
    icon: Heart,
    tone: "ambar",
    need: "event.write",
  },
  {
    id: "parto",
    module: "reproduccion",
    action: "parto",
    label: "Parto",
    hint: "Nació una cría",
    icon: Baby,
    tone: "ambar",
    need: "event.write",
  },
  {
    id: "gasto",
    module: "economia",
    action: "Egreso",
    label: "Gasto",
    hint: "Pagó algo",
    icon: ArrowUpCircle,
    tone: "violeta",
    need: null,
  },
  {
    id: "ingreso",
    module: "economia",
    action: "Ingreso",
    label: "Venta o ingreso",
    hint: "Le pagaron",
    icon: ArrowDownCircle,
    tone: "violeta",
    need: null,
  },
];

export function quickFor(role: Role | null): QuickItem[] {
  return QUICK.filter(
    (q) =>
      canSeeModule(q.module, role) && (q.need === null || (role !== null && can(role, q.need))),
  );
}

export function QuickGrid(props: {
  items: QuickItem[];
  onModule(m: ModuleKey): void;
  onPicked?(): void;
}) {
  return (
    <div className="quick-grid">
      {props.items.map((q) => (
        <button
          key={q.id}
          type="button"
          className={`quick q-${q.tone}`}
          onClick={() => {
            haptic(8);
            props.onPicked?.();
            requestIntent(q.module, q.action);
            props.onModule(q.module);
            window.scrollTo({ top: 0 });
          }}
        >
          <span className="q-ic" aria-hidden="true">
            <q.icon size={26} />
          </span>
          <strong>{q.label}</strong>
          <small>{q.hint}</small>
        </button>
      ))}
    </div>
  );
}

export function QuickSheet(props: {
  items: QuickItem[];
  onModule(m: ModuleKey): void;
  onClose(): void;
}) {
  const swipe = useSwipeDismiss<HTMLElement>(props.onClose);
  return createPortal(
    <>
      <button
        type="button"
        className="backdrop"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={props.onClose}
      />
      <aside
        className="sheet-panel quick-sheet"
        aria-label="Anotar"
        ref={swipe.ref}
        {...swipe.bind}
      >
        <span className="grabber" aria-hidden="true" />
        <div className="drawer-head">
          <h2>¿Qué quiere anotar?</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={props.onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="quick-lead">Toque lo que pasó y se abre el formulario listo para llenar.</p>
        <QuickGrid items={props.items} onModule={props.onModule} onPicked={props.onClose} />
      </aside>
    </>,
    document.body,
  );
}
