import { readJSON, writeJSON, TOKEN_KEY } from './storage';
import type { Anime, Params, Result, Video } from './types';

export const API_URL = 'https://api.yani.tv';
const CACHE_KEY = 'yumiwatch:api:v1';
type Cache = Record<string, { data: unknown; savedAt: number }>;
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_YANI_APPLICATION_TOKEN || ''; } catch { return import.meta.env.VITE_YANI_APPLICATION_TOKEN || ''; }
}
export function makeQuery(params: Params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return query.toString();
}
export async function request<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<Result<T>> {
  const key = `${path}?${makeQuery(params)}`;
  const cached = readJSON<Cache>(CACHE_KEY, {})[key];
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const token = getToken();
    const response = await fetch(`${API_URL}${key}`, {
      headers: { Accept: 'application/json,image/avif,image/webp', Lang: 'ru', ...(token ? { 'X-Application': token } : {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? 'API просит токен приложения. Добавь его в настройках.'
        : response.status === 404 ? 'Это аниме не найдено.'
        : response.status === 429 ? 'Слишком много запросов. Попробуй чуть позже.' : 'Сервис Yani временно недоступен. Попробуй ещё раз.';
      throw new ApiError(message, response.status);
    }
    const body = await response.json();
    if (body.error || body.response == null) throw new ApiError(typeof body.error?.message === 'string' ? body.error.message : 'API вернул неожиданный ответ.', 502);
    const entry = { data: body.response, savedAt: Date.now() };
    const cache = readJSON<Cache>(CACHE_KEY, {});
    cache[key] = entry;
    const entries = Object.entries(cache).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 35);
    writeJSON(CACHE_KEY, Object.fromEntries(entries));
    return { ...entry, cached: false };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (cached && !(error instanceof ApiError && [401, 403, 404].includes(error.status))) return { data: cached.data as T, savedAt: cached.savedAt, cached: true };
    if (error instanceof ApiError) throw error;
    throw new Error('Нет связи с Yani. Проверь интернет и попробуй снова.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
export const animeList = (params: Params, signal?: AbortSignal) => request<Anime[]>('/anime', { limit: 24, require_fields: 'genres,ep_count,description', ...params }, signal);
export const animeDetail = (id: string | number, signal?: AbortSignal) => request<Anime>(`/anime/${encodeURIComponent(id)}`, {}, signal);
export const animeVideos = (id: number, signal?: AbortSignal) => request<Video[]>(`/anime/${id}/videos`, {}, signal);
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
