const CACHE_NAME = 'gks-workforce-v1';

const PRECACHE_ASSETS = [
  '/',
  '/login',
  '/manifest.json',
  '/logo.png',
  '/icon.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
];

// Install event: cache precached assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: apply caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Exclude non-GET requests
  if (request.method !== 'GET') return;

  // Exclude Firebase WebSockets, API calls, and Next HMR
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.pathname.includes('/_next/webpack-hmr') ||
    url.pathname.startsWith('/api') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // 1. Cache-first for /_next/static/* and static assets (icons, fonts)
  const isStaticAsset = 
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.includes('/_next/static/media/') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.json');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy));
          }
          return networkResponse;
        }).catch(() => {
          return new Response('Offline asset not available', { status: 503 });
        });
      })
    );
    return;
  }

  // 2. Network-first with cache fallback for page navigations
  const isPageNavigation = 
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html');

  if (isPageNavigation) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Fallback to caching '/' or '/login' if matching fails
            return caches.match('/login') || caches.match('/');
          });
        })
    );
    return;
  }

  // 3. Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy));
        }
        return networkResponse;
      }).catch(() => {
        // Fail silently on fetch error, return cached if exists
      });

      return cachedResponse || fetchPromise;
    })
  );
});
