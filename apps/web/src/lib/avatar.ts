/**
 * Foto de perfil: se recorta al centro en un cuadrado pequeño antes de enviarla. En las cuentas
 * de muestra, que son públicas, se guarda solo en este dispositivo.
 */

const SIZE = 256;
const key = (userId: string) => `gg.foto.${userId}`;

export const isDemoEmail = (email: string) => email.endsWith("@demo.ganaderia.local");

/** Cuadrado central de una imagen de ancho × alto. */
export function centerSquare(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.min(w, h);
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), side };
}

export async function toAvatar(file: Blob): Promise<string> {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin lienzo");
  const c = centerSquare(img.width, img.height);
  ctx.drawImage(img, c.x, c.y, c.side, c.side, 0, 0, SIZE, SIZE);
  img.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function localAvatar(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function setLocalAvatar(userId: string, image: string | null): void {
  if (image) localStorage.setItem(key(userId), image);
  else localStorage.removeItem(key(userId));
}
