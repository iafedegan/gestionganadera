/** Prepara fotos y videos para el chat de la urgencia: las fotos se reducen antes de enviarse. */
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
