// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animeList, cachedRequest, imageUrl, makeQuery, request } from '../src/lib/api';
import { TOKEN_KEY } from '../src/lib/storage';
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('Yani API', () => {
  it('encodes queries and preserves false and zero values', () => {
    const query = new URLSearchParams(makeQuery({ q: 'Фрирен & друзья', offset: 0, sort_forward: false, status: '', limit: undefined }));
    expect(query.get('q')).toBe('Фрирен & друзья'); expect(query.get('offset')).toBe('0'); expect(query.get('sort_forward')).toBe('false'); expect(query.has('status')).toBe(false);
  });
  it('sends the public application token and Russian language, and unwraps the response', async () => {
    localStorage.setItem(TOKEN_KEY, 'public-test-token');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: [{ anime_id: 1 }] })));
    vi.stubGlobal('fetch', fetcher);
    const result = await request('/anime', { q: 'test' });
    expect(result.data).toEqual([{ anime_id: 1 }]); expect(result.cached).toBe(false);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.yani.tv/anime?q=test');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ Lang: 'ru', 'X-Application': 'public-test-token' });
  });
  it('falls back to the exact cached query on network failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: ['saved'] }))).mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetcher);
    await request('/anime', { q: 'a' });
    expect(await request('/anime', { q: 'a' })).toMatchObject({ data: ['saved'], cached: true });
    await expect(request('/anime', { q: 'b' })).rejects.toThrow('Нет связи');
  });
  it('does not hide authorization failures behind stale data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: [] }))).mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await request('/anime');
    await expect(request('/anime')).rejects.toMatchObject({ status: 403 });
  });
  it('does not hide an explicit 404 behind cached anime details', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: { anime_id: 1 } }))).mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await request('/anime/1');
    await expect(request('/anime/1')).rejects.toMatchObject({ status: 404 });
  });
  it('honors caller cancellation without returning cached content', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(request('/anime', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps only 35 cached responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ response: [] })))));
    for (let i = 0; i < 40; i++) await request('/anime', { offset: i });
    expect(Object.keys(JSON.parse(localStorage.getItem('yumiwatch:api:v1')!))).toHaveLength(35);
  });
  it('returns a cached catalog immediately and exposes its background refresh', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: ['saved'] }))).mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    await animeList({ q: 'cached' });
    const result = await animeList({ q: 'cached' });
    expect(result).toMatchObject({ data: ['saved'], cached: true }); expect(result.revalidate).toBeDefined();
    finish(new Response(JSON.stringify({ response: ['fresh'] })));
    expect(await result.revalidate).toMatchObject({ data: ['fresh'], cached: false });
    expect(Object.values(JSON.parse(localStorage.getItem('yumiwatch:api:v1')!))[0]).toMatchObject({ data: ['fresh'] });
  });
  it('keeps saved data offline and invalidates it on an explicit access denial', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: ['saved'] }))).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await request('/anime');
    const offline = await cachedRequest('/anime'); expect(await offline.revalidate).toMatchObject({ data: ['saved'], cached: true });
    const denied = await cachedRequest('/anime'); await expect(denied.revalidate).rejects.toMatchObject({ status: 403 });
    expect(JSON.parse(localStorage.getItem('yumiwatch:api:v1')!)).toEqual({});
  });
  it('normalizes protocol-relative image links and rejects executable schemes', () => {
    expect(imageUrl('//static.yani.tv/poster.jpg')).toBe('https://static.yani.tv/poster.jpg');
    expect(imageUrl('javascript:alert(1)')).toBe('');
    expect(imageUrl('http://example.com/img.jpg')).toBe('');
  });
});
