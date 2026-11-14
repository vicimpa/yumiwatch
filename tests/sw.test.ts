import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined), keys: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue(true) };
  const caches = { open: vi.fn().mockResolvedValue(cache), match: vi.fn().mockResolvedValue(new Response('offline shell')), keys: vi.fn().mockResolvedValue(['yumiwatch-old', 'yumiwatch-posters-v1', 'other-app']), delete: vi.fn().mockResolvedValue(true) };
  const self = { location: { href: 'https://example.github.io/yumiwatch/sw.js' }, addEventListener: (name: string, cb: (event: any) => void) => { handlers[name] = cb; }, clients: { claim: vi.fn() }, skipWaiting: vi.fn() };
  const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
  vm.runInNewContext(readFileSync('src/sw.js', 'utf8').replace('__VERSION__', 'test').replace('__PRECACHE__', '["index.html", "assets/app.js", "manifest.webmanifest"]'), { self, caches, fetch: fetcher, URL, Response, Promise });
  return { handlers, cache, caches, fetcher, self };
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
  it('leaves API requests, iframe players, streams, and other Pages apps untouched', () => {
    const w = worker(); const respondWith = vi.fn();
    for (const url of ['https://api.yani.tv/anime', 'https://player.aksor.tv/video/example', 'https://cdn.example/stream.m3u8', 'https://example.github.io/another-app/']) w.handlers.fetch({ request: { url, method: 'GET' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it('cleans only old app-shell caches and preserves other apps and poster cache', async () => {
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
    w.cache.put.mockRejectedValue(new Error('quota'));
    w.fetcher.mockResolvedValue(new Response('poster'));
    w.handlers.fetch({ request: { url: 'https://static.yani.tv/posters/1.webp', method: 'GET', destination: 'image' }, respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response!).text()).toBe('poster');
  });
});
