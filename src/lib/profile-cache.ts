import { ApiError } from './api';
import { cacheGeneration, deleteCache, getCache, putCache } from './cache-store';
import { getSession } from './session';
import type { Result } from './types';

function scope() {
  const session = getSession();
  return session?.verified ? `account:${session.user.id}:profile:v1:` : 'profile:v1:guest:';
}

export function peekProfileData<T>(key: string): Result<T> | undefined {
  const entry = getCache<T>('data', `${scope()}${key}`);
  return entry ? { data: entry.data, savedAt: entry.savedAt, cached: true } : undefined;
}

/** Persistent account-scoped SWR. Never persist a raw /profile response or session token. */
export function profileData<T>(
  key: string,
  loader: () => Promise<T>,
  signal?: AbortSignal
): Promise<Result<T>> {
  const address = `${scope()}${key}`;
  const session = getSession();
  const token = session?.token;
  const generation = cacheGeneration;
  const cached = peekProfileData<T>(key);
  const refresh = (async (): Promise<Result<T>> => {
    try {
      const data = await loader();
      if (
        signal?.aborted ||
        getSession()?.token !== token ||
        getSession()?.verified !== session?.verified
      )
        throw new DOMException('Сессия изменилась.', 'AbortError');
      const savedAt = Date.now();
      if (generation === cacheGeneration) putCache('data', address, data, savedAt);
      return { data, cached: false, savedAt };
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        deleteCache('data', address);
        throw error;
      }
      if (
        signal?.aborted ||
        getSession()?.token !== token ||
        getSession()?.verified !== session?.verified ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;
      if (cached) return cached;
      throw error;
    }
  })();
  if (!cached) return refresh;
  void refresh.catch(() => {});
  return Promise.resolve({ ...cached, revalidate: refresh });
}
