const CACHE_PREFIX = 'soleimani-evaluator-shell-';
const CACHE = CACHE_PREFIX + 'v9';
const SHELL = ['/', '/style.css', '/app.js', '/core.mjs', '/manifest.webmanifest', '/icon.svg'];
const OFFLINE_PAGES = new Set(['/', '/index.html']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const shellAsset = SHELL.includes(url.pathname) && !url.search;
  const dashboard = request.mode === 'navigate' && OFFLINE_PAGES.has(url.pathname);
  if (!shellAsset && !dashboard) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (shellAsset && response.ok && !response.redirected) {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const fallback = await cache.match(dashboard ? '/' : request);
      if (fallback) return fallback;
      throw error;
    }
  })());
});
