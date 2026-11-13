/*
 * The service worker: a small script the browser runs in the background.
 * It keeps a copy of every file of the app on the device, so the app opens
 * with no internet connection.
 *
 * Don't edit the two __PLACEHOLDER__ lines by hand: "npm run build" fills them
 * in (see scripts/generate-sw.mjs) and writes the result to dist/sw.js.
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;

const CACHE_PREFIX = 'spanish-cards-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

// When a new version of the app is published: download all of its files...
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

// ...then throw away the copies belonging to older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// Whenever the app asks for one of its files, answer from the saved copy.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Opening the app itself always gets the saved index.html.
      const saved = await cache.match(request.mode === 'navigate' ? './index.html' : request, { ignoreSearch: true });
      return saved ?? fetch(request);
    })(),
  );
});
