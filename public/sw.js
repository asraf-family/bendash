const CACHE_NAME = 'bendash-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/lib/alpine.min.js',
  '/lib/sortable.min.js',
  '/icon.svg',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for shell, network-only for API with offline fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always try network, return JSON error if offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Shell assets: network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh response
        if (response.ok && SHELL_ASSETS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
