import type { FunctionalComponent as FC } from 'preact';

import type { Anime } from '~/lib/types';

import { FavoriteButton } from './FavoriteButton';
import { Poster } from './Poster';
import { Icon } from '~/ui';

export type TAnimeCardProps = {
  anime: Anime;
  rank?: number;
  onOpen?: () => void;
  onFocus?: () => void;
  onPreview?: () => void;
};

export const AnimeCard: FC<TAnimeCardProps> = ({ anime, rank, onOpen, onFocus, onPreview }) => {
  const score = anime.rating?.average;

  return (
    <article class="anime-card" data-gallery-item onFocusIn={onFocus} onPointerEnter={onPreview}>
      <div class="card-image">
        <a
          href={`#/anime/${anime.anime_id}?view=anime-about`}
          onClick={onOpen}
          tabIndex={-1}
          aria-hidden="true"
        >
          <Poster anime={anime} />
          <span class="poster-play">
            <Icon name="play" size={28} />
          </span>
        </a>
        {!!score && <span class="score">★ {score.toFixed(1)}</span>}
        <FavoriteButton anime={anime} compact />
        {anime.anime_status?.alias === 'ongoing' && (
          <span class="ongoing-label">
            <span />
            Онгоинг
          </span>
        )}
      </div>
      <div class="card-caption">
        {rank && <span class="rank">{String(rank).padStart(2, '0')}</span>}
        <div>
          <h3>
            <a
              data-gallery-link
              class="card-title"
              href={`#/anime/${anime.anime_id}?view=anime-about`}
              onClick={onOpen}
            >
              {anime.title}
            </a>
          </h3>
          <p>
            {[anime.year, anime.type?.shortname || anime.type?.name].filter(Boolean).join(' · ')}
            {anime.episodes?.aired ? ` · ${anime.episodes.aired} сер.` : ''}
          </p>
        </div>
      </div>
    </article>
  );
};

export type TAnimeRowProps = { anime: Anime; onOpen?: () => void };

export const AnimeRow: FC<TAnimeRowProps> = ({ anime, onOpen }) => (
  <article class="anime-result-row">
    <a class="result-main" href={`#/anime/${anime.anime_id}?view=anime-about`} onClick={onOpen}>
      <div class="result-poster">
        <Poster anime={anime} />
      </div>
      <div class="result-copy">
        <h2>{anime.title}</h2>
        <p>
          {[
            anime.year,
            anime.type?.shortname || anime.type?.name,
            anime.episodes?.aired ? `${anime.episodes.aired} сер.` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div class="result-bottom">
          {anime.rating?.average ? (
            <span class="result-rating">★ {anime.rating.average.toFixed(1)}</span>
          ) : null}
          <span>{anime.anime_status?.title}</span>
        </div>
      </div>
    </a>
    <FavoriteButton anime={anime} compact />
  </article>
);
