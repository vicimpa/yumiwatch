// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, saveSession } from '~/lib/session';
import {
  getLibraryState,
  normalizeHistory,
  recordWatch,
  resetAccountLibrary,
  setAnimeList,
  syncLibrary,
  toggleFavorite,
} from '~/lib/library';
import { readLibrary, toggleFavorite as guestFavorite } from '~/lib/storage';
import { savePlaybackRecovery } from '~/lib/playback-recovery';
import { anime, video } from './fixtures';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));

function user(id = 42) {
  saveSession({
    token: `user-${id}`,
    user: { id, nickname: `Viewer ${id}` },
    remember: false,
    refreshedAt: Date.now(),
    verified: true,
  });
}

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  resetAccountLibrary();
});
afterEach(() => {
  clearSession();
  resetAccountLibrary();
  vi.unstubAllGlobals();
});
describe('account collection', () => {
  it('loads the user’s favorites and history and normalizes numeric ratings', async () => {
    user();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          reply([{ ...anime, rating: 9.2, user: { list: { is_fav: true, list: { id: 0 } } } }])
        )
        .mockResolvedValueOnce(
          reply([
            { ...anime, ep_title: '12', end_time: 180, duration: 1400, date: 100, video_id: 1012 },
          ])
        )
    );
    await syncLibrary();
    expect(getLibraryState()).toMatchObject({
      account: true,
      loading: false,
      error: '',
      favorites: [{ rating: { average: 9.2 } }],
      history: [{ episode: '12', videoId: 1012, position: 180, updatedAt: 100000 }],
    });
    expect(localStorage.getItem('yumiwatch:api:v1')).toBeNull();
  });
  it('restores Continue Watching from an account-scoped cache before synchronization and keeps other accounts and the guest separate', async () => {
    user();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply([]))
        .mockResolvedValueOnce(
          reply([
            {
              ...anime,
              video_id: 1001,
              ep_title: '1',
              end_time: 123,
              date: 100,
              private_field: 'private-value',
              videos: [{ url: 'private-stream' }],
            },
          ])
        )
    );
    await syncLibrary();
    resetAccountLibrary();
    expect(getLibraryState()).toMatchObject({ loading: true, history: [{ position: 123 }] });

    const saved = localStorage.getItem('yumiwatch:continue:v1:account:42')!;

    expect(saved).not.toContain('private-value');
    expect(saved).not.toContain('private-stream');
    expect(saved).not.toContain('user-42');
    user(43);
    expect(getLibraryState().history).toEqual([]);
    clearSession();
    expect(getLibraryState().history).toEqual([]);
    user();
    expect(getLibraryState().history[0].position).toBe(123);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(reply([])))
    );
    await syncLibrary();
    expect(getLibraryState().history).toEqual([]);
  });
  it('keeps unsynchronized local progress ahead of an older server snapshot and confirms it only after a successful write', async () => {
    user();

    const entry = {
      anime,
      videoId: 1001,
      episode: '1',
      group: 'group',
      position: 321,
      duration: 1400,
      updatedAt: Date.now(),
      playing: true,
    };

    savePlaybackRecovery(entry, 'user-42');
    resetAccountLibrary();
    expect(getLibraryState().history[0]).toMatchObject({ position: 321, playing: true });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply([]))
        .mockResolvedValueOnce(
          reply([{ ...anime, video_id: 1001, ep_title: '1', end_time: 10, date: 100 }])
        )
        .mockImplementation(() => Promise.resolve(reply(true)))
    );
    await syncLibrary();
    expect(getLibraryState().history[0].position).toBe(321);
    await recordWatch(anime, video('1'), 'group', 321, 1400);
    expect(JSON.parse(localStorage.getItem('yumiwatch:continue:v1:account:42')!)[0].pending).toBe(
      false
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(reply([])))
    );
    await syncLibrary();
    expect(getLibraryState().history).toEqual([]);
  });
  it('updates favorites remotely, preserving the guest collection', async () => {
    guestFavorite({ ...anime, anime_id: 999 });
    user();

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply([]))
      .mockImplementation(() => Promise.resolve(reply(true)));

    vi.stubGlobal('fetch', fetcher);
    await syncLibrary();
    expect(await toggleFavorite(anime)).toBe(true);
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      method: 'PUT',
      headers: { Authorization: 'Yummy user-42' },
    });
    expect(getLibraryState().favorites[0].anime_id).toBe(anime.anime_id);
    expect(await toggleFavorite(anime)).toBe(false);
    expect(fetcher.mock.calls[3][1].method).toBe('DELETE');
    clearSession();
    expect(readLibrary().favorites.map(a => a.anime_id)).toEqual([999]);
  });
  it('does not show a favorite as saved when the API rejects the mutation', async () => {
    user();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply([]))
        .mockResolvedValueOnce(reply([]))
        .mockResolvedValue(new Response(JSON.stringify({ error: 'permission' }), { status: 403 }))
    );
    await syncLibrary();
    await expect(toggleFavorite(anime)).rejects.toThrow();
    expect(getLibraryState().favorites).toEqual([]);
  });
  it('records a view through the authenticated API without resetting known progress', async () => {
    user();

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(
        reply([
          { ...anime, video_id: video('2').video_id, ep_title: '2', end_time: 120, date: 100 },
        ])
      )
      .mockImplementation(() => Promise.resolve(reply(true)));

    vi.stubGlobal('fetch', fetcher);
    await syncLibrary();
    await recordWatch(anime, video('2'), 'group');
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ time: 120 });
    await recordWatch(anime, video('2'), 'group', 220, 1400);
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toMatchObject({ time: 220, duration: 1400 });
    expect(getLibraryState().history[0].position).toBe(220);
  });
  it('ignores late responses and player writes from a previous account', async () => {
    user(1);

    let resolveFavorite!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => {
      resolveFavorite = resolve;
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockImplementation(() => Promise.resolve(reply([])));

    vi.stubGlobal('fetch', fetcher);

    const oldSync = syncLibrary();

    user(2);
    resolveFavorite(reply([anime]));
    await oldSync;
    expect(getLibraryState().favorites).toEqual([]);

    const calls = fetcher.mock.calls.length;

    await recordWatch(anime, video('1'), 'old group', 10, 100, 'user-1');
    expect(fetcher.mock.calls.length).toBe(calls);
  });
  it('serializes view writes so a slow old episode cannot replace a newer one', async () => {
    user();

    const fetcher = vi.fn().mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([]));

    vi.stubGlobal('fetch', fetcher);
    await syncLibrary();

    let finish!: (value: Response) => void;

    fetcher
      .mockReturnValueOnce(
        new Promise<Response>(resolve => {
          finish = resolve;
        })
      )
      .mockImplementation(() => Promise.resolve(reply(true)));

    const first = recordWatch(anime, video('1'), 'group');
    const second = recordWatch(anime, video('2'), 'group');

    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher.mock.calls).toHaveLength(3);
    finish(reply(true));
    await Promise.all([first, second]);
    expect(getLibraryState().history[0].episode).toBe('2');
    expect(fetcher.mock.calls[3][0]).toContain(`/video/${video('2').video_id}`);
  });
  it('loads all statuses and moves one anime only after a confirmed server write', async () => {
    user();

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        reply([{ ...anime, user: { list: { is_fav: true, list: { id: 0 } } } }])
      )
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply({ success: true, list: { id: 1 } }))
      .mockResolvedValueOnce(reply(true));

    vi.stubGlobal('fetch', fetcher);
    await syncLibrary();
    expect(fetcher.mock.calls[0][0]).toContain('/users/42/lists?');
    expect(getLibraryState().lists?.[0]).toHaveLength(1);
    await setAnimeList(anime, 1);
    expect(getLibraryState().lists?.[0]).toEqual([]);
    expect(getLibraryState().lists?.[1]).toHaveLength(1);
    expect(getLibraryState().favorites).toHaveLength(1);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).list).toBe(1);
    await setAnimeList(anime, null);
    expect(fetcher.mock.calls[3][1].method).toBe('DELETE');
    expect(getLibraryState().lists?.[1]).toEqual([]);
    expect(getLibraryState().favorites).toHaveLength(1);
    expect(localStorage.getItem('yumiwatch:api:v1')).toBeNull();
  });
  it('keeps a status unchanged when the server rejects it', async () => {
    user();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          reply([{ ...anime, user: { list: { is_fav: false, list: { id: 0 } } } }])
        )
        .mockResolvedValueOnce(reply([]))
        .mockResolvedValue(reply({ success: false }))
    );
    await syncLibrary();
    await expect(setAnimeList(anime, 2)).rejects.toThrow('не подтвердил');
    expect(getLibraryState().lists?.[0]).toHaveLength(1);
    expect(getLibraryState().lists?.[2]).toEqual([]);
  });
  it('groups history by anime and keeps the latest episode', () => {
    const result = normalizeHistory([
      { ...anime, date: 1, ep_title: '1' },
      { ...anime, date: 2, ep_title: '2' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].episode).toBe('2');
    expect(result[0].videoId).toBe(0);
  });
});
