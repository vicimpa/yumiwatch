import { confirmContinue, mergeContinueHistory, readContinueHistory, syncContinueHistory } from './continue-cache';
import { yaniFetch } from './api';
import { getSession } from './session';
import { clearHistory as clearGuestHistory, LIBRARY_EVENT, readLibrary, recordWatch as recordGuestWatch, setAnimeList as setGuestList, toggleFavorite as toggleGuestFavorite } from './storage';
import { isWatchList, WATCH_LISTS, type WatchListId } from './lists';
import type { Anime, Library, Video, WatchEntry } from './types';

export interface LibraryState extends Library { account: boolean; loading: boolean; error: string; syncedAt: number; hasMore: boolean; loadingMore: boolean }
interface RemoteAnime extends Omit<Anime, 'rating'> { rating?: number | Anime['rating']; user?: { list?: { is_fav?: boolean; list?: { id?: number } | null } } }
interface RemoteWatch extends RemoteAnime { video_id?: number; ep_title?: string; number?: string; date?: number; end_time?: number; duration?: number; data?: Video['data']; screenshot?: { sizes?: { small?: string } } }
let owner = '';
let accountState: LibraryState = emptyState();
let revision = 0;
let historyOffset = 0;
let inFlight: { token: string; promise: Promise<void> } | undefined;
const emit = () => window.dispatchEvent(new Event(LIBRARY_EVENT));
function emptyState(): LibraryState { return { favorites: [], history: [], lists: {}, account: true, loading: true, error: '', syncedAt: 0, hasMore: false, loadingMore: false }; }
function stateFor(token: string) {
  if (owner !== token) { owner = token; accountState = emptyState(); historyOffset = 0; revision++; }
  return accountState;
}
export function getLibraryState(): LibraryState {
  const session = getSession();
  const state=session?stateFor(session.token):undefined;
  return state ? {...state,history:mergeContinueHistory(readContinueHistory(),state.history)} : { ...readLibrary(), account: false, loading: false, error: '', syncedAt: 0, hasMore: false, loadingMore: false };
}
export function resetAccountLibrary() { owner = ''; accountState = emptyState(); historyOffset = 0; revision++; emit(); }
export function normalizeAnime(value: RemoteAnime): Anime {
  return { ...value, rating: typeof value.rating === 'number' ? { average: value.rating } : value.rating };
}
export function normalizeHistory(values: RemoteWatch[]): WatchEntry[] {
  const result = new Map<number, WatchEntry>();
  for (const value of [...values].sort((a, b) => (b.date || 0) - (a.date || 0))) {
    if (!value?.anime_id || !value.title || result.has(value.anime_id)) continue;
    result.set(value.anime_id, { anime: normalizeAnime(value), episode: String(value.ep_title || value.number || ''), group: value.data ? JSON.stringify([value.data.player_id, value.data.player, value.data.dubbing]) : '', videoId: value.video_id || 0, updatedAt: (value.date || 0) * 1000, position: Math.max(0, value.end_time || 0), duration: value.duration || 0, preview: value.screenshot?.sizes?.small });
  }
  return [...result.values()];
}
export function syncLibrary(): Promise<void> {
  const session = getSession();
  if (!session?.verified) return Promise.resolve();
  if (inFlight?.token === session.token) return inFlight.promise;
  const token = session.token;
  const state = stateFor(token);
  state.loading = true; state.error = ''; emit();
  const capturedRevision = revision;
  const promise = (async () => {
    try {
      const [animes, history] = await Promise.all([
        yaniFetch<RemoteAnime[]>(`/users/${session.user.id}/lists`, { token }),
        yaniFetch<RemoteWatch[]>('/video/watch-history', { token, params: { limit: 100, offset: 0 } }),
      ]);
      if (getSession()?.token !== token || owner !== token) return;
      if (!Array.isArray(animes) || !Array.isArray(history)) throw new Error('Yani вернул неожиданный формат коллекции.');
      if (revision === capturedRevision) {
        accountState = { favorites: animes.filter(value => value.user?.list?.is_fav).map(normalizeAnime), lists: Object.fromEntries(WATCH_LISTS.map(({ id }) => [id, animes.filter(value => value.user?.list?.list?.id === id).map(normalizeAnime)])), history: normalizeHistory(history), account: true, loading: false, error: '', syncedAt: Date.now(), hasMore: history.length === 100, loadingMore: false };
        accountState.history=syncContinueHistory(accountState.history,token);
        historyOffset = history.length;
      }
    } catch (error) {
      if (getSession()?.token === token && owner === token) accountState.error = (error as Error).message;
    } finally {
      if (owner === token && getSession()?.token === token) { accountState.loading = false; emit(); }
      if (inFlight?.token === token) inFlight = undefined;
      if (owner === token && getSession()?.token === token && capturedRevision !== revision) queueMicrotask(() => void syncLibrary());
    }
  })();
  inFlight = { token, promise };
  return promise;
}
export async function loadMoreHistory() {
  const session = getSession();
  if (!session?.verified) return;
  const state = stateFor(session.token);
  if (state.loadingMore || !state.hasMore) return;
  state.loadingMore = true; state.error = ''; emit();
  try {
    const values = await yaniFetch<RemoteWatch[]>('/video/watch-history', { token: session.token, params: { limit: 100, offset: historyOffset } });
    if (getSession()?.token !== session.token || owner !== session.token) return;
    if (!Array.isArray(values)) throw new Error('Не удалось прочитать историю Yani.');
    const entries = normalizeHistory(values);
    const ids = new Set(accountState.history.map(entry => entry.anime.anime_id));
    accountState.history.push(...entries.filter(entry => !ids.has(entry.anime.anime_id)));
    accountState.history=syncContinueHistory(accountState.history,session.token);
    historyOffset += values.length; accountState.hasMore = values.length === 100;
  } catch (error) { if (owner === session.token) accountState.error = (error as Error).message; }
  finally { if (owner === session.token) { accountState.loadingMore = false; emit(); } }
}
const favoritePending = new Set<string>();
export async function toggleFavorite(anime: Anime) {
  const session = getSession();
  if (!session) return toggleGuestFavorite(anime);
  if (!session.verified) throw new Error('Дождись проверки аккаунта или повтори вход.');
  const state = stateFor(session.token);
  if (!state.syncedAt) throw new Error('Сначала обнови коллекцию аккаунта.');
  const key = `${session.token}:${anime.anime_id}`;
  if (favoritePending.has(key)) throw new Error('Изменение уже сохраняется.');
  const exists = state.favorites.some(value => value.anime_id === anime.anime_id);
  favoritePending.add(key);
  try {
    const success = await yaniFetch<boolean>(`/anime/${anime.anime_id}/list/fav`, { token: session.token, method: exists ? 'DELETE' : 'PUT', ...(!exists ? { body: { date: Math.floor(Date.now() / 1000) } } : {}) });
    if (success !== true) throw new Error('Yani не подтвердил изменение избранного.');
    if (getSession()?.token !== session.token || owner !== session.token) return !exists;
    revision++;
    accountState.favorites = exists ? accountState.favorites.filter(value => value.anime_id !== anime.anime_id) : [anime, ...accountState.favorites];
    emit(); return !exists;
  } finally { favoritePending.delete(key); }
}
const watchQueues = new Map<string, Promise<void>>();
export async function recordWatch(anime: Anime, video: Video, group: string, position?: number, duration?: number, expectedToken: string | null = getSession()?.token || null) {
  const session = getSession();
  // A player belonging to a previous session must never write to the new account.
  if ((session?.token || null) !== expectedToken) return;
  if (!session) { recordGuestWatch(anime, video, group, position, duration); return; }
  if (!session.verified) throw new Error('Войди снова, чтобы сохранить просмотр в Yani.');
  const state = stateFor(session.token);
  const previous = state.history.find(entry => entry.anime.anime_id === anime.anime_id);
  const same = previous?.videoId === video.video_id || (!previous?.videoId && previous?.episode === video.number);
  const time = Math.floor(Math.max(0, position ?? video.watched?.end_time ?? (same ? previous?.position : 0) ?? 0));
  const length = Math.floor(Math.max(0, duration ?? video.duration ?? (same ? previous?.duration : 0) ?? 0));
  const recordedAt=Date.now();
  const queueKey = `${session.token}:${anime.anime_id}`;
  const previousWrite = watchQueues.get(queueKey) || Promise.resolve();
  const write = previousWrite.catch(() => {}).then(async () => {
    if (getSession()?.token !== session.token) return;
    const success = await yaniFetch<boolean>(`/video/${video.video_id}`, { token: session.token, method: 'PUT', body: { time, duration: length, date: Math.floor(Date.now() / 1000) }, keepalive: true });
    if (success !== true) throw new Error('Yani не подтвердил сохранение просмотра.');
    if (getSession()?.token !== session.token || owner !== session.token) return;
    revision++;
    accountState.history = [{ anime, videoId: video.video_id, episode: video.number, group, updatedAt: recordedAt, position: time, duration: length, preview: anime.random_screenshots?.find(frame => frame.episode === video.number)?.sizes.small }, ...accountState.history.filter(entry => entry.anime.anime_id !== anime.anime_id)];
    confirmContinue(accountState.history[0],session.token);
    emit();
  });
  watchQueues.set(queueKey, write);
  try { await write; } finally { if (watchQueues.get(queueKey) === write) watchQueues.delete(queueKey); }
}
export function clearHistory() {
  if (getSession()) throw new Error('Историю аккаунта можно управлять на YummyAnime.');
  clearGuestHistory();
}

const listPending = new Set<string>();
export async function setAnimeList(anime: Anime, selected: WatchListId | null) {
  if (selected !== null && !isWatchList(selected)) throw new Error('Неизвестный список.');
  const session = getSession();
  if (!session) { setGuestList(anime, selected); return; }
  if (!session.verified) throw new Error('Дождись проверки аккаунта или повтори вход.');
  const state = stateFor(session.token);
  if (!state.syncedAt) throw new Error('Сначала обнови коллекцию аккаунта.');
  const key = `${session.token}:${anime.anime_id}`;
  if (listPending.has(key)) throw new Error('Изменение списка уже сохраняется.');
  listPending.add(key);
  try {
    const result = await yaniFetch<boolean | { success: boolean; list?: { id: number } }>(`/anime/${anime.anime_id}/list`, { token: session.token, method: selected === null ? 'DELETE' : 'PUT', ...(selected !== null ? { body: { list: selected, date: Math.floor(Date.now() / 1000) } } : {}) });
    if (selected === null ? result !== true && !(typeof result === 'object' && result?.success) : typeof result !== 'object' || !result?.success || result.list?.id !== selected) throw new Error('Yani не подтвердил изменение списка.');
    if (getSession()?.token !== session.token || owner !== session.token) return;
    revision++;
    const lists = Object.fromEntries(WATCH_LISTS.map(({ id }) => [id, (accountState.lists?.[id] || []).filter(value => value.anime_id !== anime.anime_id)])) as NonNullable<Library['lists']>;
    if (selected !== null) lists[selected]!.unshift(anime);
    accountState.lists = lists;
    emit();
  } finally { listPending.delete(key); }
}
