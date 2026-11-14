import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const makeCache = () => ({ addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined), keys: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue(true) });
  const buckets = new Map<string, ReturnType<typeof makeCache>>();
  const cacheFor = (name: string) => { if (!buckets.has(name)) buckets.set(name, makeCache()); return buckets.get(name)!; };
  const cache = cacheFor('yumiwatch-test'); const posters = cacheFor('yumiwatch-posters-v1'); const avatars = cacheFor('yumiwatch-avatars-v1');
  const caches = { open: vi.fn().mockImplementation(async (name: string) => cacheFor(name)), match: vi.fn().mockResolvedValue(new Response('offline shell')), keys: vi.fn().mockResolvedValue(['yumiwatch-old', 'yumiwatch-posters-v1', 'yumiwatch-avatars-v1', 'other-app']), delete: vi.fn().mockResolvedValue(true) };
  const self = { location: { href: 'https://example.github.io/yumiwatch/sw.js' }, addEventListener: (name: string, cb: (event: any) => void) => { handlers[name] = cb; }, clients: { claim: vi.fn() }, skipWaiting: vi.fn() };
  const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
  vm.runInNewContext(readFileSync('src/sw.js', 'utf8').replace('__VERSION__', 'test').replace('__PRECACHE__', '["index.html", "assets/app.js", "manifest.webmanifest"]'), { self, caches, fetch: fetcher, URL, Response, Promise });
  return { handlers, cache, posters, avatars, caches, fetcher, self };
}
describe('service worker on project Pages', () => {
  it('preloads resources within the project scope', async () => {
    const w = worker(); let completion: Promise<unknown> | undefined;
    w.handlers.install({ waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
    await completion;
    expect(w.cache.addAll.mock.calls[0][0]).toEqual(['https://example.github.io/yumiwatch/index.html', 'https://example.github.io/yumiwatch/assets/app.js', 'https://example.github.io/yumiwatch/manifest.webmanifest']);
  });
  it('serves the shell when navigation is offline', async () => {
    const w = worker(); let response: Promise<Response> | undefined;
    w.handlers.fetch({ request: { url: 'https://example.github.io/yumiwatch/', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response!).text()).toBe('offline shell');
    expect(w.caches.match.mock.calls[0][0].href).toBe('https://example.github.io/yumiwatch/index.html');
  });
  it('serves exact shell assets offline even when the server varies module responses by Origin', async () => {
    const w = worker(); let response: Promise<Response> | undefined;
    w.cache.match.mockResolvedValue(new Response('cached module'));
    w.handlers.fetch({ request: { url: 'https://example.github.io/yumiwatch/assets/app.js', method: 'GET', mode: 'cors' }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response!).text()).toBe('cached module');
    expect(w.cache.match.mock.calls[0][0].href).toBe('https://example.github.io/yumiwatch/assets/app.js');
    expect(w.cache.match.mock.calls[0][1]).toEqual({ ignoreVary: true });
    expect(w.fetcher).not.toHaveBeenCalled();
  });
  it('leaves API requests, iframe players, streams, and other Pages apps untouched', () => {
    const w = worker(); const respondWith = vi.fn();
    for (const url of ['https://api.yani.tv/anime', 'https://player.aksor.tv/video/example', 'https://cdn.example/stream.m3u8', 'https://example.github.io/another-app/']) w.handlers.fetch({ request: { url, method: 'GET' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it('cleans only old app-shell caches and preserves other apps and both image caches', async () => {
    const w = worker(); let completion: Promise<unknown> | undefined;
    w.handlers.activate({ waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
    await completion;
    expect(w.caches.delete.mock.calls).toEqual([['yumiwatch-old']]);
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });
  it('activates updates only when the app asks', () => {
    const w = worker();
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
  it('still loads network posters when cache storage is full', async () => {
    const w = worker(); let response: Promise<Response> | undefined;
    w.posters.put.mockRejectedValue(new Error('quota'));
    w.fetcher.mockResolvedValue(new Response('poster'));
    w.handlers.fetch({ request: { url: 'https://static.yani.tv/posters/1.webp', method: 'GET', destination: 'image' }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response!).text()).toBe('poster');
  });
});

function image(w: ReturnType<typeof worker>, url: string) {
  let result: Promise<Response> | undefined;
  w.handlers.fetch({ request: { url, method: 'GET', destination: 'image' }, respondWith: (value: Promise<Response>) => { result = value; } });
  return result!;
}
describe('avatar cache', () => {
  const url = 'https://static.yani.tv/users/small/42.webp?v=2';
  it('serves an already cached avatar without a network request', async () => {
    const w = worker(); w.avatars.match.mockResolvedValue(new Response('cached avatar'));
    expect(await (await image(w, url)).text()).toBe('cached avatar');
    expect(w.fetcher).not.toHaveBeenCalled(); expect(w.posters.match).not.toHaveBeenCalled();
  });
  it('stores avatars separately and bounds their cache without evicting posters', async () => {
    const w = worker(); w.fetcher.mockResolvedValue(new Response('new avatar'));
    const old = Array.from({ length: 66 }, (_, i) => ({ url: `https://static.yani.tv/users/small/${i}.webp` }));
    w.avatars.keys.mockResolvedValue(old);
    expect(await (await image(w, url)).text()).toBe('new avatar');
    expect(w.avatars.put.mock.calls[0][0].url).toBe(url);
    expect(w.avatars.delete.mock.calls).toEqual([[old[0]], [old[1]]]);
    expect(w.posters.put).not.toHaveBeenCalled(); expect(w.posters.delete).not.toHaveBeenCalled();
  });
  it('keeps the version query when looking up an updated avatar', async () => {
    const w = worker(); w.fetcher.mockResolvedValue(new Response('updated'));
    w.avatars.match.mockImplementation(async request => request.url.endsWith('v=1') ? new Response('old') : undefined);
    expect(await (await image(w, url)).text()).toBe('updated');
    expect(w.fetcher).toHaveBeenCalledOnce();
  });
  it('migrates an avatar from the old shared cache even while offline', async () => {
    const w = worker(); w.posters.match.mockResolvedValue(new Response('legacy avatar'));
    expect(await (await image(w, url)).text()).toBe('legacy avatar');
    expect(w.fetcher).not.toHaveBeenCalled(); expect(w.avatars.put).toHaveBeenCalledOnce();
  });
  it('does not cache failed image responses or public profile API calls', async () => {
    const w = worker(); w.fetcher.mockResolvedValue(new Response('missing', { status: 404 }));
    expect((await image(w, url)).status).toBe(404); expect(w.avatars.put).not.toHaveBeenCalled();
    const respondWith = vi.fn();
    w.handlers.fetch({ request: { url: 'https://api.yani.tv/profile', method: 'GET', destination: '' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
});
