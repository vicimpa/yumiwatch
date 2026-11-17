import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { animeDetail, animeVideos, peekAnimeDetail, peekAnimeVideos } from '~/lib/api';
import { exitPlayerFullscreen, isDesktop } from '~/lib/desktop';
import { useLibrary, useResource, useSession } from '~/lib/hooks';
import { readPlaybackRecovery } from '~/lib/playback-recovery';
import { formatTime, latestWatchEntry } from '~/lib/player';
import type { WatchEntry } from '~/lib/types';
import { useAnimeDiscordContext } from '~/hooks/useAnimeDiscordContext';

import { AnimeAbout } from './AnimeAbout';
import { Comments } from './Comments';
import { FavoriteButton } from './FavoriteButton';
import { AnimeListButton } from './Library';
import { Player } from './Player';
import { type MediaPanel } from './Player.types';
import { Poster } from './Poster';
import { Button, CachedNotice, ErrorState, Icon, Sidebar } from '~/ui';

export type TDetailProps = {
  id: string;
  query?: string;
  returnTo?: string;
};

export const Detail: FC<TDetailProps> = ({ id, query = '', returnTo = '/' }) => {
  const params = new URLSearchParams(query);
  const resource = useResource(
    signal => animeDetail(id, signal),
    [id, params.get('view') || 'about'],
    () => peekAnimeDetail(id)
  );
  const library = useLibrary(),
    session = useSession();
  const videos = useResource(
    signal => animeVideos(Number(id), signal),
    [id, session?.token, session?.verified],
    () => peekAnimeVideos(Number(id))
  );
  const checkpoint = useRef<{ token: string | null; entry: WatchEntry }>();
  const room = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (checkpoint.current?.token !== (session?.token || null)) checkpoint.current = undefined;
  }, [session?.token]);

  const anime = resource.value?.data,
    watching = params.get('view') === 'watch' || params.has('watch');
  const [panel, setPanel] = useState<MediaPanel>(() =>
    params.get('view') === 'comments' || params.get('panel') === 'comments' ? 'comments' : null
  );

  useAnimeDiscordContext(
    anime,
    watching
      ? undefined
      : panel === 'comments'
        ? 'Читает комментарии'
        : panel === 'episodes'
          ? 'Выбирает серию'
          : 'Читает об аниме'
  );

  useEffect(() => {
    if (params.get('view') === 'comments') setPanel('comments');
  }, [query]);

  const entries = [
    anime && latestWatchEntry(anime, videos.value?.data || []),
    library.history.find(entry => entry.anime.anime_id === Number(id)),
    checkpoint.current?.token === (session?.token || null) ? checkpoint.current.entry : undefined,
    readPlaybackRecovery(Number(id)),
  ].filter((entry): entry is WatchEntry => !!entry && entry.anime.anime_id === Number(id));
  const history = entries.sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const openComments = useCallback(
    () => setPanel(current => (current === 'comments' ? null : 'comments')),
    []
  );

  const backToAbout = useCallback(() => {
    void exitPlayerFullscreen()
      .catch(() => {})
      .then(() => {
        location.hash = `/anime/${id}`;
      });
  }, [id]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input,textarea,select,[contenteditable]:not([contenteditable=false])'
          )) ||
        document.querySelector('dialog[open],.video-settings')
      )
        return;

      const key = event.code || event.key.toLowerCase();

      if (key === 'KeyC' || key === 'c') {
        event.preventDefault();
        openComments();
      }
      if (key === 'KeyE' || key === 'e') {
        event.preventDefault();
        setPanel(current => (current === 'episodes' ? null : 'episodes'));
      }
      if (watching && (key === 'KeyI' || key === 'i')) {
        event.preventDefault();
        backToAbout();
      }
    };

    window.addEventListener('keydown', keys);

    return () => window.removeEventListener('keydown', keys);
  }, [watching, id]);

  const shareAnime = useCallback(async () => {
    if (!anime) return;

    const url = isDesktop()
      ? `https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`
      : location.href;

    try {
      if (navigator.share) await navigator.share({ title: anime.title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // The user may cancel sharing.
    }
  }, [anime]);

  const returnLabel = returnTo.startsWith('/search')
    ? 'Результаты поиска'
    : returnTo.startsWith('/profile') || returnTo.startsWith('/users/')
      ? 'Назад к профилю'
      : returnTo.startsWith('/notifications')
        ? 'Уведомления'
        : returnTo.startsWith('/messages')
          ? 'Сообщения'
          : 'Каталог аниме';

  const toggleEpisodes = useCallback(
    () => setPanel(current => (current === 'episodes' ? null : 'episodes')),
    []
  );

  const checkpointPlayback = useCallback(
    (entry: WatchEntry) => {
      checkpoint.current = { token: session?.token || null, entry };
    },
    [session]
  );

  const closePanel = useCallback(() => setPanel(null), []);

  return (
    <section class={`anime-detail-screen ${watching ? 'is-watching' : 'is-about'}`}>
      <a
        class={watching ? 'watch-state-back' : 'back-link'}
        href={watching ? `#/anime/${id}` : `#${returnTo}`}
      >
        <Icon name="back" size={18} />
        {watching ? 'Об аниме' : returnLabel}
      </a>
      {resource.loading ? (
        <div class="detail-loading">
          <div class="skeleton detail-poster" />
          <div>
            <div class="skeleton line" />
            <div class="skeleton line short" />
          </div>
        </div>
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : (
        anime && (
          <>
            {!watching && resource.value?.cached && !resource.refreshing && (
              <CachedNotice savedAt={resource.value.savedAt} />
            )}
            <div ref={room} class={`anime-room ${watching ? 'is-watch' : 'is-info'} `}>
              <div class="room-main">
                {!watching && (
                  <>
                    <a
                      class="anime-resume-row"
                      data-nav-primary
                      href={`#/anime/${id}?view=watch&play=1`}
                    >
                      <span class="resume-row-play">
                        <Icon name="play" size={24} />
                      </span>
                      <span>
                        <strong>{history ? 'Продолжить просмотр' : 'Начать просмотр'}</strong>
                        <small>
                          {history
                            ? `Серия ${history.episode} · ${formatTime(history.position)}${history.duration ? ` / ${formatTime(history.duration)}` : ''}`
                            : 'Озвучки и доступные источники — ниже'}
                        </small>
                      </span>
                      <Icon name="arrow" size={22} />
                    </a>
                    <header class="anime-watch-heading overview-heading">
                      <div class="watch-poster">
                        <Poster anime={anime} large />
                      </div>
                      <div class="watch-title">
                        <h1>{anime.title}</h1>
                        <div class="detail-meta">
                          {anime.rating?.average ? (
                            <span class="hero-score">★ {anime.rating.average.toFixed(1)}</span>
                          ) : null}
                          <span>{anime.year}</span>
                          <span>{anime.type?.name}</span>
                          <span>{anime.anime_status?.title}</span>
                          {anime.min_age?.title && <span>{anime.min_age.title}</span>}
                        </div>
                        <div class="watch-title-actions">
                          <Button aria-label="Поделиться аниме" onClick={shareAnime}>
                            <Icon name="external" size={18} />
                          </Button>
                          <FavoriteButton anime={anime} />
                          <Button
                            onClick={toggleEpisodes}
                            aria-haspopup="dialog"
                            aria-expanded={panel === 'episodes'}
                            title="Серии (E)"
                          >
                            <Icon name="list" size={18} />
                            Серии
                          </Button>
                          <Button
                            onClick={openComments}
                            aria-expanded={panel === 'comments'}
                            title="Комментарии (C)"
                          >
                            <Icon name="comment" size={18} />
                            Комментарии{anime.comments_count ? ` · ${anime.comments_count}` : ''}
                          </Button>
                        </div>
                        <AnimeListButton anime={anime} />
                      </div>
                    </header>
                  </>
                )}
                {watching ? (
                  <Player
                    presentation="immersive"
                    modeOverride="universal"
                    onBack={backToAbout}
                    key={anime.anime_id}
                    anime={anime}
                    history={history}
                    startPlaying={params.has('play')}
                    preferredVoice={params.get('voice') || undefined}
                    preferredEpisode={params.get('episode') || undefined}
                    panel={panel}
                    onPanelChange={setPanel}
                    onComments={openComments}
                    fullscreenContainer={room}
                    onCheckpoint={checkpointPlayback}
                  />
                ) : (
                  <AnimeAbout
                    anime={anime}
                    videos={videos}
                    history={history}
                    episodesOpen={panel === 'episodes'}
                    closeEpisodes={closePanel}
                  />
                )}
              </div>
              <Sidebar
                open={panel === 'comments'}
                title="Комментарии"
                subtitle={anime.title}
                close={closePanel}
                className="comments-sidebar"
              >
                <Comments
                  animeId={anime.anime_id}
                  returnTo={`/anime/${id}?view=${watching ? 'watch' : 'anime-about'}&panel=comments`}
                />
              </Sidebar>
            </div>
          </>
        )
      )}
    </section>
  );
};
