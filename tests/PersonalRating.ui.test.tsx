// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PersonalRating } from '~/components/PersonalRating';
import { getLibraryState, resetAccountLibrary } from '~/lib/library';
import { clearSession, saveSession } from '~/lib/session';
import { readLibrary } from '~/lib/storage';
import { anime } from './fixtures';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const user = (id = 42, verified = true) =>
  saveSession({
    token: `rating-${id}`,
    user: { id, nickname: 'Viewer' },
    verified,
    remember: false,
    refreshedAt: Date.now(),
  });
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
  vi.restoreAllMocks();
});

it('saves guest scores locally, restores them and removes a score without a network request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const saved = vi.fn();
  const { unmount } = render(<PersonalRating anime={anime} saved={saved} />);
  expect(screen.getByRole('status').textContent).toBe('Пока не оценено');
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 8 из 10' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('8 / 10'));
  expect(readLibrary().rated?.[0].user?.rating).toBe(8);
  unmount();
  render(<PersonalRating anime={anime} saved={saved} />);
  expect(
    screen.getByRole('button', { name: 'Оценить на 8 из 10' }).getAttribute('aria-pressed')
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Снять оценку' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Пока не оценено'));
  expect(readLibrary().rated).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
});

it('shows an existing account score and saves a new score only on explicit selection', async () => {
  user();
  const fetcher = vi.fn(async () => reply({ rating: 8.9, votes: 123 }));
  vi.stubGlobal('fetch', fetcher);
  const saved = vi.fn();
  render(<PersonalRating anime={{ ...anime, user: { rating: 6 } }} saved={saved} />);
  expect(
    screen.getByRole('button', { name: 'Оценить на 6 из 10' }).getAttribute('aria-pressed')
  ).toBe('true');
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('9 / 10'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toMatchObject([
    `https://api.yani.tv/anime/${anime.anime_id}/rate?`,
    {
      method: 'PUT',
      body: JSON.stringify({ rate: 9 }),
      headers: { Authorization: 'Yummy rating-42' },
    },
  ]);
  expect(getLibraryState().rated?.[0].user?.rating).toBe(9);
  expect(saved).toHaveBeenCalledOnce();
});

it('removes an account score through DELETE', async () => {
  user();
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) =>
    reply({ rating: 8.8, votes: 122 })
  );
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalRating anime={{ ...anime, user: { rating: 7 } }} saved={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Снять оценку' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Пока не оценено'));
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'DELETE', body: undefined });
});

it('keeps the confirmed score on an unacknowledged write and allows a retry', async () => {
  user();
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply(fail ? false : { rating: 9, votes: 123 }))
  );
  render(<PersonalRating anime={{ ...anime, user: { rating: 6 } }} saved={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('status').textContent).toBe('6 / 10');
  expect(getLibraryState().rated).toEqual([]);
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('9 / 10'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('disables voting until the saved account is verified', () => {
  user(42, false);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalRating anime={anime} saved={() => {}} />);
  expect(screen.getByRole('group', { name: 'Оценить аниме' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  expect(fetcher).not.toHaveBeenCalled();
});

it('ignores a late rating after switching accounts and blocks repeated clicks while saving', async () => {
  user();
  let finish!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>(resolve => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetcher);
  const saved = vi.fn();
  const { rerender } = render(
    <PersonalRating anime={{ ...anime, user: { rating: 6 } }} saved={saved} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 8 из 10' }));
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => user(43));
  rerender(<PersonalRating anime={{ ...anime, user: { rating: 2 } }} saved={saved} />);
  await act(async () => finish(reply({ rating: 9, votes: 123 })));
  expect(screen.getByRole('status').textContent).toBe('2 / 10');
  expect(getLibraryState().rated).toEqual([]);
  expect(saved).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('uses the confirmed library score when an earlier save finishes after a remount', async () => {
  user();
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
  );
  const saved = vi.fn();
  const first = render(<PersonalRating anime={{ ...anime, user: { rating: 6 } }} saved={saved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Оценить на 9 из 10' }));
  first.unmount();
  render(<PersonalRating anime={{ ...anime, user: { rating: 6 } }} saved={saved} />);
  await act(async () => finish(reply({ rating: 8.9, votes: 123 })));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('9 / 10'));
  expect(
    screen.getByRole('button', { name: 'Оценить на 9 из 10' }).getAttribute('aria-pressed')
  ).toBe('true');
  expect(saved).not.toHaveBeenCalled();
});

it('uses the confirmed cache when a rated-only score is removed after a remount', async () => {
  user();
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
  );
  const stale = { ...anime, user: { rating: 7 } };
  const first = render(<PersonalRating anime={stale} saved={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Снять оценку' }));
  first.unmount();
  render(<PersonalRating anime={stale} saved={() => {}} />);
  await act(async () => finish(reply({ rating: 8.8, votes: 122 })));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Пока не оценено'));
  expect(getLibraryState().rated).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Снять оценку' })).toBeNull();
});
