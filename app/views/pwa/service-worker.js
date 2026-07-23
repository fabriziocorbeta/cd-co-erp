const CACHE_VERSION = 'v3';
const OFFLINE_ASSETS = [
  '/offline.html',
  '/logo-offline.svg'
];

// Fingerprinted app-shell assets (CSS/JS/fonts, served under /assets by Propshaft, plus the
// PWA icons) are safe to cache aggressively: their filenames change whenever their content
// does, so a cached entry either still matches the current deploy or is simply never
// requested again once a new deploy ships new digested filenames. Caching them means repeat
// app opens can be served instantly from cache instead of re-fetching the whole shell.
const CACHEABLE_ASSET_PATTERNS = [
  /^\/assets\//,
  /^\/android-chrome-(192x192|512x512)\.png$/,
  /^\/apple-touch-icon\.png$/,
  /^\/logo-pwa\.png$/
];

function isCacheableAsset(pathname) {
  return CACHEABLE_ASSET_PATTERNS.some((pattern) => pattern.test(pathname));
}

// Install event - cache the offline page and assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(OFFLINE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve offline page when network fails
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle navigation requests (page loads)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch((error) => {
        // Only show offline page for network errors
        if (error.name === 'TypeError' || !navigator.onLine) {
          return caches.match('/offline.html');
        }
        throw error;
      })
    );
    return;
  }

  // Cache-first for fingerprinted app-shell assets (CSS/JS/fonts/icons): makes 2nd+ opens
  // fast regardless of network/hosting latency, since nothing needs to round-trip at all.
  if (event.request.method === 'GET' && url.origin === self.location.origin && isCacheableAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Handle offline assets (logo, etc.)
  if (OFFLINE_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

// Add a service worker for processing Web Push notifications:
//
// self.addEventListener("push", async (event) => {
//   const { title, options } = await event.data.json()
//   event.waitUntil(self.registration.showNotification(title, options))
// })
//
// self.addEventListener("notificationclick", function(event) {
//   event.notification.close()
//   event.waitUntil(
//     clients.matchAll({ type: "window" }).then((clientList) => {
//       for (let i = 0; i < clientList.length; i++) {
//         let client = clientList[i]
//         let clientPath = (new URL(client.url)).pathname
//
//         if (clientPath == event.notification.data.path && "focus" in client) {
//           return client.focus()
//         }
//       }
//
//       if (clients.openWindow) {
//         return clients.openWindow(event.notification.data.path)
//       }
//     })
//   )
// })
