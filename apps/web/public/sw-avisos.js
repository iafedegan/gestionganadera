/* Al tocar un aviso del sistema se vuelve a la aplicación (o se abre si estaba cerrada). */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes("/app/"));
      if (open) return open.focus();
      return self.clients.openWindow("/app/");
    }),
  );
});
