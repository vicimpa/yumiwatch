import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useLayoutEffect, useMemo, useState } from 'preact/hooks';

import { imageUrl, plainText } from '~/lib/api';
import { cardMenuEvents } from '~/lib/card-context';
import { playbackUrl, videoPosition } from '~/lib/player';
import { groupVoices } from '~/lib/streams';
import type { Anime, Result, Video, WatchEntry } from '~/lib/types';

import { AboutEpisodes } from './AboutEpisodes';
import { AnimeRatingStats } from './AnimeRatingStats';
import { EpisodeSubscriptionButton, useEpisodeSubscriptions } from './EpisodeSubscription';
import { ArtworkImage, Button, ButtonLink, FormError, Icon, Sheet } from '~/ui';

export type TAnimeAboutProps = {
  anime: Anime;
  videos: {
    value?: Result<Video[]>;
    loading: boolean;
    error: string;
    retry: () => void;
  };
  history?: WatchEntry;
  episodesOpen?: boolean;
  closeEpisodes?: () => void;
};

const EMPTY_VIDEOS: Video[] = [];

const closeNothing = () => {};

export const AnimeAbout: FC<TAnimeAboutProps> = ({
  anime,
  videos,
  history,
  episodesOpen = false,
  closeEpisodes = closeNothing,
}) => {
  const subscriptions = useEpisodeSubscriptions(anime.anime_id);
  const all = Array.isArray(videos.value?.data) ? videos.value.data : EMPTY_VIDEOS;
  const groups = useMemo(
    () =>
      groupVoices(all).map(group => {
        const providers = new Map<number, Video[]>();

        for (const video of group.videos) {
          const choices = providers.get(video.data.player_id);

          if (choices) choices.push(video);
          else providers.set(video.data.player_id, [video]);
        }

        return {
          ...group,
          episodeCount: new Set(group.videos.map(video => video.number)).size,
          providers: [...providers.values()].map(choices =>
            choices.sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
          ),
        };
      }),
    [all]
  );
  const voices = useMemo(
    () =>
      groups.map(group => ({
        ...group,
        providers: group.providers.map(choices => {
          const video = choices.find(video => video.number === history?.episode) || choices[0];

          return { video, href: playbackUrl(video, videoPosition(video, history).position) };
        }),
      })),
    [groups, history]
  );
  const frames = useMemo(
    () =>
      (anime.random_screenshots || []).filter(frame =>
        imageUrl(frame.sizes.full || frame.sizes.small)
      ),
    [anime.random_screenshots]
  );
  const description = useMemo(() => plainText(anime.description), [anime.description]);
  const [frame, setFrame] = useState<number>();
  const closeFrame = useCallback(() => setFrame(undefined), []);
  const previousFrame = useCallback(
    () => setFrame(previous => ((previous || 0) - 1 + frames.length) % frames.length),
    [frames.length]
  );
  const nextFrame = useCallback(
    () => setFrame(previous => ((previous || 0) + 1) % frames.length),
    [frames.length]
  );

  useLayoutEffect(() => {
    if (frame === undefined) return;

    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setFrame(
          previous =>
            ((previous || 0) + (event.key === 'ArrowRight' ? 1 : -1) + frames.length) %
            frames.length
        );
      }
    };

    window.addEventListener('keydown', key);

    return () => window.removeEventListener('keydown', key);
  }, [frame, frames.length]);

  return (
    <div class="anime-about-content">
      <section class="about-description" aria-labelledby="anime-description">
        <div class="section-heading">
          <h2 id="anime-description">Об аниме</h2>
        </div>
        <div class="detail-genres">
          {anime.genres?.map(genre => (
            <a key={genre.id} href={`#/catalog?genres=${encodeURIComponent(genre.alias)}`}>
              {genre.title}
            </a>
          ))}
        </div>
        <p class="full-synopsis">{description || 'Описание ещё не добавлено.'}</p>
        <dl class="anime-facts">
          <div>
            <dt>Год</dt>
            <dd>{anime.year || '—'}</dd>
          </div>
          <div>
            <dt>Формат</dt>
            <dd>{anime.type?.name || '—'}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{anime.anime_status?.title || '—'}</dd>
          </div>
          <div>
            <dt>Серии</dt>
            <dd>
              {anime.episodes?.aired || 0}
              {anime.episodes?.count ? ` / ${anime.episodes.count}` : ''}
            </dd>
          </div>
          {anime.studios?.length ? (
            <div>
              <dt>Студия</dt>
              <dd>{anime.studios.map(studio => studio.title).join(', ')}</dd>
            </div>
          ) : null}
          {anime.min_age?.title && (
            <div>
              <dt>Возраст</dt>
              <dd>{anime.min_age.title_long || anime.min_age.title}</dd>
            </div>
          )}
          {anime.episodes?.next_date && (
            <div>
              <dt>Следующая серия</dt>
              <dd>
                {new Date(anime.episodes.next_date * 1000).toLocaleString('ru', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <AnimeRatingStats animeId={anime.anime_id} />
      <section class="about-screenshots" aria-label="Скриншоты аниме">
        <div class="section-heading">
          <h2>Скриншоты</h2>
          <span class="muted">{frames.length}</span>
        </div>
        {frames.length ? (
          <div class="screenshot-rail">
            {frames.map((image, index) => (
              <button
                key={`${image.sizes.small}:${index}`}
                aria-label={`Открыть скриншот ${index + 1}`}
                onClick={() => setFrame(index)}
              >
                <ArtworkImage
                  src={imageUrl(image.sizes.small || image.sizes.full)}
                  alt={image.episode ? `Кадр серии ${image.episode}` : `Кадр ${index + 1}`}
                  tone={index}
                />
                <span class="screenshot-open">
                  <Icon name="external" size={18} />
                </span>
                {image.episode && <small>Серия {image.episode}</small>}
              </button>
            ))}
          </div>
        ) : (
          <p class="collection-note">Скриншоты пока не добавлены.</p>
        )}
      </section>
      <section class="about-voices" aria-label="Доступные озвучки">
        <div class="section-heading">
          <h2>Доступные озвучки</h2>
          <span class="muted">{voices.length || ''}</span>
        </div>
        {videos.loading ? (
          <p role="status" class="collection-note">
            Загружаем озвучки…
          </p>
        ) : videos.error ? (
          <FormError class="account-error">
            {videos.error}
            <Button onClick={videos.retry} variant="text">
              Повторить
            </Button>
          </FormError>
        ) : voices.length ? (
          <div class="voice-gallery">
            {voices.map(group => (
              <div key={group.key} class="voice-source-group">
                <a
                  class="voice-tile"
                  href={`#/anime/${anime.anime_id}?view=watch&play=1&voice=${encodeURIComponent(group.name)}`}
                >
                  <span class="voice-tile-icon">
                    <Icon name={/субтитры/i.test(group.name) ? 'comment' : 'volume'} size={22} />
                  </span>
                  <span>
                    <strong>{group.name.replace(/^Озвучка /, '')}</strong>
                    <small>Наш плеер · {group.episodeCount} серий</small>
                  </span>
                  <Icon name="play" size={19} />
                </a>
                <div class="voice-original-players">
                  <small>Оригинальные плееры</small>
                  {group.providers.map(({ video, href }) => (
                    <div key={video.data.player_id} class="voice-subscription">
                      <a href={href} target="_blank" rel="noreferrer">
                        {video.data.player.replace(/^Плеер /, '')}
                        <Icon name="external" size={13} />
                      </a>
                      <EpisodeSubscriptionButton video={video} subscription={subscriptions} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p class="collection-note">Серии и озвучки ещё не появились.</p>
        )}
      </section>
      {!!anime.viewing_order?.length && (
        <section class="about-order" id="viewing-order">
          <div class="section-heading">
            <h2>Порядок просмотра</h2>
          </div>
          <div class="viewing-order">
            {anime.viewing_order.map((item, index) => {
              const current = Number(item.anime_id) === Number(anime.anime_id);

              return (
                <a
                  key={item.anime_id}
                  href={`#/anime/${item.anime_id}`}
                  aria-current={current ? 'page' : undefined}
                  {...cardMenuEvents(item)}
                >
                  <span>{index + 1}</span>
                  <strong>
                    {item.title}
                    {current && <span class="viewing-order-current">Текущий тайтл</span>}
                  </strong>
                  <small>{item.year}</small>
                  <Icon name="chevron" size={16} />
                </a>
              );
            })}
          </div>
        </section>
      )}
      <ButtonLink
        href={`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`}
        target="_blank"
        rel="noreferrer"
        variant="text"
        class="about-original"
      >
        Открыть на YummyAnime
        <Icon name="external" size={16} />
      </ButtonLink>
      <AboutEpisodes
        anime={anime}
        videos={all}
        history={history}
        open={episodesOpen}
        close={closeEpisodes}
        loading={videos.loading}
        error={videos.error}
        retry={videos.retry}
      />
      {frame !== undefined && frames[frame] && (
        <Sheet
          title={`Скриншот ${frame + 1} из ${frames.length}`}
          subtitle={anime.title}
          close={closeFrame}
          className="screenshot-viewer"
          footer={
            <div class="screenshot-viewer-actions">
              <Button aria-label="Предыдущий скриншот" onClick={previousFrame}>
                <Icon name="back" />
                Назад
              </Button>
              <span>
                {frame + 1} / {frames.length}
              </span>
              <Button aria-label="Следующий скриншот" onClick={nextFrame}>
                Далее
                <Icon name="arrow" />
              </Button>
            </div>
          }
        >
          <ArtworkImage
            className="screenshot-artwork"
            imageClass="screenshot-full"
            src={imageUrl(frames[frame].sizes.full || frames[frame].sizes.small)}
            alt={`Скриншот ${frame + 1} — ${anime.title}`}
            eager
            tone={frame}
          />
        </Sheet>
      )}
    </div>
  );
};
