// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, LIBRARY_KEY, readLibrary, recordWatch, toggleFavorite } from '~/lib/storage';
import { groupKey } from '~/lib/player';
import { anime, video } from './fixtures';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('local collection', () => {
  it('toggles a favorite without duplicates', () => {
    expect(toggleFavorite(anime)).toBe(true);
    expect(readLibrary().favorites.map(a => a.anime_id)).toEqual([10531]);
    expect(toggleFavorite(anime)).toBe(false);
    expect(readLibrary().favorites).toEqual([]);
  });
  it('recovers from corrupted storage', () => {
    localStorage.setItem(LIBRARY_KEY, '{oops');
    expect(readLibrary()).toEqual({ favorites: [], history: [] });
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ favorites: [null, {}], history: 'bad' }));
    expect(readLibrary()).toEqual({ favorites: [], history: [] });
  });
  it('remembers the episode and dubbing and replaces older history for the same anime', () => {
    const first = video('1');
    const second = video('2', 'AniDub');

    recordWatch(anime, first, groupKey(first));
    recordWatch(anime, second, groupKey(second));
    expect(readLibrary().history).toHaveLength(1);
    expect(readLibrary().history[0]).toMatchObject({
      episode: '2',
      videoId: second.video_id,
      group: groupKey(second),
    });
  });
  it('does not persist the whole video list in the collection', () => {
    toggleFavorite({ ...anime, videos: [video('1')] });
    expect(readLibrary().favorites[0].videos).toBeUndefined();
  });
  it('bounds history to 100 entries and keeps favorites when history is cleared', () => {
    toggleFavorite(anime);
    for (let id = 1; id <= 105; id++) recordWatch({ ...anime, anime_id: id }, video('1'), 'group');
    expect(readLibrary().history).toHaveLength(100);
    expect(readLibrary().history[0].anime.anime_id).toBe(105);
    clearHistory();
    expect(readLibrary().history).toEqual([]);
    expect(readLibrary().favorites).toHaveLength(1);
  });
  it('reports storage failure instead of pretending the favorite was saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => toggleFavorite(anime)).toThrow('Не удалось сохранить');
  });
});
