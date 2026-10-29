import type { SessionDto } from "@ganaderia/contracts";
import { uuidv7 } from "@ganaderia/domain";
import type { Keystore } from "./localdb";

/** Todo lo que se guarda aquí es no sensible: la clave de datos solo está envuelta. */
const K = {
  device: "gg.deviceId",
  lastEmail: "gg.lastEmail",
  session: (email: string) => `gg.session.${email}`,
  keystore: (userId: string) => `gg.keystore.${userId}`,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento no disponible (modo privado): la app sigue, sin persistir estos datos.
  }
}

export function deviceId(): string {
  const existing = read<string>(K.device);
  if (existing) return existing;
  const id = uuidv7();
  write(K.device, id);
  return id;
}

export const lastEmail = () => read<string>(K.lastEmail) ?? "";
export const saveSession = (s: SessionDto) => {
  write(K.lastEmail, s.email);
  write(K.session(s.email), s);
};
export const loadSession = (email: string) => read<SessionDto>(K.session(email));
export const loadKeystore = (userId: string) => read<Keystore>(K.keystore(userId));
export const saveKeystore = (userId: string, ks: Keystore) => write(K.keystore(userId), ks);
export const clearKeystore = (userId: string) => {
  try {
    localStorage.removeItem(K.keystore(userId));
  } catch {
    /* sin almacenamiento */
  }
};

export const leaseActive = (s: SessionDto, now = Date.now()) =>
  new Date(s.offlineLeaseUntil).getTime() > now;
