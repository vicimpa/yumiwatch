/* Cache the app shell and public CDN images. API responses and video never enter these caches. */
const VERSION = 'yumiwatch-__VERSION__';
const FILES = __PRECACHE__;
const ROOT = new URL('./', self.location.href);
const POSTERS = 'yumiwatch-posters-v1';
const AVATARS = 'yumiwatch-avatars-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache =>
        cache.addAll(
          FILES.filter(file => !file.includes('shaka-player')).map(file => new URL(file, ROOT).href)
        )
      )
  );
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('yumiwatch-') &&
                key !== VERSION &&
                key !== POSTERS &&
                key !== AVATARS
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'GET' &&
    event.request.destination === 'image' &&
    url.protocol === 'https:' &&
    url.hostname === 'static.yani.tv'
  ) {
    const avatar = /^\/users\/(?:small|big|full)\//.test(url.pathname);

    event.respondWith(
      cachedImage(
        event.request,
        avatar ? AVATARS : POSTERS,
        avatar ? 64 : 80,
        avatar ? POSTERS : undefined
      )
    );

    return;
  }
  if (
    event.request.method !== 'GET' ||
    url.origin !== ROOT.origin ||
    !url.pathname.startsWith(ROOT.pathname)
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => (response.ok ? response : caches.match(new URL('index.html', ROOT))))
        .catch(() => caches.match(new URL('index.html', ROOT)))
    );

    return;
  }

  const file = FILES.find(file => new URL(file, ROOT).pathname === url.pathname);

  if (file) {
    // These are our exact, versioned shell files. Local preview can vary by Origin;
    // module requests include it while addAll does not. Match the canonical asset.
    event.respondWith(
      caches.open(VERSION).then(async cache => {
        const cached = await cache.match(new URL(file, ROOT), { ignoreVary: true });

        if (cached) return cached;

        const response = await fetch(event.request);

        if (response.ok) {
          try {
            await cache.put(new URL(file, ROOT), response.clone());
          } catch {
            /* Loading still succeeds under storage pressure. */
          }
        }

        return response;
      })
    );
  }
});

async function storeImage(cache, request, response, limit) {
  try {
    await cache.put(request, response.clone());

    const keys = await cache.keys();

    await Promise.all(
      keys.slice(0, Math.max(0, keys.length - limit)).map(key => cache.delete(key))
    );
  } catch {
    /* Storage pressure must not prevent an image from loading. */
  }
}

async function cachedImage(request, name, limit, previousName) {
  let cache;

  try {
    cache = await caches.open(name);

    const cached = await cache.match(request);

    if (cached) return cached;
    // Keep an already-downloaded avatar available offline after upgrading the app.
    if (previousName) {
      const previous = await caches.open(previousName);
      const legacy = await previous.match(request);

      if (legacy) {
        await storeImage(cache, request, legacy, limit);

        return legacy;
      }
    }
  } catch {
    /* Fetch directly when Cache Storage is unavailable. */
  }

  const response = await fetch(request);

  if (cache && (response.ok || response.type === 'opaque'))
    await storeImage(cache, request, response, limit);

  return response;
}
