import type { Anime } from './types';

export function animeSiteUrl(anime: Pick<Anime, 'anime_id' | 'anime_url'>) {
  return `https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url || anime.anime_id)}`;
}

export function publicAppUrl(href: string) {
  const route = href.slice(1);
  const match = /^\/anime\/(\d+)/.exec(route);
  if (match) return `https://ru.yummyani.me/catalog/item/${match[1]}`;
  if (route.startsWith('/catalog') || route.startsWith('/users/'))
    return `https://ru.yummyani.me${route}`;
  return 'https://ru.yummyani.me/';
}
