// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { AnimeListButton } from '~/components/Library';
import { ProfilePage } from '~/components/Profile';
import { ProfileSubscriptions } from '~/components/ProfileLibrary';
import { clearSession, saveSession } from '~/lib/session';
import { readLibrary, setAnimeList, toggleFavorite } from '~/lib/storage';
import { resetAccountLibrary } from '~/lib/library';
import { anime } from './fixtures';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  resetAccountLibrary();
});
afterEach(() => {
  cleanup();
  clearSession();
  resetAccountLibrary();
  vi.unstubAllGlobals();
});
describe('all YummyAnime lists', () => {
  it('keeps all lists together in the profile collection', () => {
    setAnimeList(anime, 1);
    toggleFavorite(anime);
    const { container } = render(<ProfilePage query="tab=collection" />);
    const filters = screen.getByRole('navigation', { name: 'Списки аниме' });
    for (const name of ['Смотрю', 'В планах', 'Просмотрено', 'Брошено', 'Отложено', 'Избранное'])
      expect(filters.textContent).toContain(name);
    expect(container.querySelector('a[href="#/profile?tab=collection&list=will"]')).toBeTruthy();
    expect(container.querySelector('a[href="#/profile?tab=history"]')).toBeTruthy();
    expect(container.querySelector('a[href="#/profile?tab=subscriptions"]')).toBeTruthy();
    expect(container.querySelector('a[href^="#/library"]')).toBeNull();
  });
  it('moves a guest anime between statuses and keeps favorites independent', async () => {
    toggleFavorite(anime);
    render(<AnimeListButton anime={anime} />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    fireEvent.click(screen.getByRole('button', { name: /В планах.*Для следующего/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLibrary().lists?.[1]).toHaveLength(1);
    expect(readLibrary().favorites).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'В планах' }));
    fireEvent.click(screen.getByRole('button', { name: /Смотрю.*Истории/ }));
    await waitFor(() => expect(readLibrary().lists?.[0]).toHaveLength(1));
    expect(readLibrary().lists?.[1]).toEqual([]);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('loads subscriptions privately with their dubbing and player', async () => {
    saveSession({
      token: 'subs-user',
      user: { id: 42, nickname: 'Viewer' },
      remember: false,
      refreshedAt: Date.now(),
      verified: true,
    });

    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: [{ ...anime, sub: { dubbing: 'AniLibria', player: 'Kodik' } }],
        })
      )
    );

    vi.stubGlobal('fetch', fetcher);
    render(<ProfileSubscriptions />);
    await screen.findByText('AniLibria · Kodik');
    expect(fetcher.mock.calls[0][0]).toContain('/users/42/lists/subs');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Yummy subs-user');
    expect(localStorage.getItem('yumiwatch:api:v1')).toBeNull();
  });
});
