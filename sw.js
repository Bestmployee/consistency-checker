// Bump this version string on every deploy so phones pick up the new files
// instead of serving a stale cached copy.
const CACHE_NAME = 'consistency-checker-v2';
const CACHE_PREFIX = 'consistency-checker-';

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/calendar.js',
  './js/gestures.js',
  './js/storage-permission.js',
  './js/export.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './detail.html',
  './saved-items.html',
  './js/saved-items.js',
  './js/saved-items-screen.js',
  './js/entry-utils.js',
  './js/gym-section.js',
  './js/reading-section.js',
  './js/detail-screen.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' fetches every file from the server, so a new cache is never
  // filled with stale copies from the browser's own HTTP cache.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete only this app's older caches; other caches on the same origin are left alone.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pages are opened with query strings (detail.html?date=..., saved-items.html?type=...),
  // which the page code reads from the address bar; the cached page itself is the same
  // file, so page navigations ignore the query when matching. Everything else matches exactly.
  const options = event.request.mode === 'navigate' ? { ignoreSearch: true } : undefined;
  event.respondWith(
    caches.match(event.request, options).then((cached) => cached || fetch(event.request))
  );
});
