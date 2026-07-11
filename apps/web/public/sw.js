const CACHE_NAME = 'fieldconnect-v3';
const STATIC_ASSETS = ['/', '/manifest.json', '/favicon-32.png', '/favicon-16.png', '/apple-touch-icon.png'];

// Paths that must NEVER be served from cache. Next.js content-hashes its
// build artifacts and sets `Cache-Control: public,max-age=31536000,immutable`
// on `/_next/static/*` — the browser caches those correctly on its own,
// and caching them in the SW traps users on stale JS bundles when we ship
// a fix (e.g. the install-banner persistence fix in 8a2d528).
const NEVER_CACHE_PREFIXES = [
  '/_next/static/', // JS chunks, CSS, images with content hashes
  '/_next/data/',   // next/data JSON for getServerSideProps
  '/api/',          // API routes (already skipped above, defense in depth)
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete ALL old caches on activation. The cache-name bump from v1 → v2
  // forces every existing install to drop its stale chunks and fetch fresh
  // ones on next load.
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip non-http(s) requests (chrome-extension, blob, data, etc.)
  if (!url.startsWith('http')) return;

  const pathname = new URL(url).pathname;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Never intercept versioned build assets or API calls — let them go
  // straight to the network. The browser's own immutable cache handles
  // `/_next/static/*` correctly, and API calls must always be live.
  if (NEVER_CACHE_PREFIXES.some((p) => pathname.startsWith(p))) return;

  // For HTML page navigations, always go to the network first so deploys
  // reach users immediately. Fall back to cache only when offline.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // For other same-origin GETs (manifest, favicons, etc.), use a
  // cache-first strategy with a background refresh.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || fetchPromise;
    }),
  );
});

