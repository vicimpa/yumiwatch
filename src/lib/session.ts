import { desktopInvoke, isDesktop } from './desktop';

export interface AccountUser {
  id: number;
  nickname: string;
  avatar?: string;
}

export interface Session {
  token: string;
  user: AccountUser;
  remember: boolean;
  refreshedAt: number;
  verified: boolean;
}

export const SESSION_KEY = 'yumiwatch:session:v1';
export const SESSION_EVENT = 'yumiwatch:session';
export const SESSION_STORAGE_ERROR = 'yumiwatch:session-storage-error';

const nativeStorage = () => isDesktop();

function decodeSession(value: unknown): Session | null {
  if (!value || typeof value !== 'object') return null;

  const saved = value as Session;

  return typeof saved.token === 'string' &&
    !!saved.token &&
    Number.isInteger(saved.user?.id) &&
    saved.user.id > 0 &&
    typeof saved.user.nickname === 'string'
    ? {
        token: saved.token,
        user: saved.user,
        remember: saved.remember === true,
        refreshedAt: Number.isFinite(saved.refreshedAt) ? saved.refreshedAt : 0,
        verified: false,
      }
    : null;
}

function storedSession(): Session | null {
  for (const storage of [() => sessionStorage, () => localStorage]) {
    try {
      const value = decodeSession(JSON.parse(storage().getItem(SESSION_KEY) || 'null'));

      if (value) return value;
    } catch {
      /* Try the other store. */
    }
  }

  return null;
}

let current = storedSession();
let revision = 0;
let persistence: Promise<void> = Promise.resolve();

function queuePersistence<T>(operation: () => Promise<T>): Promise<T> {
  const result = persistence.then(operation);

  persistence = result.then(
    () => {},
    () => {}
  );

  return result;
}

export const flushSessionPersistence = () => persistence;

function reportStorageError(error: unknown) {
  window.dispatchEvent(
    new CustomEvent(SESSION_STORAGE_ERROR, {
      detail: error instanceof Error ? error.message : 'Не удалось сохранить вход.',
    })
  );
}

export const getSession = () => current;

function emit() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function applySession(session: Session, nativeSaved = false) {
  const previous = current;
  const storage = session.remember ? localStorage : sessionStorage;

  try {
    if (!nativeSaved || !session.remember) storage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    (session.remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  } catch {
    if (!nativeSaved)
      throw new Error('Браузер не разрешил сохранить сессию. Разреши хранилище для входа.');
  }
  current = session;
  revision++;
  if (
    previous?.token !== session.token ||
    previous?.verified !== session.verified ||
    previous?.user.id !== session.user.id ||
    previous?.user.avatar !== session.user.avatar ||
    previous?.user.nickname !== session.user.nickname
  )
    emit();
}

export function saveSession(session: Session) {
  applySession(session);
}

export async function persistSession(session: Session) {
  if (!nativeStorage()) {
    saveSession(session);

    return;
  }

  const captured = revision;
  const saved = session.remember
    ? { token: session.token, user: session.user, remember: true, refreshedAt: session.refreshedAt }
    : null;

  // Wait for the OS to acknowledge the write before reporting successful login.
  await queuePersistence(() => desktopInvoke('save_account_session', { session: saved }));
  if (captured !== revision) throw new DOMException('Сессия изменилась.', 'AbortError');
  applySession(session, true);
}

export async function initializeSession() {
  if (!nativeStorage()) return;

  const captured = revision;
  const stored = await queuePersistence(() => desktopInvoke<unknown>('load_account_session', {}));

  if (captured !== revision) return;
  if (stored !== null) {
    const session = decodeSession(stored);

    if (!session?.remember) throw new Error('Не удалось прочитать сохранённый вход.');
    applySession(session, true);
  } else if (current?.remember) {
    // Migrate a previously remembered WebView session only after durable storage succeeds.
    await persistSession({ ...current, verified: false });
  }
}

export function clearSession(expectedToken?: string) {
  if (expectedToken && current?.token !== expectedToken) return;

  const userId = current?.user.id;

  current = null;
  revision++;
  if (userId !== undefined) {
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(`yumiwatch:draft:${userId}:`)) sessionStorage.removeItem(key);
    } catch {
      /* Session storage can be unavailable. */
    }
  }
  for (const storage of [sessionStorage, localStorage]) {
    try {
      storage.removeItem(SESSION_KEY);
    } catch {
      /* Already signed out in memory. */
    }
  }
  if (nativeStorage())
    void queuePersistence(() => desktopInvoke('save_account_session', { session: null })).catch(
      reportStorageError
    );
  emit();
}

export function restoreStoredSession() {
  if (nativeStorage()) {
    void initializeSession().catch(reportStorageError);

    return;
  }
  current = storedSession();
  emit();
}
