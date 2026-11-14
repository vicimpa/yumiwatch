// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAccount, loginAccount, logoutAccount } from '../src/lib/account';
import { animeList, animeVideos, yaniFetch } from '../src/lib/api';
import { clearSession, getSession, saveSession, SESSION_KEY } from '../src/lib/session';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => { clearSession(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });
describe('YummyAnime accounts', () => {
  it('logs in directly, verifies the profile, and keeps only a session token by default', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ success: true, token: 'user-token' })).mockResolvedValueOnce(reply({ id: 42, nickname: 'Viewer', avatars: { small: '//static.yani.tv/avatar.jpg' }, about: 'private field' }));
    vi.stubGlobal('fetch', fetcher);
    await loginAccount(' viewer@example.com ', 'not-a-real-password', false);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ login: 'viewer@example.com', password: 'not-a-real-password', need_json: true });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Yummy user-token');
    expect(getSession()).toMatchObject({ verified: true, user: { id: 42, nickname: 'Viewer' } });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    const saved = sessionStorage.getItem(SESSION_KEY)!;
    expect(saved).toContain('user-token');
    for (const secret of ['not-a-real-password', 'viewer@example.com', 'private field']) expect(saved).not.toContain(secret);
    expect(localStorage.getItem('yumiwatch:api:v1')).toBeNull();
  });
  it('persists the token only after the user chooses remember me', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ success: true, token: 'remembered-token' })).mockResolvedValueOnce(reply({ id: 42, nickname: 'Viewer' })));
    await loginAccount('viewer@example.com', 'password', true);
    expect(localStorage.getItem(SESSION_KEY)).toContain('remembered-token');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
  it('does not create a session when the credentials are rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid password', error_code: 2 }), { status: 401 })));
    await expect(loginAccount('viewer@example.com', 'incorrect', false)).rejects.toThrow('Проверь почту и пароль');
    expect(getSession()).toBeNull(); expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
  it('exposes the captcha challenge and sends a user-supplied captcha response on retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Captcha required', error_code: 5 }), { status: 420 })).mockResolvedValueOnce(reply({ success: true, token: 'token' })).mockResolvedValueOnce(reply({ id: 42, nickname: 'Viewer' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(loginAccount('viewer@example.com', 'password', false)).rejects.toMatchObject({ status: 420, code: 5 });
    expect(getSession()).toBeNull();
    await loginAccount('viewer@example.com', 'password', false, 'test-captcha-response');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).recaptcha_response).toBe('test-captcha-response');
  });
  it('refreshes an old restored token after validating its profile', async () => {
    saveSession({ token: 'old-token', user: { id: 42, nickname: 'Viewer' }, remember: true, refreshedAt: Date.now() - 3 * 86400000, verified: false });
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ id: 42, nickname: 'Updated name' })).mockResolvedValueOnce(reply({ token: 'new-token' }));
    vi.stubGlobal('fetch', fetcher);
    await initializeAccount();
    expect(getSession()).toMatchObject({ token: 'new-token', verified: true, user: { nickname: 'Updated name' } });
    expect(fetcher.mock.calls[1][0]).toContain('/profile/token');
  });
  it('clears an expired session without letting an old 401 log out a newer account', async () => {
    saveSession({ token: 'new-user', user: { id: 2, nickname: 'New user' }, remember: false, refreshedAt: Date.now(), verified: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'expired' }), { status: 401 })));
    await expect(yaniFetch('/profile', { token: 'old-user' })).rejects.toMatchObject({ status: 401 });
    expect(getSession()?.token).toBe('new-user');
    await expect(yaniFetch('/profile', { token: 'new-user' })).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toBeNull();
  });
  it('keeps account-specific video progress out of the public cache', async () => {
    saveSession({ token: 'private-token', user: { id: 42, nickname: 'Viewer' }, remember: false, refreshedAt: Date.now(), verified: true });
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(reply([]))); vi.stubGlobal('fetch', fetcher);
    await animeVideos(10531);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Yummy private-token' } });
    expect(localStorage.getItem('yumiwatch:api:v1')).toBeNull();
    await animeList({});
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
  it('signs out locally immediately even when the network is offline', () => {
    saveSession({ token: 'user-token', user: { id: 42, nickname: 'Viewer' }, remember: true, refreshedAt: Date.now(), verified: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    logoutAccount();
    expect(getSession()).toBeNull(); expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
