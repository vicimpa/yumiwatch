import { animeSiteUrl } from '~/lib/content-links';
import { AppLink } from '~/ui/AppLink';
import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { imageUrl } from '~/lib/api';
import { formatTime, videoPosition } from '~/lib/player';
import { groupVoices, voiceKey, voiceVideos } from '~/lib/streams';
import type { Anime, Video, WatchEntry } from '~/lib/types';

import {
  Empty,
  EpisodeCaption,
  EpisodePreview,
  ErrorState,
  Field,
  SearchField,
  Select,
  Sidebar,
} from '~/ui';

export type TAboutEpisodesProps = {
  anime: Anime;
  videos: Video[];
  history?: WatchEntry;
  open: boolean;
  close: () => void;
  loading: boolean;
  error: string;
  retry: () => void;
};

type TAboutEpisodeCardProps = {
  anime: Anime;
  video: Video;
  history?: WatchEntry;
  savedVoice?: string;
  voice: string;
  close: () => void;
};

const AboutEpisodeCard: FC<TAboutEpisodeCardProps> = ({
  anime,
  video,
  history,
  savedVoice,
  voice,
  close,
}) => {
  const frame = anime.random_screenshots?.find(image => image.episode === video.number);
  const preview = imageUrl(frame?.sizes.small || anime.poster?.medium);
  const sameVoice = savedVoice && voiceKey(savedVoice) === voiceKey(voice);
  const entry =
    sameVoice && history?.episode === video.number
      ? { ...history, videoId: video.video_id }
      : history;
  const saved = videoPosition(video, entry);
  const current = history?.episode === video.number && !!saved.position;

  return (
    <AppLink
      class={`episode-card ${current ? 'selected' : ''}`}
      aria-label={`Серия ${video.number}`}
      aria-current={current ? 'true' : undefined}
      href={`#/anime/${anime.anime_id}?view=watch&play=1&episode=${encodeURIComponent(video.number)}&voice=${encodeURIComponent(voice)}`}
      publicHref={animeSiteUrl(anime)}
      onClick={close}
    >
      <EpisodePreview
        src={preview}
        progress={saved.duration > 0 ? (saved.position / saved.duration) * 100 : 0}
      />
      <EpisodeCaption title={`Серия ${video.number}`}>
        {saved.position ? `Продолжить · ${formatTime(saved.position)}` : 'Смотреть'}
      </EpisodeCaption>
    </AppLink>
  );
};

export const AboutEpisodes: FC<TAboutEpisodesProps> = ({
  anime,
  videos,
  history,
  open,
  close,
  loading,
  error,
  retry,
}) => {
  const [selectedVoice, setSelectedVoice] = useState(''),
    [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const voices = useMemo(() => groupVoices(videos), [videos]);
  const savedVoice = useMemo(
    () => videos.find(video => video.video_id === history?.videoId)?.data.dubbing,
    [videos, history?.videoId]
  );
  const voice =
    voices.find(group => group.key === selectedVoice)?.name || savedVoice || voices[0]?.name || '';
  const choices = useMemo(() => voiceVideos(videos, voice), [videos, voice]);
  const episodes = useMemo(
    () => choices.filter(video => video.number.includes(query.trim())),
    [choices, query]
  );

  const changeVoice = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => setSelectedVoice(event.currentTarget.value),
    []
  );

  return (
    <Sidebar
      open={open}
      title="Серии"
      subtitle={anime.title}
      close={close}
      className="episodes-sidebar about-episodes-sidebar"
    >
      {loading ? (
        <p class="collection-note" role="status">
          Загружаем серии…
        </p>
      ) : error ? (
        <ErrorState error={error} retry={retry} />
      ) : !voices.length ? (
        <Empty title="Серии пока не появились">Попробуй вернуться позже.</Empty>
      ) : (
        <>
          <Field class="about-episodes-voice" label="Озвучка">
            <Select aria-label="Озвучка серий" value={voiceKey(voice)} onChange={changeVoice}>
              {voices.map(({ key, name }) => (
                <option key={key} value={key}>
                  {name.replace(/^Озвучка /, '')}
                </option>
              ))}
            </Select>
          </Field>
          <SearchField
            value={query}
            onValueChange={setQuery}
            label="Найти серию"
            placeholder="Номер серии"
          />
          {episodes.length ? (
            <div class="episode-cards">
              {episodes.map(video => (
                <AboutEpisodeCard
                  key={video.number}
                  anime={anime}
                  video={video}
                  history={history}
                  savedVoice={savedVoice}
                  voice={voice}
                  close={close}
                />
              ))}
            </div>
          ) : (
            <p class="collection-note">Такая серия не найдена.</p>
          )}
        </>
      )}
    </Sidebar>
  );
};
