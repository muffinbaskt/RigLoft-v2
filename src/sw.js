import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

// For the app shell itself (the page, and its main JS/CSS), always try the
// network first with a short timeout, rather than trusting a cached copy
// blindly. This is what actually stops the app from getting stuck serving
// a stale or broken version — a normal reload can now genuinely check for
// something newer instead of always short-circuiting to whatever's cached.
// Registered before precacheAndRoute so it takes priority for these
// specific requests; other assets (icons, etc.) still use the standard
// precached behavior below.
registerRoute(
  ({ request }) =>
    request.mode === "navigate" ||
    request.destination === "script" ||
    request.destination === "style",
  new NetworkFirst({
    cacheName: "app-shell",
    networkTimeoutSeconds: 3,
  })
);

// Standard PWA app-shell caching, same as before
precacheAndRoute(self.__WB_MANIFEST);

// Lets the app manually say "activate the update now" instead of waiting
// for every tab to fully close first — paired with a button in the app.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

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
