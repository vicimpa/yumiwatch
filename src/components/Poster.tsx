import type { FunctionalComponent as FC } from 'preact';

import { imageUrl } from '~/lib/api';
import type { Anime } from '~/lib/types';

import { ArtworkImage } from '~/ui';

export type TPosterProps = { anime: Anime; large?: boolean };

export const Poster: FC<TPosterProps> = ({ anime, large = false }) => {
  const retina = window.devicePixelRatio > 1.25;
  const url = imageUrl(
    large
      ? (retina ? anime.poster?.huge : undefined) ||
          anime.poster?.big ||
          anime.poster?.medium ||
          anime.poster?.huge
      : (retina ? anime.poster?.big : undefined) ||
          anime.poster?.medium ||
          anime.poster?.big ||
          anime.poster?.huge
  );

  return <ArtworkImage src={url} alt={anime.title} eager={large} tone={anime.anime_id} />;
};
