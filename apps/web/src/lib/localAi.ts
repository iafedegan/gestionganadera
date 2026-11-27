import type { OwnAi } from "@ganaderia/contracts";

/**
 * Clave de Gemini guardada solo en este dispositivo. La usan las cuentas de muestra, que son
 * públicas: el servidor nunca la almacena, solo la usa para responder cada pregunta.
 */
const key = (userId: string) => `gg.ia.${userId}`;

export function localAi(userId: string): OwnAi | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as OwnAi | null;
    return v?.apiKey && v.model ? v : null;
  } catch {
    return null;
  }
}

export function setLocalAi(userId: string, ai: OwnAi | null): void {
  if (ai) localStorage.setItem(key(userId), JSON.stringify(ai));
  else localStorage.removeItem(key(userId));
}
