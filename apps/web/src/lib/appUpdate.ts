/**
 * Avisa cuando hay una versión nueva de la aplicación. Una pestaña o app abierta durante horas
 * no la buscaría sola: se revisa cada minuto y al volver a ella. No se recarga sin permiso,
 * porque recargar pide ingresar de nuevo y puede cortar un registro a medias.
 */
import { registerSW } from "virtual:pwa-register";

const EVERY = 60_000;

function offer(apply: () => void): void {
  if (document.querySelector(".app-update")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "app-update";
  b.textContent = "Hay una versión nueva. Toque para actualizar";
  b.addEventListener("click", () => {
    b.textContent = "Actualizando…";
    b.disabled = true;
    apply();
  });
  document.body.append(b);
}

export function watchForUpdates(): void {
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => offer(() => void update(true)),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && !document.hidden) void registration.update().catch(() => undefined);
      };
      setInterval(check, EVERY);
      document.addEventListener("visibilitychange", check);
    },
  });
}
