// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { animeDetail, peekAnimeDetail, peekAnimeRatings, cachePersonalRating } from '~/lib/api';
import { putCache } from '~/lib/cache-store';
import {
  getLibraryState,
  resetAccountLibrary,
  setPersonalRating,
  syncLibrary,
} from '~/lib/library';
import { libraryAnimes } from '~/lib/profile';
import { peekProfileData, profileData } from '~/lib/profile-cache';
import { clearSession, saveSession } from '~/lib/session';
import { readLibrary, setAnimeList, toggleFavorite } from '~/lib/storage';
import { anime } from './fixtures';
const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const user = (id = 42) =>
  saveSession({
    token: `ratings-${id}`,
    user: { id, nickname: 'Viewer' },
    verified: true,
    remember: false,
    refreshedAt: Date.now(),
  });
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

it('validates rating values before touching storage or sending a request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const value of [0, 11, -1, 1.5, NaN])
    await expect(setPersonalRating(anime, value)).rejects.toThrow('от 1 до 10');
  expect(readLibrary().rated).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps guest scores in all copies and includes rated-only titles in the personal top', async () => {
  setAnimeList(anime, 2);
  toggleFavorite(anime);
  await setPersonalRating(anime, 8);
  await setPersonalRating({ ...anime, anime_id: 2, title: 'Только оценка' }, 10);
  const library = readLibrary();
  expect(library.lists?.[2]?.[0].user?.rating).toBe(8);
  expect(library.favorites[0].user?.rating).toBe(8);
  expect(libraryAnimes(library).map(value => [value.anime_id, value.user?.rating])).toEqual([
    [anime.anime_id, 8],
    [2, 10],
  ]);
  await setPersonalRating(anime, null);
  expect(readLibrary().favorites[0].user?.rating).toBe(0);
  expect(libraryAnimes(readLibrary())).toHaveLength(2);
});

it('includes remote rated-only titles when synchronizing the account collection', async () => {
  user();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string) =>
      reply(
        raw.includes('/lists')
          ? [
              { ...anime, user: { rating: 8, list: { is_fav: true, list: { id: 2 } } } },
              {
                ...anime,
                anime_id: 2,
                title: 'Только оценка',
                user: { rating: 10, list: { list: null } },
              },
            ]
          : []
      )
    )
  );
  await syncLibrary();
  const values = libraryAnimes(getLibraryState());
  expect(values).toHaveLength(2);
  expect(getLibraryState().rated).toHaveLength(2);
  expect(values.find(value => value.anime_id === anime.anime_id)?.user).toMatchObject({
    rating: 8,
    list: { is_fav: true, list: { id: 2 } },
  });
});

it('applies a confirmed rating to the current state when synchronization finishes first', async () => {
  user();
  let finishLists!: (value: Response) => void;
  let finishRating!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn((raw: string, options: RequestInit) => {
      if (options.method === 'PUT')
        return new Promise<Response>(resolve => {
          finishRating = resolve;
        });
      if (raw.includes('/lists'))
        return new Promise<Response>(resolve => {
          finishLists = resolve;
        });
      return Promise.resolve(reply([]));
    })
  );
  const syncing = syncLibrary();
  const saving = setPersonalRating({ ...anime, user: { rating: 6 } }, 9);
  finishLists(
    reply([
      {
        ...anime,
        user: { rating: 6, list: { is_fav: true, list: { id: 2 } } },
      },
    ])
  );
  await syncing;
  finishRating(reply({ rating: 8.9, votes: 123 }));
  await saving;
  const state = getLibraryState();
  expect(state.rated?.[0].user?.rating).toBe(9);
  expect(state.favorites[0].user?.rating).toBe(9);
  expect(state.lists?.[2]?.[0].user?.rating).toBe(9);
});

it('invalidates only the confirmed account’s cached rating statistics', async () => {
  user(142);
  await profileData('ratings:142', async () => [{ rating: 6, count: 1 }]);
  expect(peekProfileData('ratings:142')).toBeDefined();
  user(143);
  await profileData('ratings:143', async () => [{ rating: 8, count: 1 }]);
  user(142);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ rating: 8.9, votes: 123 }))
  );
  await setPersonalRating(anime, 9);
  expect(peekProfileData('ratings:142')).toBeUndefined();
  user(143);
  expect(peekProfileData('ratings:143')).toBeDefined();
});

it('loads account-specific details without exposing personal ratings to another account or the guest', async () => {
  user();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ ...anime, user: { rating: 7 } }))
  );
  await animeDetail(anime.anime_id);
  expect(peekAnimeDetail(anime.anime_id)?.data.user?.rating).toBe(7);
  user(43);
  expect(peekAnimeDetail(anime.anime_id)).toBeUndefined();
  clearSession();
  expect(peekAnimeDetail(anime.anime_id)).toBeUndefined();
});

it('updates the private detail cache and public summary without leaking the personal vote', async () => {
  putCache('data', `/anime/${anime.anime_id}?`, anime);
  putCache('data', `/anime/${anime.anime_id}/rates?`, [{ rating: 9, count: 1 }]);
  user();
  cachePersonalRating(anime, 9, { rating: 8.5, votes: 2 });
  expect(peekAnimeDetail(anime.anime_id)?.data.user?.rating).toBe(9);
  expect(peekAnimeRatings(anime.anime_id)).toBeUndefined();
  clearSession();
  expect(peekAnimeDetail(anime.anime_id)?.data).toMatchObject({
    rating: { average: 8.5, counters: 2 },
  });
  expect(peekAnimeDetail(anime.anime_id)?.data.user?.rating).toBeUndefined();
});

it('rejects a stale account response without updating the new account or guest storage', async () => {
  user();
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
  );
  const pending = setPersonalRating(anime, 8);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  user(43);
  finish(reply({ rating: 9, votes: 3 }));
  await rejected;
  expect(getLibraryState().rated).toEqual([]);
  expect(readLibrary().rated).toBeUndefined();
});

it('does not let an older detail refresh overwrite a newly confirmed personal rating in cache', async () => {
  user();
  cachePersonalRating(anime, 7, { rating: 8, votes: 10 });
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn((_: string, options: RequestInit) =>
      options.method === 'PUT'
        ? Promise.resolve(reply({ rating: 8.1, votes: 10 }))
        : new Promise<Response>(resolve => {
            finish = resolve;
          })
    )
  );
  const cached = await animeDetail(anime.anime_id);
  expect(cached.data.user?.rating).toBe(7);
  await setPersonalRating(anime, 9);
  finish(reply({ ...anime, user: { rating: 7 } }));
  await cached.revalidate;
  expect(peekAnimeDetail(anime.anime_id)?.data.user?.rating).toBe(9);
});
