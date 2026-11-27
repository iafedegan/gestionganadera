/**
 * Mensaje de texto de emergencia: sale por la red celular, sin internet. La aplicación lo deja
 * escrito en la mensajería del teléfono; la persona toca «Enviar».
 */
import type { TagEvent } from "./animalTags";

/** Solo dígitos, con el 57 delante de los celulares colombianos; vacío si no sirve. */
export function phoneNumber(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("3")) return `+57${d}`;
  return d.length >= 7 && d.length <= 15 ? `+${d}` : "";
}

/** Enlace que abre la mensajería (sirve en Android y en iPhone). */
export const smsLink = (phone: string, body: string) =>
  `sms:${phoneNumber(phone)}?&body=${encodeURIComponent(body)}`;

const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Resumen breve para que el veterinario sepa de qué animal se trata aun sin la aplicación. */
export function smsText(p: {
  reason: string;
  message: string;
  who: string;
  farm?: string | undefined;
  animal?: { tag: string; detail: string; events: TagEvent[]; withdrawal: boolean };
}): string {
  const treat = p.animal?.events
    .filter((e) => e.type === "salud")
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))[0];
  const product = treat ? String((treat.data as { product?: string }).product ?? "") : "";
  const parts = [
    `URGENTE GanSmart: ${p.reason}.`,
    p.animal ? `Animal ${p.animal.tag} (${p.animal.detail}).` : "",
    p.farm ? `Finca ${p.farm}.` : "",
    product && treat ? `Ultimo manejo: ${product} ${short(treat.occurredOn)}.` : "",
    p.animal?.withdrawal ? "En retiro." : "",
    `"${p.message.slice(0, 120)}"`,
    p.who ? `Reporta: ${p.who}.` : "",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 420);
}
