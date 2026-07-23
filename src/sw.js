import { precacheAndRoute } from "workbox-precaching";

// Standard PWA app-shell caching, same as before
precacheAndRoute(self.__WB_MANIFEST);

// Shows a real device notification when a push arrives, even if the app
// isn't open at the time.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Riggy", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Riggy", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Tapping the notification opens the app (or focuses it if already open)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetUrl = event.notification.data?.url || "/";
      for (const client of allClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })()
  );
});
