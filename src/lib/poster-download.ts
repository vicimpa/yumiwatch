import { desktopInvoke, isDesktop } from './desktop';
import { normalizeImage, posterBlob } from './image-cache';
import type { Anime } from './types';

export const posterUrl = (anime: Anime) =>
  normalizeImage(anime.poster?.huge || anime.poster?.big || anime.poster?.medium);

export async function downloadPoster(anime: Anime) {
  const url = posterUrl(anime);
  if (!url) throw new Error('У этого тайтла нет постера.');
  if (isDesktop()) {
    await desktopInvoke<string>('save_poster', { url, animeId: anime.anime_id });
    return;
  }
  const blob = await posterBlob(url);
  const extension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  }[blob.type];
  if (!extension) throw new Error('Неизвестный формат постера.');
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `yummy-${anime.anime_id}-poster.${extension}`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
