/**
 * GroundTruth Service Worker
 *
 * Strategy:
 *  - App shell (HTML, JS, CSS, fonts) → Cache-first, falling back to network.
 *  - API calls  → Network-first, silently failing offline (the app handles
 *    offline via IndexedDB, so we don't need to cache API responses here).
 *  - Images     → Stale-while-revalidate.
 *
 * The cache name is versioned so a new deploy triggers the install/activate
 * cycle and old caches are cleaned up automatically.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `groundtruth-shell-${CACHE_VERSION}`;
const IMG_CACHE = `groundtruth-images-${CACHE_VERSION}`;

// Resources to pre-cache on install (the Vite build injects hashed filenames,
// so we cache the root document and the CDN fonts rather than enumerate chunks).
const PRECACHE_URLS = ["/", "/manifest.json", "/favicon.svg"];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key !== SHELL_CACHE && key !== IMG_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (except Google Fonts / tile CDNs).
  if (request.method !== "GET") return;

  // API calls → network-first, no caching.
  if (
    url.pathname.startsWith("/sync") ||
    url.pathname.startsWith("/issues") ||
    url.pathname.startsWith("/admin") ||
    url.hostname !== self.location.hostname
  ) {
    // For OpenStreetMap tiles, use stale-while-revalidate so the map works offline.
    if (url.hostname.endsWith("tile.openstreetmap.org")) {
      event.respondWith(staleWhileRevalidate(IMG_CACHE, request));
      return;
    }
    // All other external / API requests: pure network.
    return;
  }

  // Image assets → stale-while-revalidate.
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(IMG_CACHE, request));
    return;
  }

  // App shell (HTML, JS, CSS, fonts) → cache-first with network fallback.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function staleWhileRevalidate(cacheName, request) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || networkFetch;
    })
  );
}

// ── Background Sync stub ──────────────────────────────────────────────────────
// When the browser supports Background Sync the app can register a sync tag
// ("outbox-sync") and the SW will drain the outbox even when the page is closed.
self.addEventListener("sync", (event) => {
  if (event.tag === "outbox-sync") {
    // Notify all open clients to run their sync logic.
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "TRIGGER_SYNC" })
        );
      })
    );
  }
});
