// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  animeDetail,
  animeVideos,
  cachedRequest,
  peekAnimeDetail,
  peekAnimeVideos,
  request,
} from '~/lib/api';
import { putCache } from '~/lib/cache-store';
import { useResource } from '~/lib/hooks';
import { clearSession, saveSession } from '~/lib/session';

afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Card() {
  const result = useResource(
    signal => animeDetail(1, signal),
    [1],
    () => peekAnimeDetail(1)
  );

  return (
    <>
      <h1>{result.value?.data.title}</h1>
      {result.loading && <p>Loading</p>}
      {result.error && <p role="alert">{result.error}</p>}
    </>
  );
}

describe('memory-first cache', () => {
  it('renders saved details on the first paint and replaces text without replacing the screen', async () => {
    putCache('data', '/anime/1?', { anime_id: 1, title: 'Saved description' });

    let finish!: (response: Response) => void;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>(resolve => {
          finish = resolve;
        })
      )
    );
    render(<Card />);

    const heading = screen.getByRole('heading', { name: 'Saved description' });

    expect(screen.queryByText('Loading')).toBeNull();
    finish(
      new Response(JSON.stringify({ response: { anime_id: 1, title: 'Updated description' } }))
    );
    await screen.findByRole('heading', { name: 'Updated description' });
    expect(screen.getByRole('heading')).toBe(heading);
    expect(screen.queryByText('Loading')).toBeNull();
  });
  it('deduplicates simultaneous refreshes while caller cancellation leaves the other subscriber alive', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<Response>(resolve => {
        finish = resolve;
      })
    );

    vi.stubGlobal('fetch', fetcher);

    const controller = new AbortController();
    const first = request('/anime/2', {}, controller.signal),
      second = request('/anime/2');
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await aborted;
    expect(fetcher).toHaveBeenCalledOnce();
    finish(new Response(JSON.stringify({ response: { anime_id: 2, title: 'Shared response' } })));
    expect(await second).toMatchObject({ data: { title: 'Shared response' }, cached: false });
  });
  it('uses cached translations and episodes immediately and exposes the background replacement', async () => {
    putCache('data', '/anime/3/videos?', [{ video_id: 1, number: '1' }]);

    let finish!: (response: Response) => void;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>(resolve => {
          finish = resolve;
        })
      )
    );
    expect(peekAnimeVideos(3)?.data).toHaveLength(1);

    const saved = await animeVideos(3);

    expect(saved.cached).toBe(true);
    finish(
      new Response(
        JSON.stringify({
          response: [
            { video_id: 1, number: '1' },
            { video_id: 2, number: '2' },
          ],
        })
      )
    );
    expect((await saved.revalidate)?.data).toHaveLength(2);
  });
  it('isolates private episode progress from other accounts and the guest', async () => {
    const account = (id: number) =>
      saveSession({
        token: `account-${id}`,
        user: { id, nickname: 'Viewer' },
        verified: true,
        remember: false,
        refreshedAt: Date.now(),
      });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ response: [{ number: '1', watched: { end_time: 123 } }] })
            )
          )
        )
    );
    account(42);
    await animeVideos(4);
    expect(peekAnimeVideos(4)?.data[0].watched?.end_time).toBe(123);
    account(43);
    expect(peekAnimeVideos(4)).toBeUndefined();
    clearSession();
    expect(peekAnimeVideos(4)).toBeUndefined();
  });
  it('removes stale details on explicit deletion instead of hiding the 404 behind cached data', async () => {
    putCache('data', '/anime/1?', { anime_id: 1, title: 'Removed title' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    render(<Card />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Removed title')).toBeNull();
    expect(peekAnimeDetail(1)).toBeUndefined();
  });
  it('keeps saved content when a background refresh loses the network', async () => {
    putCache('data', '/anime/5?', { anime_id: 5, title: 'Available offline' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const result = await cachedRequest('/anime/5');

    expect(await result.revalidate).toMatchObject({
      data: { title: 'Available offline' },
      cached: true,
    });
  });
});
