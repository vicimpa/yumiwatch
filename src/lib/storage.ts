import type { Anime, Library, Video } from './types';

export const LIBRARY_KEY = 'yumiwatch:library:v1';
export const TOKEN_KEY = 'yumiwatch:application';
export const LIBRARY_EVENT = 'yumiwatch:library';
export function readJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function writeJSON(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function readLibrary(): Library {
  const value = readJSON<Library>(LIBRARY_KEY, { favorites: [], history: [] });
  return {
    favorites: Array.isArray(value.favorites) ? value.favorites.filter(a => a?.anime_id && a?.title) : [],
    history: Array.isArray(value.history) ? value.history.filter(a => a?.anime?.anime_id && a?.episode != null) : [],
  };
}
function compact(anime: Anime): Anime {
  const { videos: _videos, random_screenshots: _screenshots, ...rest } = anime;
  return rest;
}
function saveLibrary(library: Library) {
  if (!writeJSON(LIBRARY_KEY, library)) throw new Error('Не удалось сохранить: хранилище устройства заполнено или недоступно.');
  window.dispatchEvent(new Event(LIBRARY_EVENT));
}
export function toggleFavorite(anime: Anime) {
  const library = readLibrary();
  const exists = library.favorites.some(a => a.anime_id === anime.anime_id);
  library.favorites = exists ? library.favorites.filter(a => a.anime_id !== anime.anime_id) : [compact(anime), ...library.favorites];
  saveLibrary(library);
  return !exists;
}
export function recordWatch(anime: Anime, video: Video, group: string, position?: number, duration?: number) {
  const library = readLibrary();
  const previous = library.history.find(entry => entry.videoId === video.video_id);
  library.history = [{ anime: compact(anime), videoId: video.video_id, episode: video.number, group, updatedAt: Date.now(), position: position ?? previous?.position ?? 0, duration: duration ?? video.duration ?? previous?.duration ?? 0, preview: anime.random_screenshots?.find(frame => frame.episode === video.number)?.sizes.small }, ...library.history.filter(e => e.anime.anime_id !== anime.anime_id)].slice(0, 100);
  saveLibrary(library);
}
export function clearHistory() {
  saveLibrary({ ...readLibrary(), history: [] });
}
