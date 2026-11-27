import type { Species } from "@ganaderia/contracts";
import { can, isDryOffDue, isWeaningDue } from "@ganaderia/domain";
import {
  AlertTriangle,
  Baby,
  Building2,
  CheckCircle2,
  Clock,
  KeyRound,
  Package,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useActiveFarm, useFarms } from "./animals";
import { fechaHora, todayLocal } from "./labels";
import { localdb } from "./lib/localdb";
import { type ModuleKey, canSeeModule } from "./modules";
import { useApp } from "./state";
import { statusOf } from "./supplies";

export interface AlertItem {
  id?: string;
  /** Sin leer. */
  fresh?: boolean;
  tone: "error" | "warn" | "info";
  icon: ReactNode;
  title: string;
  text: string;
  go?: () => void;
}

/**
 * Alertas de la finca (registros sin confirmar, destete, secado, insumos, permiso sin conexión).
 * Las muestra la campana de la barra superior; Inicio solo usa el conteo para su título.
 */
export function useAlerts(onOpenSync: () => void, onModule: (m: ModuleKey) => void): AlertItem[] {
  const { orgId, counts, dataVersion, online, role, session } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [weaning, setWeaning] = useState(0);
  const [dryOff, setDryOff] = useState(0);
  const [stock, setStock] = useState({ low: 0, soon: 0, expired: 0 });

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    const inScope = <T extends { farmId: string }>(list: T[]) =>
      active ? list.filter((x) => x.farmId === active) : list;
    void localdb.calves(orgId).then((all) => {
      const today = todayLocal();
      setWeaning(
        inScope(all).filter((c) => {
          const months = farms.find((f) => f.id === c.farmId)?.speciesSettings[c.species as Species]
            ?.weaningMonths;
          return months !== undefined && isWeaningDue(c.birthDate, months, today);
        }).length,
      );
    });
    void Promise.all([localdb.herdAnimals(orgId), localdb.listAnimalEvents(orgId)]).then(
      ([allHerd, allEvents]) => {
        const herd = inScope(allHerd);
        const events = inScope(allEvents);
        const today = todayLocal();
        setDryOff(
          herd.filter((a) => {
            const days = farms.find((f) => f.id === a.farmId)?.speciesSettings[a.species as Species]
              ?.dryOffDays;
            return (
              days !== undefined &&
              isDryOffDue(
                events.filter((e) => e.animalId === a.id),
                days,
                today,
              )
            );
          }).length,
        );
      },
    );
    void localdb.supplyOverview({ orgId, ...(active ? { farmId: active } : {}) }).then((list) => {
      const c = { low: 0, soon: 0, expired: 0 };
      for (const s of list) {
        const st = statusOf(s);
        if (st === "bajo_minimo" || (st === "sin_existencia" && s.minStock > 0)) c.low++;
        else if (st === "vence_pronto") c.soon++;
        else if (st === "vencido") c.expired++;
      }
      setStock(c);
    });
  }, [orgId, dataVersion, farms, active]);

  const revisar = counts.rechazado + counts.conflicto;
  const lease = session ? new Date(session.offlineLeaseUntil) : null;
  const leaseHours = lease ? (lease.getTime() - Date.now()) / 3_600_000 : 0;

  const alerts: AlertItem[] = [];
  if (revisar > 0) {
    alerts.push({
      tone: "error",
      icon: <AlertTriangle size={22} />,
      title:
        revisar === 1
          ? "1 registro no se pudo confirmar"
          : `${revisar} registros no se pudieron confirmar`,
      text: "Fueron rechazados o chocan con un dato ya confirmado. Corríjalos para que se envíen.",
      go: onOpenSync,
    });
  }
  if (role && can(role, "farm.write") && farms.length === 0 && online) {
    alerts.push({
      tone: "info",
      icon: <Building2 size={22} />,
      title: "Registre su finca para empezar",
      text: "Con sus datos y áreas ya puede cargar animales y calcular la carga.",
      go: () => onModule("configuracion"),
    });
  }
  if (weaning > 0) {
    alerts.push({
      tone: "info",
      icon: <Baby size={22} />,
      title: weaning === 1 ? "1 cría en edad de destete" : `${weaning} crías en edad de destete`,
      text: "Según la edad de destete definida para la finca. Revíselas en Animales.",
      go: () => onModule("animales"),
    });
  }
  if (dryOff > 0) {
    alerts.push({
      tone: "info",
      icon: <Baby size={22} />,
      title: dryOff === 1 ? "1 hembra para secar" : `${dryOff} hembras para secar`,
      text: "Llegaron a los días de lactancia definidos para la finca. Regístrelo en Reproducción.",
      go: () => onModule("reproduccion"),
    });
  }
  if (stock.expired > 0) {
    alerts.push({
      tone: "error",
      icon: <AlertTriangle size={22} />,
      title:
        stock.expired === 1
          ? "1 insumo con lotes vencidos en bodega"
          : `${stock.expired} insumos con lotes vencidos en bodega`,
      text: "No se pueden consumir. Revíselos en Compras e insumos.",
      go: () => onModule("compras"),
    });
  }
  if (stock.soon > 0) {
    alerts.push({
      tone: "warn",
      icon: <Clock size={22} />,
      title:
        stock.soon === 1
          ? "1 insumo vence en los próximos 30 días"
          : `${stock.soon} insumos vencen en los próximos 30 días`,
      text: "Use primero los lotes que vencen antes: el sistema los descuenta así.",
      go: () => onModule("compras"),
    });
  }
  if (stock.low > 0) {
    alerts.push({
      tone: "info",
      icon: <Package size={22} />,
      title:
        stock.low === 1
          ? "1 insumo por debajo del mínimo"
          : `${stock.low} insumos por debajo del mínimo`,
      text: "Conviene reponerlos antes de que falten.",
      go: () => onModule("compras"),
    });
  }
  if (counts.pendiente > 0) {
    alerts.push({
      tone: "info",
      icon: <Clock size={22} />,
      title:
        counts.pendiente === 1
          ? "1 registro espera ser enviado"
          : `${counts.pendiente} registros esperan ser enviados`,
      text: online
        ? "Se envían al sincronizar."
        : "Están guardados en este dispositivo y se enviarán al recuperar la conexión.",
      go: onOpenSync,
    });
  }
  if (lease && leaseHours > 0 && leaseHours < 24) {
    alerts.push({
      tone: "warn",
      icon: <KeyRound size={22} />,
      title: "El permiso para trabajar sin conexión vence pronto",
      text: `Conéctese antes del ${fechaHora(lease.toISOString())} para renovarlo.`,
    });
  }

  // Nadie recibe avisos de un módulo que su rol no puede abrir (p. ej. bodega para el veterinario).
  const allowed = canSeeModule("compras", role);
  return allowed ? alerts : alerts.filter((a) => !a.title.includes("insumo"));
}

/** Hoja inferior de la campana: lista de alertas, o «todo en orden». */
export function AlertsSheet({ alerts, onClose }: { alerts: AlertItem[]; onClose(): void }) {
  return createPortal(
    <>
      <button
        type="button"
        className="backdrop"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
      />
      <dialog open className="sheet-panel farm-sheet alerts-sheet" aria-label="Notificaciones">
        <span className="grabber" aria-hidden="true" />
        <h2>Notificaciones</h2>
        {alerts.length === 0 ? (
          <div className="empty-state ok">
            <CheckCircle2 size={34} aria-hidden="true" />
            <p>Todo en orden. No hay notificaciones por ahora.</p>
          </div>
        ) : (
          <ul className="alert-rows">
            {alerts.map((a) => (
              <li key={a.id ?? a.title} className={a.fresh ? "is-new" : undefined}>
                <span className={`ar-icon ar-${a.tone}`}>{a.icon}</span>
                <div className="ar-text">
                  <strong>{a.title}</strong>
                  <p>{a.text}</p>
                </div>
                {a.go && (
                  <button
                    type="button"
                    className="ar-go"
                    aria-label={`Abrir: ${a.title}`}
                    onClick={a.go}
                  >
                    ›
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>,
    // La barra superior tiene backdrop-filter: dentro de ella `fixed` no sería de pantalla.
    document.body,
  );
}
