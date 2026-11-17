import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchServerStatus, parseServerStatus } from '~/lib/server-status';
import fixture from './fixtures/yummy-status.json';

const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn() }));
vi.mock('~/lib/desktop', () => ({ isDesktop: () => native.enabled, desktopInvoke: native.invoke }));
afterEach(() => {
  native.enabled = false;
  native.invoke.mockReset();
  vi.unstubAllGlobals();
});

describe('public YummyStatus data', () => {
  it('reads the observed public schema and uses the newest sample instead of historical health', () => {
    const value = parseServerStatus(fixture);
    expect(value.updatedAt).toBe(Date.parse(fixture.updatedAt));
    expect(value.servers.map(server => [server.domain, server.state])).toEqual([
      ['api.yani.tv', 'down'],
      ['old.yummyani.me', 'up'],
      ['ru.yummyani.me', 'up'],
    ]);
    expect(value.servers[1].latency).toBe(315);
    const shuffled = structuredClone(fixture);
    shuffled.domains.forEach(domain => domain.buckets.reverse());
    expect(parseServerStatus(shuffled)).toEqual(value);
  });

  it('keeps missing, unknown, and invalid samples unknown rather than healthy', () => {
    const value = parseServerStatus({
      updatedAt: fixture.updatedAt,
      domains: [
        {
          domain: 'api.yani.tv',
          health: 'stable',
          buckets: [{ time: fixture.updatedAt, status: 'SOMETHING_NEW', totalTimeAvg: -1 }],
        },
        { domain: 'old.yummyani.me', buckets: [{ time: 'not a date', status: 'UP' }] },
      ],
    });
    expect(value.servers.map(server => server.state)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(value.servers[0].latency).toBeUndefined();
    expect(value.servers[1].checkedAt).toBeUndefined();
  });

  it.each([
    null,
    [],
    {},
    { updatedAt: 'bad', domains: [] },
    { updatedAt: fixture.updatedAt, domains: {} },
  ])('rejects malformed monitoring payload %j', value => {
    expect(() => parseServerStatus(value)).toThrow('неожиданный ответ');
  });

  it('uses the fixed native command without forwarding any account credentials', async () => {
    native.enabled = true;
    native.invoke.mockResolvedValue(fixture);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchServerStatus()).servers).toHaveLength(3);
    expect(native.invoke).toHaveBeenCalledWith('yummy_server_status', {}, expect.any(AbortSignal));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the fixed development proxy and omits browser credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetcher);
    await fetchServerStatus();
    expect(fetcher).toHaveBeenCalledWith(
      '/yummystatus-api',
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      })
    );
  });

  it('honors cancellation without starting another request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchServerStatus(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(native.invoke).not.toHaveBeenCalled();
  });
});
