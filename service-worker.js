const CACHE_ASSETS = "portefeuille-assets-v6";
const CACHE_API = "portefeuille-api-v6";
const ASSETS_TO_CACHE = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_ASSETS).then(c => c.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.includes("portefeuille"))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // API requests: network-first (always fresh prices/data)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_API).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request) || new Response("No network"))
    );
  }

  // Static assets: cache-first (fast loading)
  else {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached ||
        fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_ASSETS).then(c => c.put(e.request, clone));
          return res;
        })
      )
    );
  }
});
