const CACHE_VERSION = 'v4';
const RUNTIME_CACHE = 'runtime-v1';
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
          if (cacheName !== CACHE_VERSION && cacheName !== RUNTIME_CACHE) {
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

  // Handle navigation requests (page loads) - network-first: try the live
  // page (financial data changes, freshness matters more than instant load
  // here), cache the successful response so the same page can be reopened
  // offline later, and fall back to the last cached copy (or the generic
  // offline page if this URL was never visited) when the network fails.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/offline.html');
          });
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

// --- Background Sync: replay queued offline Sale submissions ---
//
// This duplicates the small IndexedDB helper from
// app/javascript/services/offline_sales_db.js on purpose: this file is
// served as a classic (non-module) script by Rails' rails/pwa controller,
// so it cannot `import` that module.

const OFFLINE_DB_NAME = 'financespy_offline';
const OFFLINE_DB_VERSION = 1;
const PENDING_SALES_STORE = 'pending_sales';
const MAX_SYNC_ATTEMPTS = 5;

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PENDING_SALES_STORE)) {
        db.createObjectStore(PENDING_SALES_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function getAllPendingSales() {
  return openOfflineDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_SALES_STORE, 'readonly');
    const store = tx.objectStore(PENDING_SALES_STORE);
    const request = store.getAll();
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  }));
}

function deletePendingSaleRecord(id) {
  return openOfflineDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_SALES_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_SALES_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  }));
}

function updatePendingSaleRecord(record) {
  return openOfflineDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_SALES_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_SALES_STORE);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  }));
}

let replayInFlight = false;

async function replayPendingSales() {
  if (replayInFlight) return;
  replayInFlight = true;

  try {
    await doReplayPendingSales();
  } finally {
    replayInFlight = false;
  }
}

async function doReplayPendingSales() {
  const pending = await getAllPendingSales();

  for (const sale of pending) {
    if (sale.status === 'needs_review') continue;

    const body = new FormData();
    sale.formData.forEach(([key, value]) => body.append(key, value));

    try {
      const response = await fetch('/sales', {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });

      if (response.ok) {
        await deletePendingSaleRecord(sale.id);
      } else if (response.status === 422) {
        sale.status = 'needs_review';
        sale.errorMessage = 'Datos inválidos - revisar manualmente';
        await updatePendingSaleRecord(sale);
      } else {
        sale.attempts = (sale.attempts || 0) + 1;
        if (sale.attempts >= MAX_SYNC_ATTEMPTS) {
          sale.status = 'needs_review';
          sale.errorMessage = 'Falló tras varios intentos';
        }
        await updatePendingSaleRecord(sale);
      }
    } catch (error) {
      sale.attempts = (sale.attempts || 0) + 1;
      if (sale.attempts >= MAX_SYNC_ATTEMPTS) {
        sale.status = 'needs_review';
        sale.errorMessage = 'Sin conexión tras varios intentos';
      }
      await updatePendingSaleRecord(sale);
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sale-sync') {
    event.waitUntil(replayPendingSales());
  }
});

// Manual trigger for browsers without Background Sync support (iOS Safari):
// application.js posts a message here on the 'online' event.
self.addEventListener('message', (event) => {
  if (event.data === 'replay-pending-sales') {
    event.waitUntil(replayPendingSales());
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
