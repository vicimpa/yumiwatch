// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { Detail } from '../src/components/Pages';
import { clearSession } from '../src/lib/session';
import { readLibrary } from '../src/lib/storage';
import { anime, video } from './fixtures';
const current = { ...video('1'), iframe_url: 'https://player.aksor.tv/video/example', duration: 1400 };
beforeEach(() => {
  clearSession(); localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const response = path === '/anime/10531' ? { ...anime, description: 'Описание аниме', viewing_order: [{ ...anime, anime_id: 10532, title: 'Второй сезон' }] }
      : path.endsWith('/videos') ? [current] : { comments: [] };
    return Promise.resolve(new Response(JSON.stringify({ response })));
  }));
});
afterEach(() => { cleanup(); clearSession(); vi.unstubAllGlobals(); });
describe('separate mobile views', () => {
  it('closes playback when switching to comments and restores its checkpoint on return', async () => {
    const { container, rerender } = render(<Detail id="10531"/>);
    await screen.findByRole('button', { name: /Все серии/ });
    expect(container.querySelector('#anime-about')).toBeNull();
    expect(container.querySelector('#comments')).toBeNull();
    const frame = container.querySelector('iframe')!;
    const message = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://player.aksor.tv', data }));
    message({ key: 'player_play' }); message({ key: 'kodik_player_time_update', value: 143 });
    rerender(<Detail id="10531" query="view=comments"/>);
    await screen.findByText('Пока тихо');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('#anime-about')).toBeNull();
    expect(readLibrary().history[0].position).toBe(143);
    rerender(<Detail id="10531" query="view=watch"/>);
    await screen.findByRole('button', { name: /Все серии/ });
    await waitFor(() => expect(container.querySelector('.resume-notice')?.textContent).toContain('02:23'));
    expect(container.querySelector('#comments')).toBeNull();
  });
  it('opens the description as its own screen without loading the player or discussion', async () => {
    const { container } = render(<Detail id="10531" query="view=anime-about"/>);
    await screen.findByText('Описание аниме');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('#comments')).toBeNull();
    expect(container.querySelector('#viewing-order')).toBeNull();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('link', { name: 'Об аниме' }).getAttribute('aria-current')).toBe('page');
  });
});
