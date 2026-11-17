// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '~/components/Profile';
import { clearSession, saveSession } from '~/lib/session';
import { resetAccountLibrary } from '~/lib/library';
import { recordWatch, readLibrary, setAnimeList, toggleFavorite } from '~/lib/storage';
import { anime, video } from './fixtures';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  resetAccountLibrary();
});
afterEach(() => {
  cleanup();
  clearSession();
  resetAccountLibrary();
  vi.unstubAllGlobals();
});

describe('profile experience', () => {
  it('makes a guest’s collection usable without login or network access', async () => {
    setAnimeList(anime, 2);
    toggleFavorite(anime);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<ProfilePage query="" />);
    expect(screen.getByRole('heading', { name: 'Твой аниме-мир' })).toBeTruthy();
    expect(container.querySelector('a[href="#/profile?tab=collection&list=watched"]')).toBeTruthy();
    await screen.findByText('Детектив');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shows full guest history with search, resume links and confirmed clearing', async () => {
    for (let index = 0; index < 5; index++)
      recordWatch(
        { ...anime, anime_id: 100 + index, title: `История ${index}` },
        video('2'),
        'StudioBand',
        30,
        1441
      );
    const { container } = render(<ProfilePage query="tab=history" />);
    expect(container.querySelectorAll('.history-card')).toHaveLength(5);
    expect(container.querySelector('a[href="#/anime/104?view=watch&play=1"]')).toBeTruthy();
    expect(container.querySelector('.history-copy')?.textContent).toContain('00:30 / 24:01');
    fireEvent.input(screen.getByLabelText('Найти в истории'), { target: { value: 'История 3' } });
    expect(container.querySelectorAll('.history-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск в истории' }));
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    expect(readLibrary().history).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(readLibrary().history).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить историю' }));
    await screen.findByText('Здесь продолжится твоя история');
    expect(readLibrary().history).toEqual([]);
  });

  it('offers login back to profile subscriptions for guests', () => {
    const { container } = render(<ProfilePage query="tab=subscriptions" />);
    expect(container.querySelector('.profile-panel a.button')?.getAttribute('href')).toBe(
      '#/account?next=%2Fprofile%3Ftab%3Dsubscriptions'
    );
  });

  it('searches, sorts and filters the collection while favorites stay independent of status', async () => {
    setAnimeList(anime, 2);
    toggleFavorite(anime);
    setAnimeList({ ...anime, anime_id: 10, title: 'Атака титанов', year: 2013 }, 1);
    render(<ProfilePage query="tab=collection" />);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Порядок аниме'), { target: { value: 'title' } });
    expect(document.querySelector('.card-title')?.textContent).toBe('Атака титанов');
    fireEvent.input(screen.getByLabelText('Найти в коллекции профиля'), {
      target: { value: 'фарм' },
    });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Статус выхода'), { target: { value: 'ongoing' } });
    expect(screen.getByText('Здесь пока пусто')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('keeps a public profile visible when its lists are private and does not offer editing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          url.includes('/lists')
            ? new Response(JSON.stringify({ error: true }), { status: 403 })
            : url.includes('/stats/')
              ? reply([])
              : reply({ id: 8, nickname: 'Закрытый профиль', about: '<b>Привет</b>' })
        )
    );
    render(<ProfilePage userId={8} query="tab=history" />);
    await screen.findByRole('heading', { name: 'Закрытый профиль' });
    await screen.findByText(/Владелец ограничил доступ/);
    expect(screen.getByText('Привет').querySelector('b')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).toBeNull();
    const tabs = screen.getByRole('navigation', { name: 'Разделы профиля' });
    expect(tabs.textContent).not.toContain('История');
    expect(tabs.textContent).not.toContain('Подписки');
    expect(screen.queryByRole('heading', { name: 'История просмотра' })).toBeNull();
  });

  it('saves about and privacy only on form submit and keeps the editor open on failure', async () => {
    saveSession({
      token: 'test-owner',
      user: { id: 42, nickname: 'Viewer' },
      remember: false,
      refreshedAt: Date.now(),
      verified: true,
    });
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) =>
        options.method === 'PATCH'
          ? reply(false)
          : url.includes('/stats/')
            ? reply([])
            : reply({ id: 42, nickname: 'Viewer', about: 'До изменения', lists_privacy: 'none' })
      );
    vi.stubGlobal('fetch', fetcher);
    render(<ProfilePage query="" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));
    fireEvent.input(screen.getByLabelText('О себе'), { target: { value: 'Новое описание' } });
    fireEvent.change(screen.getByLabelText('Кто видит мои списки'), {
      target: { value: 'friends' },
    });
    expect(fetcher.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Yummy не подтвердил сохранение профиля.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    const patch = fetcher.mock.calls.find(([, options]) => options.method === 'PATCH');
    expect(JSON.parse(patch![1].body as string)).toEqual({
      about: 'Новое описание',
      lists_privacy: 'friends',
    });
    fetcher.mockImplementation(async (url: string, options: RequestInit) =>
      options.method === 'PATCH'
        ? reply(true)
        : url.includes('/stats/')
          ? reply([])
          : reply({ id: 42, nickname: 'Viewer', about: 'Новое описание', lists_privacy: 'friends' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('Новое описание');
  });
});
