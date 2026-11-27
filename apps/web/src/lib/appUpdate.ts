/**
 * Versiones nuevas. El service worker nuevo toma el control apenas se descarga (así nadie queda
 * atrapado en una versión vieja) y la página ofrece recargar; no lo hace sola, porque recargar
 * pide ingresar de nuevo y puede cortar un registro a medias.
 */
const EVERY = 60_000;

function offer(): void {
  if (document.querySelector(".app-update")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "app-update";
  b.textContent = "Hay una versión nueva. Toque para actualizar";
  b.addEventListener("click", () => window.location.reload());
  document.body.append(b);
}

export function watchForUpdates(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // En la primera instalación no hay versión anterior: no se avisa.
  let controlled = Boolean(sw.controller);
  sw.addEventListener("controllerchange", () => {
    if (controlled) offer();
    controlled = true;
  });
  const base = import.meta.env.BASE_URL;
  void sw.register(`${base}sw.js`, { scope: base }).then(
    (registration) => {
      const check = () => {
        if (navigator.onLine && !document.hidden) void registration.update().catch(() => undefined);
      };
      check();
      setInterval(check, EVERY);
      document.addEventListener("visibilitychange", check);
    },
    () => undefined,
  );
}
