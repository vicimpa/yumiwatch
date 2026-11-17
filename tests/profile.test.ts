// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarDays,
  fetchProfile,
  fetchProfileList,
  formatWatchTime,
  libraryAnimes,
  updateProfile,
} from '~/lib/profile';
import { clearSession, saveSession } from '~/lib/session';
import { anime } from './fixtures';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const signIn = (token = 'profile-test', verified = true) =>
  saveSession({
    token,
    user: { id: 42, nickname: 'Viewer' },
    remember: false,
    refreshedAt: Date.now(),
    verified,
  });
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('profiles', () => {
  it('combines public watch statistics with the owner’s private visibility settings without persisting either', async () => {
    signIn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ id: 42, nickname: 'Viewer', watches: { sum: [] } }))
      .mockResolvedValueOnce(
        reply({ id: 42, nickname: 'Viewer', about: 'About me', lists_privacy: 'none' })
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchProfile(42)).toMatchObject({
      watches: { sum: [] },
      about: 'About me',
      lists_privacy: 'none',
    });
    expect(fetcher.mock.calls[0][0]).toContain('/users/id42?need_counts=true');
    expect(fetcher.mock.calls[1][0]).toContain('/profile?');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Yummy profile-test');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem('yumiwatch:session:v1')).not.toContain('About me');
  });

  it('opens another profile without requesting the signed-in user’s private profile', async () => {
    signIn();
    const fetcher = vi.fn().mockResolvedValue(reply({ id: 8, nickname: 'Friend' }));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchProfile(8)).nickname).toBe('Friend');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched identities and malformed lists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(reply({ id: 9, nickname: 'Wrong' })))
    );
    await expect(fetchProfile(8)).rejects.toThrow('профиль');
    await expect(fetchProfileList(8)).rejects.toThrow('списки');
  });

  it('keeps personal ratings and status when normalizing remote anime ratings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply([
          {
            ...anime,
            rating: 9.2,
            date: 123,
            user: { rating: 8, list: { is_fav: true, list: { id: 2 } } },
          },
        ])
      )
    );
    const result = await fetchProfileList(8);
    expect(result[0]).toMatchObject({
      rating: { average: 9.2 },
      date: 123,
      user: { rating: 8, list: { is_fav: true, list: { id: 2 } } },
    });
  });

  it('merges favorites and statuses without counting the same anime twice or dropping personal ratings', () => {
    const result = libraryAnimes({
      favorites: [anime],
      history: [],
      lists: { 2: [{ ...anime, user: { rating: 8 } } as typeof anime] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].user).toMatchObject({ rating: 8, list: { is_fav: true, list: { id: 2 } } });
  });

  it('only updates the supported profile fields after verification and requires server acknowledgement', async () => {
    signIn('profile-test', false);
    const fetcher = vi.fn().mockResolvedValue(reply(true));
    vi.stubGlobal('fetch', fetcher);
    await expect(updateProfile('About', 'friends')).rejects.toThrow('проверки');
    expect(fetcher).not.toHaveBeenCalled();
    signIn();
    await updateProfile('  About  ', 'friends');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ about: 'About', lists_privacy: 'friends' }),
    });
    fetcher.mockResolvedValue(reply(false));
    await expect(updateProfile('About', 'none')).rejects.toThrow('не подтвердил');
  });

  it('does not report a save into a different session as successful', async () => {
    signIn();
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>(r => {
            resolve = r;
          })
      )
    );
    const pending = updateProfile('About', 'none');
    signIn('different-user');
    resolve(reply(true));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('watch calendar', () => {
  it('uses UTC days across timezones and fills missing days without carrying over another date’s activity', () => {
    const when = Date.UTC(2026, 10, 16) / 1000;
    const result = calendarDays(
      [{ when, duration: 3600, ep_count: 3 }],
      3,
      new Date('2026-11-18T01:30:00+03:00')
    );
    expect(result.map(day => day.when)).toEqual([when - 86400, when, when + 86400]);
    expect(result.map(day => day.ep_count)).toEqual([0, 3, 0]);
  });
  it.each([
    [0, '0 мин'],
    [20, '< 1 мин'],
    [1800, '30 мин'],
    [5400, '1 ч'],
    [NaN, '0 мин'],
  ])('formats %s seconds without inventing watched episodes', (seconds, expected) => {
    expect(formatWatchTime(seconds as number)).toBe(expected);
  });
});
