// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/preact';

import { AnimeAbout } from '~/components/AnimeAbout';
import { groupKey } from '~/lib/player';
import type { Video, WatchEntry } from '~/lib/types';
import { anime, video } from './fixtures';

const source = vi.hoisted(() => ({ videos: [] as Video[] }));

vi.mock('~/lib/hooks', async original => ({
  ...(await original<typeof import('~/lib/hooks')>()),
  useResource: () => ({
    value: { data: source.videos },
    loading: false,
    error: '',
    retry: vi.fn(),
  }),
}));

afterEach(cleanup);

it('counts unique episodes across providers and updates resume links and refreshed voices', () => {
  const first = { ...video('1'), iframe_url: 'https://kodik.info/one' };
  const second = { ...video('2'), iframe_url: 'https://kodik.info/two' };

  source.videos = [first, second, video('1', 'AniLiberty', 2), video('1', 'Субтитры AniLibria')];

  const { container, rerender } = render(<AnimeAbout anime={anime} />);
  const voices = screen.getByRole('region', { name: 'Доступные озвучки' });

  expect(within(voices).getByText('Наш плеер · 2 серий')).toBeTruthy();
  expect(within(voices).getByText('Наш плеер · 1 серий')).toBeTruthy();
  expect(container.querySelectorAll('.voice-source-group')).toHaveLength(2);
  expect(within(voices).getAllByRole('link', { name: 'Player 1' })[0].getAttribute('href')).toBe(
    first.iframe_url
  );

  const history: WatchEntry = {
    anime,
    videoId: second.video_id,
    episode: '2',
    group: groupKey(second),
    position: 120,
    duration: 1400,
    updatedAt: Date.now(),
  };

  rerender(<AnimeAbout anime={anime} history={history} />);
  expect(within(voices).getAllByRole('link', { name: 'Player 1' })[0].getAttribute('href')).toBe(
    'https://kodik.info/two?start_from=115'
  );
  source.videos = [...source.videos, video('3')];
  rerender(<AnimeAbout anime={{ ...anime }} history={history} />);
  expect(within(voices).getByText('Наш плеер · 3 серий')).toBeTruthy();
});
