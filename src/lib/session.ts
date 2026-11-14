export interface AccountUser { id: number; nickname: string; avatar?: string }
export interface Session { token: string; user: AccountUser; remember: boolean; refreshedAt: number; verified: boolean }
export const SESSION_KEY = 'yumiwatch:session:v1';
export const SESSION_EVENT = 'yumiwatch:session';
function storedSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value.token === 'string' && value.token && Number.isInteger(value.user?.id) && typeof value.user.nickname === 'string'
      ? { ...value, verified: false } : null;
  } catch { return null; }
}
let current = storedSession();
export const getSession = () => current;
function emit() { window.dispatchEvent(new Event(SESSION_EVENT)); }
export function saveSession(session: Session) {
  const previous = current;
  const storage = session.remember ? localStorage : sessionStorage;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    (session.remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  } catch { throw new Error('Браузер не разрешил сохранить сессию. Разреши хранилище для входа.'); }
  current = session;
  if (previous?.token !== session.token || previous?.verified !== session.verified) emit();
}
export function clearSession(expectedToken?: string) {
  if (expectedToken && current?.token !== expectedToken) return;
  current = null;
  for (const storage of [sessionStorage, localStorage]) { try { storage.removeItem(SESSION_KEY); } catch { /* Already signed out in memory. */ } }
  emit();
}
export function restoreStoredSession() {
  current = storedSession();
  emit();
}
