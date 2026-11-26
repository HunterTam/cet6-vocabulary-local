const CACHE_NAME = "cet6-pwa-v10";
const STATIC_SHELL = ["./manifest.webmanifest", "./icon-192.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Bypass Safari HTTP disk cache when installing a new SW so we never copy stale HTML into the new cache
      try {
        const freshHtml = await fetch(new Request("./index.html", { cache: "no-store" }));
        if (freshHtml.ok) {
          await cache.put("./index.html", freshHtml.clone());
          await cache.put("./", freshHtml);
        }
      } catch {}
      await Promise.all(
        STATIC_SHELL.map(url =>
          fetch(new Request(url, { cache: "no-cache" }))
            .then(res => (res.ok ? cache.put(url, res) : undefined))
            .catch(() => undefined),
        ),
      );
    }).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request)
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // HTML navigations: fast network-first (1.5s max) bypassing HTTP cache, with instant fallback to cached HTML if offline/slow.
  // This guarantees iPhone Home Screen PWA picks up new deployments immediately without staying stuck on stale versions.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const noCacheReq = new Request(request.url, { cache: "no-cache" });
        try {
          const fresh = await fetchWithTimeout(noCacheReq, 1500);
          if (fresh && fresh.ok) {
            cache.put("./index.html", fresh.clone()).catch(() => undefined);
            cache.put("./", fresh.clone()).catch(() => undefined);
            return fresh;
          }
        } catch {
          // Slow/offline: continue background refresh while returning cache immediately
          fetch(noCacheReq)
            .then(res => {
              if (res && res.ok) {
                cache.put("./index.html", res.clone()).catch(() => undefined);
                cache.put("./", res.clone()).catch(() => undefined);
              }
            })
            .catch(() => undefined);
        }
        return (await cache.match("./index.html")) || (await cache.match("./")) || fetch(request);
      })(),
    );
    return;
  }

  // Content-hashed Vite assets (/assets/index-XXXX.js|.css): cache-first for instant <10ms loads
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        });
      }),
    );
    return;
  }

  // Other same-origin static files: stale-while-revalidate
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
    }),
  );
});
