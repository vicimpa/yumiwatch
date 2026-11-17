import { ApiError, yummyFetch } from './api';
import { normalizeAnime } from './library';
import { WATCH_LISTS } from './lists';
import { getSession } from './session';
import { peekProfileData, profileData } from './profile-cache';
import type { Anime, Library } from './types';

export type ListPrivacy = 'public' | 'friends' | 'authed' | 'none';
export const LIST_PRIVACY: Record<ListPrivacy, string> = {
  public: 'Все пользователи',
  friends: 'Только друзья',
  authed: 'Только вошедшие в аккаунт',
  none: 'Только я',
};

export interface WatchDay {
  when: number;
  ep_count: number;
  duration: number;
}

export interface UserProfile {
  id: number;
  nickname: string;
  about?: string;
  avatars?: { small?: string; big?: string; full?: string };
  banner?: { full?: string; cropped?: string };
  register_date?: number;
  last_online?: number;
  days_online?: number;
  counts?: Partial<Record<number, number>>;
  friends?: { friends?: number };
  comments_count?: number;
  reviewsCount?: number;
  collections_count?: number;
  lists_privacy?: ListPrivacy;
  watches?: {
    sum?: { name: string; shortname: string; spent_time: number; value: number }[];
    history?: WatchDay[];
  };
}

export interface ProfileAnime extends Anime {
  date?: number;
  user?: { rating?: number; list?: { is_fav?: boolean; list?: { id?: number } | null } };
}

export interface GenreStat {
  id: number;
  title: string;
  count: number;
}

export const profileHref = (id: number) => `#/users/id${id}`;

const profileFields = (profile: UserProfile): UserProfile => ({
  id: profile.id,
  nickname: profile.nickname,
  about: profile.about,
  avatars: profile.avatars,
  banner: profile.banner,
  register_date: profile.register_date,
  last_online: profile.last_online,
  days_online: profile.days_online,
  counts: profile.counts,
  friends: profile.friends,
  comments_count: profile.comments_count,
  reviewsCount: profile.reviewsCount,
  collections_count: profile.collections_count,
  lists_privacy: profile.lists_privacy,
  watches: profile.watches,
});
export const loadProfile = (id: number, signal?: AbortSignal) =>
  profileData(`user:${id}`, async () => profileFields(await fetchProfile(id, signal)), signal);
export const peekProfile = (id: number) => peekProfileData<UserProfile>(`user:${id}`);
export const loadProfileList = (id: number, signal?: AbortSignal) =>
  profileData(`lists:${id}`, () => fetchProfileList(id, signal), signal);
export const peekProfileList = (id: number) => peekProfileData<ProfileAnime[]>(`lists:${id}`);
export const loadProfileFriends = (id: number, offset: number, signal?: AbortSignal) =>
  profileData(`friends:${id}:${offset}`, () => fetchFriends(id, offset, signal), signal);
export const peekProfileFriends = (id: number, offset: number) =>
  peekProfileData<UserProfile[]>(`friends:${id}:${offset}`);
export const loadGenreStats = (id: number, signal?: AbortSignal) =>
  profileData(`genres:${id}`, () => fetchGenreStats(id, signal), signal);
export const peekGenreStats = (id: number) => peekProfileData<GenreStat[]>(`genres:${id}`);

export async function fetchProfile(id: number, signal?: AbortSignal) {
  const session = getSession();
  const token = session?.verified ? session.token : undefined;
  const profile = await yummyFetch<UserProfile>(`/users/id${id}`, {
    params: { need_counts: true },
    token,
    signal,
  });
  if (profile?.id !== id || typeof profile.nickname !== 'string')
    throw new Error('Не удалось прочитать профиль YummyAnime.');
  // The private endpoint contains visibility settings but no watch statistics.
  if (session?.verified && session.user.id === id) {
    const own = await yummyFetch<UserProfile>('/profile', { token, signal });
    if (own?.id !== id) throw new Error('Yummy вернул другой профиль.');
    return { ...profile, about: own.about, lists_privacy: own.lists_privacy };
  }
  return profile;
}

export async function fetchProfileList(id: number, signal?: AbortSignal): Promise<ProfileAnime[]> {
  const session = getSession();
  const values = await yummyFetch<
    (Omit<ProfileAnime, 'rating'> & { rating?: number | Anime['rating'] })[]
  >(`/users/${id}/lists`, { token: session?.verified ? session.token : undefined, signal });
  if (!Array.isArray(values)) throw new Error('Не удалось прочитать списки профиля.');
  return values
    .filter(value => value?.anime_id && typeof value.title === 'string')
    .map(value => ({ ...normalizeAnime(value), date: value.date, user: value.user }));
}

export async function fetchGenreStats(id: number, signal?: AbortSignal) {
  const session = getSession();
  const values = await yummyFetch<GenreStat[]>(`/users/${id}/stats/genres`, {
    token: session?.verified ? session.token : undefined,
    signal,
  });
  if (!Array.isArray(values)) throw new Error('Не удалось прочитать статистику жанров.');
  return values
    .filter(value => typeof value.title === 'string' && value.count > 0)
    .sort((a, b) => b.count - a.count);
}

export async function updateProfile(
  about: string,
  lists_privacy: ListPrivacy,
  signal?: AbortSignal
) {
  const session = getSession();
  if (!session?.verified) throw new Error('Дождись проверки аккаунта или войди снова.');
  const result = await yummyFetch<boolean>('/profile', {
    token: session.token,
    method: 'PATCH',
    body: { about: about.trim(), lists_privacy },
    signal,
  });
  if (getSession()?.token !== session.token)
    throw new DOMException('Сессия изменилась.', 'AbortError');
  if (result !== true) throw new Error('Yummy не подтвердил сохранение профиля.');
}

export async function fetchFriends(id: number, offset: number, signal?: AbortSignal) {
  const session = getSession();
  const values = await yummyFetch<UserProfile[]>(`/users/${id}/friends`, {
    params: { limit: 100, offset },
    token: session?.verified ? session.token : undefined,
    signal,
  });
  if (!Array.isArray(values)) throw new Error('Не удалось прочитать список друзей.');
  return values.filter(value => Number.isInteger(value?.id) && typeof value.nickname === 'string');
}

export function profileError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Такой профиль не найден.';
    if ([401, 403].includes(error.status))
      return 'Владелец ограничил доступ к этим данным. Возможно, нужен вход в аккаунт.';
  }
  return error instanceof Error ? error.message : 'Не удалось загрузить данные профиля.';
}

export function profileRequestError(error: unknown): Error {
  return error instanceof ApiError
    ? new ApiError(profileError(error), error.status, error.code)
    : new Error(profileError(error));
}

export function libraryAnimes(library: Library): ProfileAnime[] {
  const values = new Map<number, ProfileAnime>();
  for (const list of WATCH_LISTS)
    for (const value of library.lists?.[list.id] || []) {
      const anime = value as ProfileAnime;
      values.set(anime.anime_id, {
        ...anime,
        user: { ...anime.user, list: { ...anime.user?.list, list: { id: list.id } } },
      });
    }
  for (const anime of library.favorites) {
    const saved: ProfileAnime = values.get(anime.anime_id) || anime;
    values.set(anime.anime_id, {
      ...saved,
      user: { ...saved.user, list: { ...saved.user?.list, is_fav: true } },
    });
  }
  return [...values.values()];
}

export function localGenres(values: ProfileAnime[]): GenreStat[] {
  const stats = new Map<number, GenreStat>();
  for (const anime of values.filter(value => [0, 2].includes(value.user?.list?.list?.id ?? -1)))
    for (const genre of anime.genres || []) {
      const previous = stats.get(genre.id);
      stats.set(genre.id, { id: genre.id, title: genre.title, count: (previous?.count || 0) + 1 });
    }
  return [...stats.values()].sort((a, b) => b.count - a.count);
}

export function calendarDays(history: WatchDay[], days: number, now = new Date()) {
  // The API buckets activity by UTC midnight. Use that same boundary everywhere.
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const byDay = new Map(history.map(day => [Math.floor(day.when / 86400), day]));
  return Array.from({ length: days }, (_, index) => {
    const when = end - (days - index - 1) * 86400;
    return byDay.get(Math.floor(when / 86400)) || { when, ep_count: 0, duration: 0 };
  });
}

export function formatWatchTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 мин';
  if (seconds < 60) return '< 1 мин';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600).toLocaleString('ru')} ч`;
}
