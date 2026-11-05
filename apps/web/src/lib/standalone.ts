/**
 * La aplicación se abrió como app instalada (PWA) y no en una pestaña del navegador.
 * Además del modo de pantalla, la app instalada abre con `?source=pwa` (start_url del
 * manifiesto); se recuerda en la pestaña para que siga valiendo al navegar.
 */
export const isStandalone = (): boolean => {
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
    return true;
  try {
    if (new URLSearchParams(location.search).get("source") === "pwa")
      sessionStorage.setItem("gg.pwa", "1");
    return sessionStorage.getItem("gg.pwa") === "1";
  } catch {
    return false;
  }
};
