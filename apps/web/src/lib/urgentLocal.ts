/** Lo que la urgencia necesita tener en el teléfono para funcionar sin internet. */
import type { UrgentAlertCreate, UrgentRecipient } from "@ganaderia/contracts";

const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
};

export const teamCache = (org: string) => read<UrgentRecipient[]>(`gg.vet.equipo.${org}`, []);
export const saveTeam = (org: string, team: UrgentRecipient[]) =>
  write(`gg.vet.equipo.${org}`, team);
export const vetPhone = (org: string) => read<string>(`gg.vet.tel.${org}`, "");
export const saveVetPhone = (org: string, phone: string) => write(`gg.vet.tel.${org}`, phone);

/** Avisos que no pudieron salir: se envían solos al volver la señal. */
export const pending = (org: string) => read<UrgentAlertCreate[]>(`gg.vet.cola.${org}`, []);
export const setPending = (org: string, list: UrgentAlertCreate[]) =>
  write(`gg.vet.cola.${org}`, list.slice(-5));
