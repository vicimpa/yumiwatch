// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnimeRatingStats } from '~/components/AnimeRatingStats';
import { ProfileStats } from '~/components/ProfileStats';
import { putCache } from '~/lib/cache-store';
import { clearSession } from '~/lib/session';

const votes = [
  { rating: 9, count: 3 },
  { rating: 7, count: 1 },
];
const reply = (response: unknown) => new Response(JSON.stringify({ response }));

beforeEach(() => {
  clearSession();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('loads public anime votes and renders all ten scores, weighted average and percentages', async () => {
  const fetcher = vi.fn().mockResolvedValue(reply(votes));
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<AnimeRatingStats animeId={10531} />);
  expect(screen.getByRole('status').textContent).toBe('Загружаем оценки…');
  const chart = await screen.findByRole('img', {
    name: /Распределение 4 оценок. Средняя оценка 8.5/,
  });
  expect(chart.children).toHaveLength(10);
  expect(chart.querySelector('[title="9 из 10 — 3 оценок · 75%"] i')?.getAttribute('style')).toBe(
    'height: 100%;'
  );
  expect(chart.children[0].getAttribute('title')).toBe('1 из 10 — 0 оценок · 0%');
  expect(container.querySelector('.rating-distribution-average strong')?.textContent).toBe('8.5');
  expect(String(fetcher.mock.calls[0][0])).toBe('https://api.yani.tv/anime/10531/rates?');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
});

it('shows an empty state when nobody has rated the anime', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply([])));
  render(<AnimeRatingStats animeId={10531} />);
  await screen.findByText('У этого аниме пока нет оценок.');
  expect(screen.queryByRole('img')).toBeNull();
});

it('offers a retry after an invalid response and recovers without hiding the section', async () => {
  const fetcher = vi.fn().mockImplementation(async () => reply({ unexpected: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<AnimeRatingStats animeId={10531} />);
  await screen.findByText('Не удалось прочитать оценки.');
  fetcher.mockImplementation(async () => reply(votes));
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByRole('img', { name: /Распределение 4 оценок/ });
  expect(screen.queryByText('Не удалось прочитать оценки.')).toBeNull();
});

it('keeps saved votes visible on the first paint and refreshes the same chart in place', async () => {
  putCache('data', '/anime/10531/rates?', votes);
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(new Promise<Response>(resolve => (finish = resolve)))
  );
  render(<AnimeRatingStats animeId={10531} />);
  const chart = screen.getByRole('img', { name: /Распределение 4 оценок/ });
  expect(screen.queryByText('Загружаем оценки…')).toBeNull();
  finish(reply([{ rating: 10, count: 5 }]));
  expect(await screen.findByRole('img', { name: /Распределение 5 оценок/ })).toBe(chart);
});

it('keeps cached ratings available offline', async () => {
  putCache('data', '/anime/10531/rates?', votes);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  render(<AnimeRatingStats animeId={10531} />);
  expect(screen.getByRole('img', { name: /Распределение 4 оценок/ })).toBeTruthy();
  await screen.findByText(/Сохранённая версия/);
  expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
});

it('does not let a late response replace the next anime’s ratings', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementation((url: string) =>
      url.includes('/10531/')
        ? new Promise<Response>(resolve => (finish = resolve))
        : Promise.resolve(reply([{ rating: 10, count: 2 }]))
    );
  vi.stubGlobal('fetch', fetcher);
  const { rerender } = render(<AnimeRatingStats animeId={10531} />);
  rerender(<AnimeRatingStats animeId={10532} />);
  await screen.findByRole('img', { name: /Распределение 2 оценок. Средняя оценка 10.0/ });
  await act(async () => finish(reply(votes)));
  expect(screen.queryByRole('img', { name: /Распределение 4 оценок/ })).toBeNull();
});

it('uses the same distribution for personal ratings in the profile', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => reply(url.includes('/ratings') ? votes : []))
  );
  render(<ProfileStats id={42} animes={[]} />);
  await screen.findByRole('img', { name: /Распределение 4 оценок. Средняя оценка 8.5/ });
  expect(screen.getByRole('heading', { name: 'Личная шкала' })).toBeTruthy();
});
