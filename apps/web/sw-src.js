/* Service worker — app shell caching.
 *
 * Written by hand rather than generated. The build-time plugins in this space
 * are webpack-based, and Next 16 builds with Turbopack; a hand-written worker
 * has no such coupling and is small enough to read in one sitting.
 *
 * Strategy:
 *   navigations      network-first, falling back to the last good shell, so a
 *                    deploy is picked up immediately but a dead network still
 *                    opens the app
 *   /_next/static/*  cache-first — content-hashed, so it can never go stale
 *   /api/*           never cached; sync must always hit the network
 */

/* Replaced at build time by scripts/build-sw.mjs. Two jobs: it gives each
 * deploy its own cache, and — because it lands in the worker's own bytes — it
 * is what makes the browser notice there is a new worker at all. */
const BUILD = '__BUILD_ID__';
const CACHE = 'athletic-' + BUILD;
const SHELL = '/train';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SHELL, '/week', '/progress', '/manifest.webmanifest']))
      .catch(() => undefined) // a cold install offline is not a failure
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Sync and auth must never be served from a cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match(SHELL)) ??
            new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
          );
        }),
    );
    return;
  }

  const immutable = url.pathname.startsWith('/_next/static/');

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit && immutable) return hit;
      return fetch(request)
        .then((res) => {
          if (res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit ?? Response.error());
    }),
  );
});
