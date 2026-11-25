import { Check, ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useFarms } from "./animals";
import { scopedFarm, setActiveFarm, useStoredFarm } from "./lib/activeFarm";

/**
 * Chip de la barra superior para escoger la finca con la que se trabaja. Solo aparece con dos
 * o más fincas: con una sola no hay nada que elegir.
 */
export function FarmChip() {
  const farms = useFarms();
  const active = scopedFarm(useStoredFarm(), farms);
  const [open, setOpen] = useState(false);
  if (farms.length < 2) return null;
  const current = farms.find((f) => f.id === active);
  const choose = (id: string) => {
    setActiveFarm(id);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="farm-pick"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MapPin size={16} aria-hidden="true" />
        <span className="farm-pick-name">{current?.name ?? "Todas mis fincas"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              className="backdrop"
              aria-label="Cerrar"
              tabIndex={-1}
              onClick={() => setOpen(false)}
            />
            <dialog open className="sheet-panel farm-sheet" aria-label="Elegir finca">
              <span className="grabber" aria-hidden="true" />
              <h2>¿Con qué finca trabaja?</h2>
              <ul>
                <li>
                  <button
                    type="button"
                    className={active === "" ? "farm-row on" : "farm-row"}
                    onClick={() => choose("")}
                  >
                    <span>
                      Todas mis fincas
                      <small>{farms.length} fincas juntas</small>
                    </span>
                    {active === "" && <Check size={20} aria-hidden="true" />}
                  </button>
                </li>
                {farms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={active === f.id ? "farm-row on" : "farm-row"}
                      onClick={() => choose(f.id)}
                    >
                      <span>{f.name}</span>
                      {active === f.id && <Check size={20} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </dialog>
          </>,
          // La barra superior tiene backdrop-filter: dentro de ella `fixed` no sería de pantalla.
          document.body,
        )}
    </>
  );
}
