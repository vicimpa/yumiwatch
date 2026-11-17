// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { yummyFetch } from '~/lib/api';
import {
  API_TIMEOUT_MS,
  API_RECOVERY_INTERVAL,
  API_URLS,
  activeApiUrl,
  resetApiEndpoint,
} from '~/lib/api-endpoints';
import { clearSession, getSession, saveSession } from '~/lib/session';
import { TOKEN_KEY } from '~/lib/storage';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const urls = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls.map(([url]) => url);

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearSession();
});

describe('Yummy API mirrors', () => {
  it('tries old and ru in order, preserving queries and credentials, then remembers the working mirror', async () => {
    localStorage.setItem(TOKEN_KEY, 'application-token');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(reply(['first']))
      .mockResolvedValueOnce(reply(['second']));
    vi.stubGlobal('fetch', fetcher);

    expect(
      await yummyFetch('/anime', {
        params: { q: 'a & b', offset: 0 },
        token: 'account-token',
      })
    ).toEqual(['first']);
    expect(urls(fetcher)).toEqual(API_URLS.map(base => `${base}/anime?q=a+%26+b&offset=0`));
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Lang: 'ru',
          'X-Application': 'application-token',
          Authorization: 'Yummy account-token',
        },
      });
    }
    expect(await yummyFetch('/anime/1')).toEqual(['second']);
    expect(urls(fetcher).at(-1)).toBe(`${API_URLS[2]}/anime/1?`);
  });

  it('can return from a failed mirror to the primary API', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply('old'))
      .mockRejectedValueOnce(new TypeError('old offline'))
      .mockRejectedValueOnce(new TypeError('ru offline'))
      .mockResolvedValueOnce(reply('primary'));
    vi.stubGlobal('fetch', fetcher);
    expect(await yummyFetch('/anime')).toBe('old');
    expect(await yummyFetch('/anime')).toBe('primary');
    expect(urls(fetcher)).toEqual([0, 1, 1, 2, 0].map(i => `${API_URLS[i]}/anime?`));
  });

  it.each([401, 403, 404, 420, 429])(
    'does not bypass an explicit HTTP %s on another mirror',
    async status => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'denied' }), { status }));
      vi.stubGlobal('fetch', fetcher);
      await expect(yummyFetch('/profile')).rejects.toMatchObject({ status });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  it('preserves an account across server failures and only clears it for a definitive 401', async () => {
    saveSession({
      token: 'account-token',
      user: { id: 42, nickname: 'Viewer' },
      remember: false,
      verified: true,
      refreshedAt: Date.now(),
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(reply({ id: 42 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'expired' }), { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await yummyFetch('/profile', { token: 'account-token' })).toEqual({
      id: 42,
    });
    expect(getSession()?.token).toBe('account-token');
    await expect(yummyFetch('/profile', { token: 'account-token' })).rejects.toMatchObject({
      status: 401,
    });
    expect(getSession()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not move a captcha challenge to a different host', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'captcha', error_code: 5 }), {
        status: 500,
      })
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(yummyFetch('/profile')).rejects.toMatchObject({
      status: 500,
      code: 5,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects broken JSON and unexpected envelopes before selecting a working mirror', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>proxy error</html>'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notResponse: [] })))
      .mockResolvedValueOnce(reply(false));
    vi.stubGlobal('fetch', fetcher);
    expect(await yummyFetch('/anime')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('bounds each stalled request and uses a fresh signal for the next mirror', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_: string, options: RequestInit) =>
          new Promise((_, reject) => {
            options.signal!.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(reply('old'));
    vi.stubGlobal('fetch', fetcher);
    const pending = yummyFetch('/anime');
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    expect(await pending).toBe('old');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false);
    resetApiEndpoint();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops on caller cancellation without trying mirrors or poisoning the preferred endpoint', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_: string, options: RequestInit) =>
          new Promise((_, reject) => {
            options.signal!.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(reply('primary'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = yummyFetch('/anime', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await yummyFetch('/anime')).toBe('primary');
    expect(urls(fetcher)[1]).toBe(`${API_URLS[0]}/anime?`);
  });

  it('does not send a pre-cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(yummyFetch('/anime', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PATCH'])(
    'does not silently replay an ambiguous %s; an explicit retry uses the backup',
    async method => {
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('connection lost'))
        .mockResolvedValueOnce(reply(true));
      vi.stubGlobal('fetch', fetcher);
      const options = { method, body: { message: 'hello' }, token: 'token' };
      await expect(yummyFetch('/dialogs/8/messages', options)).rejects.toThrow('Нет связи');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await yummyFetch('/dialogs/8/messages', options)).toBe(true);
      expect(urls(fetcher)).toEqual(
        API_URLS.slice(0, 2).map(base => `${base}/dialogs/8/messages?`)
      );
      expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify(options.body));
    }
  );

  it('retries idempotent updates with the identical body and headers', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply(true));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await yummyFetch('/anime/1/watch', {
        method: 'PUT',
        body: { position: 12 },
        token: 'token',
      })
    ).toBe(true);
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({
        method: 'PUT',
        body: '{"position":12}',
        headers: {
          Authorization: 'Yummy token',
          'Content-Type': 'application/json',
        },
      });
  });

  it('exhausts each endpoint once and reports the final failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(yummyFetch('/anime')).rejects.toThrow('Нет связи');
    expect(urls(fetcher)).toEqual(API_URLS.map(base => `${base}/anime?`));
  });
});

describe('primary API recovery', () => {
  it('returns to the main API after a successful anonymous background probe', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    localStorage.setItem(TOKEN_KEY, 'application-token');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply('backup'))
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply('main'));
    vi.stubGlobal('fetch', fetcher);
    expect(await yummyFetch('/profile', { token: 'private-token' })).toBe('backup');
    expect(activeApiUrl.value).toBe(API_URLS[1]);
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL);
    expect(fetcher.mock.calls[2][0]).toBe(`${API_URLS[0]}/anime?limit=1`);
    expect(fetcher.mock.calls[2][1].headers).toMatchObject({
      'X-Application': 'application-token',
    });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBeUndefined();
    expect(activeApiUrl.value).toBe(API_URLS[0]);
    expect(await yummyFetch('/anime')).toBe('main');
    expect(fetcher.mock.calls[3][0]).toBe(`${API_URLS[0]}/anime?`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps using the mirror while the primary is unhealthy and retries later', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply('backup'))
      .mockResolvedValueOnce(new Response('down', { status: 502 }))
      .mockResolvedValueOnce(reply('still backup'))
      .mockResolvedValueOnce(reply([]));
    vi.stubGlobal('fetch', fetcher);
    await yummyFetch('/anime');
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL);
    expect(activeApiUrl.value).toBe(API_URLS[1]);
    expect(await yummyFetch('/anime')).toBe('still backup');
    expect(fetcher.mock.calls[3][0]).toBe(`${API_URLS[1]}/anime?`);
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL);
    expect(activeApiUrl.value).toBe(API_URLS[0]);
  });

  it('ignores a late mirror reply after primary recovery', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let finish!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply('backup'))
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce(reply([]));
    vi.stubGlobal('fetch', fetcher);
    await yummyFetch('/anime');
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL - 1000);
    const late = yummyFetch('/anime/1');
    await vi.advanceTimersByTimeAsync(1000);
    finish(reply('late backup'));
    expect(await late).toBe('late backup');
    expect(activeApiUrl.value).toBe(API_URLS[0]);
  });

  it('skips background recovery offline or hidden and cleans up a stalled probe on reset', async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(reply('backup'))
      .mockImplementationOnce(
        (_: string, options: RequestInit) =>
          new Promise((_, reject) => {
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      );
    vi.stubGlobal('fetch', fetcher);
    await yummyFetch('/anime');
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL);
    expect(fetcher).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL);
    expect(fetcher).toHaveBeenCalledTimes(3);
    resetApiEndpoint();
    expect(fetcher.mock.calls[2][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(API_RECOVERY_INTERVAL * 2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('does not undo primary recovery from a normal request when a mirror reply arrives late', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('primary offline'))
    .mockResolvedValueOnce(reply('backup'))
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
    .mockRejectedValueOnce(new TypeError('old offline'))
    .mockRejectedValueOnce(new TypeError('ru offline'))
    .mockResolvedValueOnce(reply('primary'));
  vi.stubGlobal('fetch', fetcher);
  await yummyFetch('/anime');
  const late = yummyFetch('/anime/1');
  expect(await yummyFetch('/anime/2')).toBe('primary');
  finish(reply('late mirror'));
  expect(await late).toBe('late mirror');
  expect(activeApiUrl.value).toBe(API_URLS[0]);
});
