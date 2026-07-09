const CACHE_NAME = 'fieldconnect-v1';
const STATIC_ASSETS = ['/', '/manifest.json', '/favicon-32.png', '/favicon-16.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip non-http(s) requests (chrome-extension, blob, data, etc.)
  if (!url.startsWith('http')) return;
  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET' || url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        // Cache successful responses for same-origin static assets
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || fetchPromise;
    }),
  );
});
