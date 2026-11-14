/* Cache the app shell only. Video streams and API requests never enter this cache. */
const VERSION = 'yumiwatch-__VERSION__';
const FILES = __PRECACHE__;
const ROOT = new URL('./', self.location.href);
const POSTERS = 'yumiwatch-posters-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES.map(file => new URL(file, ROOT).href))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('yumiwatch-') && key !== VERSION && key !== POSTERS).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && event.request.destination === 'image' && url.hostname === 'static.yani.tv') {
    event.respondWith(caches.open(POSTERS).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        try {
          await cache.put(event.request, response.clone());
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - 80)).map(key => cache.delete(key)));
        } catch { /* Storage pressure must not prevent a network image from loading. */ }
      }
      return response;
    }).catch(() => fetch(event.request)));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.ok ? response : caches.match(new URL('index.html', ROOT))).catch(() => caches.match(new URL('index.html', ROOT))));
    return;
  }
  if (FILES.some(file => new URL(file, ROOT).pathname === url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
