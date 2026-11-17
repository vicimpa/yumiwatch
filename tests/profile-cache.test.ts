// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProfile, peekProfile, loadProfileList, peekProfileList } from '~/lib/profile';
import { clearSession, saveSession } from '~/lib/session';
import { resetMemoryCache } from '~/lib/cache-store';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const signIn = (id: number, token = `token-${id}`) =>
  saveSession({
    token,
    user: { id, nickname: 'Viewer' },
    verified: true,
    remember: false,
    refreshedAt: Date.now(),
  });
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('profile cache', () => {
  it('opens a persisted profile immediately and preserves it when the network is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({ id: 8, nickname: 'Друг', about: 'Профиль', watches: { history: [] } })
      )
    );
    await loadProfile(8);
    resetMemoryCache();
    expect(peekProfile(8)?.data.nickname).toBe('Друг');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const cached = await loadProfile(8);
    expect(cached.cached).toBe(true);
    expect((await cached.revalidate)?.data.nickname).toBe('Друг');
  });
  it('isolates private data between accounts and guests, retaining only explicit profile fields', async () => {
    signIn(42);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({
          id: 42,
          nickname: 'Viewer',
          about: 'Private',
          lists_privacy: 'none',
          secret_field: 'never cache',
          messages: { unread_count: 99 },
        })
      )
    );
    await loadProfile(42);
    expect(peekProfile(42)?.data.about).toBe('Private');
    const persisted = localStorage.getItem('yumiwatch:api:private:v1')!;
    expect(persisted).not.toContain('token-42');
    expect(persisted).not.toContain('secret_field');
    expect(persisted).not.toContain('unread_count');
    signIn(7);
    expect(peekProfile(42)).toBeUndefined();
    clearSession();
    expect(peekProfile(42)).toBeUndefined();
  });
  it('invalidates cached lists if access is revoked instead of falling back to private data', async () => {
    signIn(42);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply([{ anime_id: 9, title: 'История', anime_url: 'story' }]))
    );
    await loadProfileList(8);
    expect(peekProfileList(8)?.data).toHaveLength(1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: true }), { status: 403 }))
    );
    const value = await loadProfileList(8);
    await expect(value.revalidate).rejects.toMatchObject({ status: 403 });
    expect(peekProfileList(8)).toBeUndefined();
  });
  it('does not persist a profile response after the account changes mid-request', async () => {
    signIn(42);
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(done => {
            resolve = done;
          })
      )
    );
    const pending = loadProfile(8);
    signIn(7);
    resolve(reply({ id: 8, nickname: 'Друг' }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    signIn(42);
    expect(peekProfile(8)).toBeUndefined();
  });
});
