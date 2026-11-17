import {
  cacheGeneration,
  dataRequests,
  deleteCache,
  getCache,
  putCache,
  resetRequests,
} from './cache-store';
import { apiFetch } from './desktop';
import {
  API_TIMEOUT_MS,
  API_URL,
  apiEndpointGeneration,
  configurePrimaryApiProbe,
  apiEndpoints,
  failApiEndpoint,
  rememberApiEndpoint,
} from './api-endpoints';
import { normalizeImage } from './image-cache';
import { clearSession, getSession } from './session';
import { TOKEN_KEY } from './storage';
import type { Anime, Params, Result, Video } from './types';
import type { RatingCount } from './ratings';

export { API_URL, API_URLS } from './api-endpoints';

configurePrimaryApiProbe(async signal => {
  const applicationToken = getToken();
  const response = await apiFetch(`${API_URL}/anime?limit=1`, {
    method: 'GET',
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      Lang: 'ru',
      ...(applicationToken ? { 'X-Application': applicationToken } : {}),
    },
  });
  if (!response.ok) return false;
  const payload = await response.json();
  return !payload?.error && Array.isArray(payload?.response);
});
const pending = dataRequests;

interface CacheOptions {
  token?: string;
}

function keyFor(path: string, params: Params, options: CacheOptions = {}) {
  const query = new URLSearchParams(makeQuery(params));

  query.sort();

  let scope = '';

  if (options.token) {
    let hash = 2166136261;

    for (const char of options.token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    scope = `account:${getSession()?.user.id || 'session'}:${hash >>> 0}:`;
  }

  return `${scope}${path}?${query}`;
}

export function resetPendingRequests() {
  resetRequests();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number
  ) {
    super(message);
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_YUMMY_APPLICATION_TOKEN || '';
  } catch {
    return import.meta.env.VITE_YUMMY_APPLICATION_TOKEN || '';
  }
}

export function makeQuery(params: Params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });

  return query.toString();
}

type RequestOptions = {
  params?: Params;
  method?: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
  keepalive?: boolean;
};

function apiErrorMessage(status: number, path: string, authenticated: boolean, code?: number) {
  if (status === 420 || code === 5) return 'Для входа нужно пройти капчу.';

  if (path === '/profile/login' && (status === 401 || status === 403))
    return 'Не удалось войти. Проверь почту и пароль.';

  if (status === 401 && authenticated) return 'Сессия истекла. Войди в аккаунт снова.';

  if (status === 403 && authenticated) return 'Yummy не разрешил это действие для аккаунта.';

  if (status === 401 || status === 403)
    return 'API просит токен приложения. Добавь его в настройках.';

  if (status === 404) return 'Это аниме не найдено.';

  if (status === 429) return 'Слишком много запросов. Попробуй чуть позже.';

  return 'Сервис Yummy временно недоступен. Попробуй ещё раз.';
}

export async function yummyFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params = {}, method = 'GET', body, token: accountToken, signal, keepalive } = options;
  const applicationToken = getToken();
  const query = makeQuery(params);
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  // POST/PATCH may already have reached Yummy when the connection drops. A user retry
  // uses the next endpoint, but must not silently send a message or edit twice.
  const canRetry = ['GET', 'PUT', 'DELETE'].includes(method.toUpperCase());
  let lastError: unknown;

  const generation = apiEndpointGeneration();
  for (const endpoint of apiEndpoints()) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const controller = new AbortController();
    const abort = () => controller.abort();

    signal?.addEventListener('abort', abort, { once: true });

    const timeout = setTimeout(abort, API_TIMEOUT_MS);

    try {
      const response = await apiFetch(`${endpoint}${path}?${query}`, {
        method,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        keepalive,
        headers: {
          Accept: 'application/json,image/avif,image/webp',
          Lang: 'ru',
          ...(applicationToken ? { 'X-Application': applicationToken } : {}),
          ...(accountToken ? { Authorization: `Yummy ${accountToken}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: serializedBody,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!response.ok || payload?.error) {
        if (response.status === 401 && accountToken) clearSession(accountToken);

        const message = apiErrorMessage(response.status, path, !!accountToken, payload?.error_code);

        throw new ApiError(message, response.status, payload?.error_code);
      }
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'response'))
        throw new ApiError('API вернул неожиданный ответ.', 502);

      rememberApiEndpoint(endpoint, generation);
      return payload.response as T;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        error instanceof ApiError &&
        (error.code === 5 || (error.status < 500 && error.status !== 408))
      )
        throw error;

      failApiEndpoint(endpoint, generation);
      lastError =
        error instanceof ApiError
          ? error
          : new Error('Нет связи с Yummy. Проверь интернет и попробуй снова.');
      if (!canRetry) break;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  throw lastError;
}

function subscribe<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      value => {
        signal.removeEventListener('abort', abort);
        if (!signal.aborted) resolve(value);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

export function peekRequest<T>(
  path: string,
  params: Params = {},
  options: CacheOptions = {}
): Result<T> | undefined {
  const saved = getCache<T>('data', keyFor(path, params, options));

  return saved ? { data: saved.data, savedAt: saved.savedAt, cached: true } : undefined;
}

export function request<T>(
  path: string,
  params: Params = {},
  signal?: AbortSignal,
  options: CacheOptions = {}
): Promise<Result<T>> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  const key = keyFor(path, params, options);
  let task = pending.get(key) as Promise<Result<T>> | undefined;

  if (!task) {
    const generation = cacheGeneration;

    task = (async () => {
      try {
        // A screen leaving does not abort a shared refresh needed by another view.
        const data = await yummyFetch<T>(path, {
          params,
          token: options.token,
        });
        const savedAt = Date.now();

        if (generation === cacheGeneration) {
          putCache('data', key, data, savedAt);
          if (!options.token && Array.isArray(data))
            for (const value of data) {
              if (value && Number.isInteger(value.anime_id) && typeof value.title === 'string') {
                const entityKey = keyFor(`/anime/${value.anime_id}`, {}),
                  previous = getCache<Anime>('data', entityKey)?.data;

                if (!previous) putCache('data', entityKey, value, savedAt);
              }
            }
        }

        return { data, savedAt, cached: false };
      } catch (error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          deleteCache('data', key);
          throw error;
        }

        const cached = peekRequest<T>(path, params, options);

        if (cached) return cached;
        throw error;
      }
    })();
    pending.set(key, task);

    const current = task;

    void task.then(
      () => {
        if (pending.get(key) === current) pending.delete(key);
      },
      () => {
        if (pending.get(key) === current) pending.delete(key);
      }
    );
  }

  return subscribe(task, signal);
}

export function cachedRequest<T>(
  path: string,
  params: Params = {},
  signal?: AbortSignal,
  options: CacheOptions = {}
): Promise<Result<T>> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  const cached = peekRequest<T>(path, params, options),
    revalidate = request<T>(path, params, signal, options);

  if (!cached) return revalidate;
  void revalidate.catch(() => {});

  return Promise.resolve({ ...cached, revalidate });
}

const listQuery = (params: Params) => ({
  limit: 24,
  require_fields: 'genres,ep_count,description',
  ...params,
});

function listOptions(params: Params): CacheOptions {
  if (!params.exclude_list) return {};

  const session = getSession();

  if (!session?.verified)
    throw new ApiError('Войди в аккаунт, чтобы фильтровать по своим спискам.', 401);

  return { token: session.token };
}

export const animeList = async (params: Params, signal?: AbortSignal): Promise<Result<Anime[]>> =>
  cachedRequest('/anime', listQuery(params), signal, listOptions(params));

export const peekAnimeList = (params: Params) => {
  try {
    return peekRequest<Anime[]>('/anime', listQuery(params), listOptions(params));
  } catch {
    return undefined;
  }
};

export const animeDetail = (id: string | number, signal?: AbortSignal) =>
  cachedRequest<Anime>(`/anime/${encodeURIComponent(id)}`, {}, signal);

export const peekAnimeDetail = (id: string | number) =>
  peekRequest<Anime>(`/anime/${encodeURIComponent(id)}`);

export const animeRatings = (id: number, signal?: AbortSignal) =>
  cachedRequest<RatingCount[]>(`/anime/${id}/rates`, {}, signal);

export const peekAnimeRatings = (id: number) => peekRequest<RatingCount[]>(`/anime/${id}/rates`);

const videoOptions = () => {
  const session = getSession();

  return session?.verified ? { token: session.token } : {};
};

export const animeVideos = (id: number, signal?: AbortSignal) =>
  cachedRequest<Video[]>(`/anime/${id}/videos`, {}, signal, videoOptions());

export const peekAnimeVideos = (id: number) =>
  peekRequest<Video[]>(`/anime/${id}/videos`, {}, videoOptions());

export const animeSchedule = (signal?: AbortSignal) =>
  cachedRequest<Anime[]>('/anime/schedule', {}, signal);

export const peekAnimeSchedule = () => peekRequest<Anime[]>('/anime/schedule');

export const imageUrl = normalizeImage;

export function plainText(html = '') {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
