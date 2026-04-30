// Cache version — bump on each deploy to auto-invalidate stale assets
const CACHE_VERSION = '20260429';
const CACHE_NAME = 'cdco-cache-' + CACHE_VERSION;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Nuke ALL caches — clean slate on every new SW version
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  const url = event.request.url;

  // Network-only: non-GET, API, Supabase
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

  // HTML documents: network-only — never serve stale index.html from cache
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JS/CSS: network-first, fall back to cache only if offline
  if (url.includes('/js/') || url.includes('/css/')) {
    event.respondWith(
      fetch(event.request).then(networkRes => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return networkRes;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cachedRes => {
      const fetchPromise = fetch(event.request).then(networkRes => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, networkRes.clone()))
            .catch(() => {});
        }
        return networkRes;
      }).catch(() => cachedRes);
      return cachedRes || fetchPromise;
    })
  );
});
