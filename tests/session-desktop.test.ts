// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  flushSessionPersistence,
  getSession,
  initializeSession,
  persistSession,
  saveSession,
  SESSION_KEY,
  type Session,
} from '~/lib/session';

const bridge = vi.hoisted(() => ({ enabled: false, invoke: vi.fn() }));

vi.mock('~/lib/desktop', () => ({
  isDesktop: () => bridge.enabled,
  desktopInvoke: bridge.invoke,
}));

let stored: unknown = null;

const session = (token = 'test-token'): Session => ({
  token,
  user: { id: 42, nickname: 'Viewer' },
  remember: true,
  refreshedAt: Date.now(),
  verified: true,
});

beforeEach(async () => {
  bridge.enabled = false;
  clearSession();
  await flushSessionPersistence();
  localStorage.clear();
  sessionStorage.clear();
  stored = null;
  bridge.invoke.mockReset().mockImplementation(async (command, args) => {
    if (command === 'load_account_session') return stored;
    if (command === 'save_account_session') {
      stored = args.session;

      return;
    }
    throw new Error('Unexpected command');
  });
  document.documentElement.dataset.desktop = 'macos';
  bridge.enabled = true;
});
afterEach(async () => {
  await flushSessionPersistence();
  bridge.enabled = false;
  clearSession();
  delete document.documentElement.dataset.desktop;
});
describe('native remembered session', () => {
  it('restores from the system store even when all WebView storage has disappeared', async () => {
    await persistSession(session());
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    bridge.enabled = false;
    clearSession();
    bridge.enabled = true;
    await initializeSession();
    expect(getSession()).toMatchObject({ token: 'test-token', remember: true, verified: false });
    expect(stored).not.toHaveProperty('verified');
    expect(stored).not.toHaveProperty('password');
  });
  it('migrates the old remembered WebView session and persists refreshed tokens', async () => {
    saveSession(session('old'));
    await initializeSession();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(stored).toMatchObject({ token: 'old' });
    await persistSession(session('refreshed'));
    bridge.enabled = false;
    clearSession();
    bridge.enabled = true;
    await initializeSession();
    expect(getSession()?.token).toBe('refreshed');
  });
  it('deletes durable login on logout and when remember is disabled', async () => {
    await persistSession(session());
    clearSession();
    await flushSessionPersistence();
    expect(stored).toBeNull();
    await persistSession({ ...session(), remember: false });
    expect(stored).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toContain('test-token');
  });
  it('does not report a saved login when the OS rejects the write', async () => {
    bridge.invoke.mockRejectedValue(new Error('Store unavailable'));
    await expect(persistSession(session())).rejects.toThrow('Store unavailable');
    expect(getSession()).toBeNull();
  });
  it('does not resurrect a login when logout races a pending native write', async () => {
    let finish!: () => void;

    bridge.invoke.mockImplementation(async (command, args) => {
      if (command === 'save_account_session' && args.session)
        await new Promise<void>(resolve => {
          finish = resolve;
        });
      stored = args.session;
    });

    const writing = persistSession(session());

    await Promise.resolve();
    clearSession();
    finish();
    await expect(writing).rejects.toMatchObject({ name: 'AbortError' });
    await flushSessionPersistence();
    expect(stored).toBeNull();
    expect(getSession()).toBeNull();
  });
});
