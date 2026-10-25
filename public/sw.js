// Service worker di Coach Life: notifiche push e cache dei file dell'app.
const CACHE = "coachlife-v2";
const SHELL = ["/", "/app.css", "/core.js", "/views.js", "/sheets.js", "/app.js", "/onboarding.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Rete prima, cache come riserva
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data ? e.data.text() : "" };
  }
  const title = data.title || "Coach Life";
  const opts = {
    body: data.body || "",
    tag: data.tag || "coach",
    renotify: data.renotify !== false,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  const tasks = [self.registration.showNotification(title, opts)];
  if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    tasks.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge).catch(() => {}) : self.navigator.clearAppBadge().catch(() => {}));
  }
  tasks.push(
    self.clients.matchAll({ type: "window" }).then((list) => list.forEach((c) => c.postMessage({ type: "push", data })))
  );
  e.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.postMessage({ type: "open", url });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
