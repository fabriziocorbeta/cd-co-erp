// Cache version — bump on each deploy to auto-invalidate stale assets
const CACHE_VERSION = '20260414b';
const CACHE_NAME = 'cdco-cache-' + CACHE_VERSION;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/vars.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/utilities.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Algunos recursos estáticos no pudieron ser cacheados', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => {
        if (k !== CACHE_NAME) return caches.delete(k);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignorar peticiones que no sean http/https
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // Network-only: API routes, Supabase, and any non-GET request must bypass cache entirely.
  // Reason: SW re-fetches strip the Origin header, causing CORS 403 on /api/* endpoints.
  const url = event.request.url;
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/')           ||
    url.includes('supabase.co')     ||
    url.includes('/rest/v1/')       ||
    url.includes('/rpc/')           ||
    url.includes('supabase.in')
  ) {
    return; // Let the browser handle it directly — no SW interception
  }

  // Stale-While-Revalidate para recursos locales
  event.respondWith(
    caches.match(event.request).then(cachedRes => {
      const fetchPromise = fetch(event.request).then(networkRes => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const responseToCache = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(event.request, responseToCache).catch(err => {
                console.warn('[SW] Cache.put error:', err);
              });
            } catch (err) {
              console.warn('[SW] Cache.put exception:', err);
            }
          }).catch(err => {
            console.warn('[SW] caches.open error:', err);
          });
        }
        return networkRes;
      }).catch(err => {
        console.warn('[SW] Fetch error:', err);
        return cachedRes;
      });

      return cachedRes || fetchPromise;
    }).catch(err => {
      console.warn('[SW] caches.match error:', err);
    })
  );
});
