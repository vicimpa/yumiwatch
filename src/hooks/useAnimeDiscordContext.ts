import { useMemo } from 'preact/hooks';

import { imageUrl } from '~/lib/api';
import type { Anime } from '~/lib/types';

import { useDiscordContext } from './useDiscordContext';

export function useAnimeDiscordContext(
  anime: Anime | undefined,
  state: string | undefined,
  query = '',
  priority = 10
) {
  const activity = useMemo(() => {
    if (!anime || !state) return;

    const text = Array.from(query.trim().replace(/\s+/gu, ' ')).slice(0, 80).join('');

    return {
      type: 0 as const,
      details: anime.title,
      state: text ? `${state} · «${text}»` : state,
      animeUrl: `https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`,
      largeImage: imageUrl(anime.poster?.big || anime.poster?.medium) || undefined,
    };
  }, [anime, state, query]);

  useDiscordContext(activity, priority);
}
