import { ApiError, yaniFetch } from './api';
import { clearSession, getSession, persistSession, type AccountUser } from './session';

function profileUser(value: { id: number; nickname: string; avatars?: { small?: string } }): AccountUser {
  if (!Number.isInteger(value?.id) || typeof value.nickname !== 'string') throw new Error('Yani вернул неожиданный профиль.');
  return { id: value.id, nickname: value.nickname, avatar: value.avatars?.small };
}
export async function loginAccount(login: string, password: string, remember: boolean, captcha?: string, signal?: AbortSignal) {
  const response = await yaniFetch<{ success: boolean; token: string }>('/profile/login', { method: 'POST', body: { login: login.trim(), password, need_json: true, ...(captcha ? { recaptcha_response: captcha } : {}) }, signal });
  if (!response?.success || !response.token) throw new Error('Yani не подтвердил вход. Проверь данные и попробуй снова.');
  const profile = await yaniFetch<Parameters<typeof profileUser>[0]>('/profile', { token: response.token, signal });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  await persistSession({ token: response.token, user: profileUser(profile), remember, refreshedAt: Date.now(), verified: true });
}
let restoring: Promise<void> | undefined;
export function initializeAccount() {
  if (restoring) return restoring;
  const session = getSession();
  if (!session || (session.verified && Date.now() - session.refreshedAt < 2 * 24 * 60 * 60 * 1000)) return Promise.resolve();
  restoring = (async () => {
    try {
      const profile = await yaniFetch<Parameters<typeof profileUser>[0]>('/profile', { token: session.token });
      if (getSession()?.token !== session.token) return;
      let token = session.token;
      let refreshedAt = session.refreshedAt;
      if (Date.now() - refreshedAt > 2 * 24 * 60 * 60 * 1000) {
        const refresh = await yaniFetch<{ token: string }>('/profile/token', { token });
        if (refresh?.token) { token = refresh.token; refreshedAt = Date.now(); }
      }
      if (getSession()?.token === session.token) await persistSession({ ...session, token, refreshedAt, user: profileUser(profile), verified: true });
    } catch (error) {
      if (error instanceof ApiError && error.status===401) clearSession(session.token);
      throw error;
    } finally { restoring = undefined; }
  })();
  return restoring;
}
export function logoutAccount() {
  const session = getSession();
  clearSession();
  if (session) void yaniFetch('/profile/logout', { method: 'POST', token: session.token }).catch(() => {});
}
