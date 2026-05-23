const CACHE_ASSETS = "portefeuille-assets-v7";
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
          .filter(k => k !== CACHE_ASSETS)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Skip non-GET and Netlify Functions (always fresh)
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/.netlify/")) return;

  // Static assets: cache-first
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
});
