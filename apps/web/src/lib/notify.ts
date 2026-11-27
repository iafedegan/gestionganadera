/**
 * Avisos del sistema para las urgencias: sonido, vibración, número en la pestaña y notificación
 * del teléfono o del computador cuando la aplicación está en segundo plano.
 */

export type NotifyState = "on" | "off" | "ask" | "none";

export function notifyState(): NotifyState {
  if (typeof Notification === "undefined") return "none";
  if (Notification.permission === "granted") return "on";
  return Notification.permission === "denied" ? "off" : "ask";
}

export async function askNotify(): Promise<NotifyState> {
  if (typeof Notification === "undefined") return "none";
  try {
    await Notification.requestPermission();
  } catch {
    /* navegadores viejos: solo con función de retorno */
  }
  return notifyState();
}

/** Notificación del sistema. Con el service worker sirve también en Android con la app de fondo. */
export async function systemNotify(title: string, body: string, tag: string): Promise<void> {
  if (notifyState() !== "on") return;
  const options = {
    body,
    tag,
    renotify: true,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
  } as NotificationOptions;
  try {
    const reg = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);
    if (reg) return await reg.showNotification(title, options);
    new Notification(title, options);
  } catch {
    /* sin permiso real o sin soporte: queda el aviso dentro de la app */
  }
}

let audio: AudioContext | null = null;
/** Dos tonos cortos. El navegador solo deja sonar después de que la persona tocó la página. */
export function chime(urgent: boolean): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const tones = urgent ? [880, 660, 880] : [660, 880];
    tones.forEach((f, i) => {
      const ctx = audio as AudioContext;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.17);
    });
  } catch {
    /* sin audio */
  }
}

const BASE_TITLE = "GanSmart";
/** Número de pendientes en el título de la pestaña: se ve aunque esté en otra. */
export function titleBadge(n: number): void {
  document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
}
