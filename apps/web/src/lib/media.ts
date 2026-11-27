/** Prepara fotos, videos y notas de voz para los chats: las fotos se reducen antes de enviarse. */
import {
  URGENT_MEDIA_MAX,
  URGENT_MEDIA_TYPES,
  type UrgentMessageCreate,
} from "@ganaderia/contracts";

export type Media = NonNullable<UrgentMessageCreate["media"]>;

/** Medidas nuevas para que el lado mayor no pase de `max`. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function prepareMedia(file: File): Promise<Media | { error: string }> {
  if (file.type.startsWith("image/")) {
    const img = await createImageBitmap(file);
    const size = fitWithin(img.width, img.height, 1280);
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, size.w, size.h);
    img.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob || blob.size > URGENT_MEDIA_MAX) return { error: "No se pudo reducir la foto." };
    return { type: "image/jpeg", data: await toBase64(blob) };
  }
  const type = URGENT_MEDIA_TYPES.find((t) => t === file.type);
  if (!type) return { error: "Solo se pueden enviar fotos y videos." };
  if (file.size > URGENT_MEDIA_MAX)
    return {
      error: "El video pesa más de 3 MB. Grabe uno corto (unos 10 segundos, calidad baja).",
    };
  return { type, data: await toBase64(file) };
}

/** Tipo sin parámetros: «audio/webm;codecs=opus» → «audio/webm». */
export const baseType = (mime: string): string => (mime.split(";")[0] ?? "").trim().toLowerCase();

/** Formatos en que se intenta grabar, del preferido al último recurso. */
const VOICE_FORMATS = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

/** El primer formato que el navegador graba y el servidor acepta; null si no hay cómo grabar. */
export function pickVoiceFormat(supported: (mime: string) => boolean): string | null {
  const accepted = new Set<string>(URGENT_MEDIA_TYPES);
  return VOICE_FORMATS.find((f) => accepted.has(baseType(f)) && supported(f)) ?? null;
}

export async function prepareVoice(blob: Blob): Promise<Media | { error: string }> {
  const type = URGENT_MEDIA_TYPES.find((t) => t.startsWith("audio/") && t === baseType(blob.type));
  if (!type) return { error: "Este teléfono graba en un formato que no se puede enviar." };
  if (blob.size > URGENT_MEDIA_MAX) return { error: "La nota de voz es muy larga." };
  return { type, data: await toBase64(blob) };
}
