import { readJSON, writeJSON, TOKEN_KEY } from './storage';
import type { Anime, Params, Result, Video } from './types';
import { clearSession, getSession } from './session';

export const API_URL = 'https://api.yani.tv';
const CACHE_KEY = 'yumiwatch:api:v1';
type Cache = Record<string, { data: unknown; savedAt: number }>;
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: number) { super(message); }
}
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_YANI_APPLICATION_TOKEN || ''; } catch { return import.meta.env.VITE_YANI_APPLICATION_TOKEN || ''; }
}
export function makeQuery(params: Params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return query.toString();
}
export async function yaniFetch<T>(path: string, options: { params?: Params; method?: string; body?: unknown; token?: string; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  const { params = {}, method = 'GET', body, token: accountToken, signal, keepalive } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const applicationToken = getToken();
    const response = await fetch(`${API_URL}${path}?${makeQuery(params)}`, {
      method, credentials: 'omit', cache: 'no-store', keepalive,
      headers: { Accept: 'application/json,image/avif,image/webp', Lang: 'ru', ...(applicationToken ? { 'X-Application': applicationToken } : {}), ...(accountToken ? { Authorization: `Yummy ${accountToken}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      if (response.status === 401 && accountToken) clearSession(accountToken);
      const message = response.status === 420 || payload?.error_code === 5 ? 'Для входа нужно пройти капчу.'
        : path === '/profile/login' && (response.status === 401 || response.status === 403) ? 'Не удалось войти. Проверь почту и пароль.'
        : response.status === 401 && accountToken ? 'Сессия истекла. Войди в аккаунт снова.'
        : response.status === 403 && accountToken ? 'Yani не разрешил это действие для аккаунта.'
        : response.status === 401 || response.status === 403 ? 'API просит токен приложения. Добавь его в настройках.'
        : response.status === 404 ? 'Это аниме не найдено.'
        : response.status === 429 ? 'Слишком много запросов. Попробуй чуть позже.' : 'Сервис Yani временно недоступен. Попробуй ещё раз.';
      throw new ApiError(message, response.status, payload?.error_code);
    }
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'response')) throw new ApiError('API вернул неожиданный ответ.', 502);
    return payload.response as T;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ApiError) throw error;
    throw new Error('Нет связи с Yani. Проверь интернет и попробуй снова.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
export async function request<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<Result<T>> {
  const key = `${path}?${makeQuery(params)}`;
  const cached = readJSON<Cache>(CACHE_KEY, {})[key];
  try {
    const data = await yaniFetch<T>(path, { params, signal });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const entry = { data, savedAt: Date.now() };
    const cache = readJSON<Cache>(CACHE_KEY, {});
    cache[key] = entry;
    const entries = Object.entries(cache).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 35);
    writeJSON(CACHE_KEY, Object.fromEntries(entries));
    return { ...entry, cached: false };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (cached && !(error instanceof ApiError && [401, 403, 404].includes(error.status))) return { data: cached.data as T, savedAt: cached.savedAt, cached: true };
    if (error instanceof ApiError) {
      if ([401, 403, 404].includes(error.status)) { const cache = readJSON<Cache>(CACHE_KEY, {}); delete cache[key]; writeJSON(CACHE_KEY, cache); }
      throw error;
    }
    throw new Error('Нет связи с Yani. Проверь интернет и попробуй снова.');
  }
}
export function cachedRequest<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<Result<T>> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const cached = readJSON<Cache>(CACHE_KEY, {})[`${path}?${makeQuery(params)}`];
  const revalidate = request<T>(path, params, signal);
  if (!cached) return revalidate;
  // Consumers can use the saved result immediately and observe the fresh result.
  // Attach a rejection handler even when a one-shot consumer ignores revalidation.
  void revalidate.catch(() => {});
  return Promise.resolve({ data: cached.data as T, cached: true, savedAt: cached.savedAt, revalidate });
}
export const animeList = async (params: Params, signal?: AbortSignal): Promise<Result<Anime[]>> => {
  const query = { limit: 24, require_fields: 'genres,ep_count,description', ...params };
  if (params.exclude_list) {
    const session = getSession();
    if (!session?.verified) throw new ApiError('Войди в аккаунт, чтобы фильтровать по своим спискам.', 401);
    return { data: await yaniFetch<Anime[]>('/anime', { params: query, signal, token: session.token }), cached: false, savedAt: Date.now() };
  }
  return cachedRequest<Anime[]>('/anime', query, signal);
};
export const animeDetail = (id: string | number, signal?: AbortSignal) => request<Anime>(`/anime/${encodeURIComponent(id)}`, {}, signal);
export const animeVideos = async (id: number, signal?: AbortSignal): Promise<Result<Video[]>> => {
  const session = getSession();
  if (!session?.verified) return request<Video[]>(`/anime/${id}/videos`, {}, signal);
  const data = await yaniFetch<Video[]>(`/anime/${id}/videos`, { token: session.token, signal });
  return { data, cached: false, savedAt: Date.now() };
};
export const animeSchedule = (signal?: AbortSignal) => request<Anime[]>('/anime/schedule', {}, signal);
export function imageUrl(url?: string) {
  if (!url) return '';
  try {
    const normalized = new URL(url, 'https://static.yani.tv');
    return normalized.protocol === 'https:' ? normalized.href : '';
  } catch { return ''; }
}
export function plainText(html = '') {
  return html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
