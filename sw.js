// ── THE TERMINATOR ──────────────────────────────────────────────────────────
// CACHE_VERSION — bump this string on every deploy to invalidate old SW caches
const CACHE_VERSION = '20260504c';
const CACHE_NAME = 'cdco-cache-' + CACHE_VERSION;

// 1. INSTALL: skip waiting immediately — no caching on install
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 2. ACTIVATE: claim all clients + nuke every existing cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 3. FETCH: network-only for HTML navigation; network-first for JS/CSS; passthrough for APIs
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;

  const url = event.request.url;

  // Passthrough: non-GET, API routes, Supabase
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/')           ||
    url.includes('supabase.co')     ||
    url.includes('/rest/v1/')       ||
    url.includes('/rpc/')           ||
    url.includes('supabase.in')
  ) {
    return;
  }

  // Navigation (HTML): network-only — never serve a stale page
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS/CSS (versioned): network-first, offline fallback to cache
  if (url.includes('/js/') || url.includes('/css/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone())).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fresh = fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
