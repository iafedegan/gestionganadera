// Migración. Las primeras versiones publicaban la app en la raíz con un service worker
// en esta misma ruta (/sw.js) que guardaba una copia vieja y la servía en «/». Este
// reemplazo borra esas copias y se retira, para que «/» muestre la landing y la app
// viva en «/app/» con su propio service worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      for (const w of windows) w.navigate(w.url);
    })(),
  );
});
