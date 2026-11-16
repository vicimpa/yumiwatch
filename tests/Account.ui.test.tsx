// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { AccountPage } from '~/components/Account';
import { clearSession, getSession, SESSION_KEY } from '~/lib/session';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '/account';
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  delete window.hcaptcha;
});
describe('account sign-in screen', () => {
  it('submits the user’s credentials, then opens their collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply({ success: true, token: 'user-token' }))
        .mockResolvedValueOnce(reply({ id: 42, nickname: 'Viewer' }))
    );
    render(<AccountPage query="" />);
    fireEvent.input(screen.getByLabelText('Почта на YummyAnime'), {
      target: { value: 'viewer@example.com' },
    });
    fireEvent.input(screen.getByLabelText('Пароль'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(getSession()?.verified).toBe(true));
    expect(location.hash).toBe('#/library');
    expect(sessionStorage.getItem(SESSION_KEY)).not.toContain('test-password');
  });
  it('shows the captcha only when Yummy requests one and waits for an explicit retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Captcha', error_code: 5 }), { status: 420 })
      );

    vi.stubGlobal('fetch', fetcher);

    const renderCaptcha = vi.fn().mockReturnValue('widget-id');

    window.hcaptcha = { render: renderCaptcha, remove: vi.fn() };
    render(<AccountPage query="" />);
    fireEvent.input(screen.getByLabelText('Почта на YummyAnime'), {
      target: { value: 'viewer@example.com' },
    });
    fireEvent.input(screen.getByLabelText('Пароль'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(renderCaptcha).toHaveBeenCalledOnce());
    expect((screen.getByRole('button', { name: 'Войти' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
