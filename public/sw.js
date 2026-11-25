const CACHE_NAME = "cet6-pwa-v5";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Stale-while-revalidate for BOTH HTML navigations and assets so iPhone PWA opens instantaneously from cache
  // while quietly fetching any fresh GitHub Pages deployment in the background.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then(cached => {
        const fresh = fetch(request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, copy.clone());
                cache.put("./index.html", copy);
              }).catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const fresh = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
