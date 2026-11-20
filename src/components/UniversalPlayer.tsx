import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { PlaybackClosePositions, PlaybackMedia } from '~/lib/playback-media';
import { setPictureInPictureUnavailable } from '~/lib/native-playback';
import { mergeSkips } from '../../shared/skips.mjs';
import { useDiscordPresence } from '~/hooks/useDiscordPresence';
import { useAnimeDiscordContext } from '~/hooks/useAnimeDiscordContext';
import { animeVideos, imageUrl, peekAnimeVideos } from '~/lib/api';
import { probeAudioPlayback } from '~/lib/autoplay';
import { isDesktop } from '~/lib/desktop';
import { useResource, useSession } from '~/lib/hooks';
import { mediaAtEnd } from '~/lib/media-state';
import { selectedPlaybackRate, setPlaybackRate } from '~/lib/playback-rate';
import {
  createPlaybackSession,
  type MediaUpdate,
  type PlaybackSnapshot,
} from '~/lib/playback-session';
import {
  PLAYBACK_FLUSH,
  PLAYBACK_SHUTDOWN,
  savePlaybackSettings,
  usePlaybackSettings,
} from '~/lib/playback-settings';
import { formatTime, groupKey, resumeVideo, videoPosition } from '~/lib/player';
import { readJSON, writeJSON } from '~/lib/storage';
import {
  inspectStreamQualities,
  kodikMp4,
  preferredStreamQuality,
  resolveStream,
  selectStream,
  streamSourceFamily,
  voiceKey,
  voiceVideos,
  type Stream,
  type StreamResult,
} from '~/lib/streams';
import type { Video, WatchEntry } from '~/lib/types';

import { useCachedImage } from '~/hooks/useCachedImage';
import { useWatchFrame } from '~/hooks/useWatchFrame';
import { watchFrameKey } from '~/lib/watch-frames';

import { PlaybackLoader } from './PlaybackLoader';
import { PictureInPictureButton } from './PictureInPictureButton';
import { AutoPictureInPictureSetting, AutoSkipSettings } from './PlaybackSettings';
import type { TPlayerProps } from './Player.types';
import { EpisodeOptions, SourceOptions, VoiceOptions } from './PlayerOptions';
import { STREAM_ERROR_DELAY_MS, STREAM_RESUME_REFRESH_MS, VideoSurface } from './VideoSurface';
import { WatchPicker } from './WatchPicker';
import {
  Button,
  Dropdown,
  Empty,
  ErrorState,
  Icon,
  SearchField,
  Sheet,
  Sidebar,
  Toggle,
} from '~/ui';

const snapshotFields = [
  'videoId',
  'duration',
  'sync',
  'playing',
  'playbackRate',
  'reason',
  'quality',
] as const;

const EMPTY_VIDEOS: Video[] = [];
const EMPTY_IDS: number[] = [];
const EMPTY_RESERVES: StreamResult[] = [];

type SourceChoice = {
  value: string;
  label: string;
  videoId: number;
  format?: 'hls' | 'mp4';
};

function sameSnapshot(previous: PlaybackSnapshot | undefined, next: PlaybackSnapshot) {
  return (
    previous !== undefined &&
    Math.floor(previous.position) === Math.floor(next.position) &&
    Math.floor(previous.watchedSeconds) === Math.floor(next.watchedSeconds) &&
    snapshotFields.every(key => previous[key] === next[key])
  );
}

function resumeSelection(videos: Video[], history?: WatchEntry, preferredVoice?: string) {
  const preferred = preferredVoice
    ? videos.filter(video => voiceKey(video.data.dubbing) === voiceKey(preferredVoice))
    : videos;

  return resumeVideo(preferred, history) || resumeVideo(videos, history);
}

export const UniversalPlayer: FC<TPlayerProps> = ({
  anime,
  history,
  onCheckpoint,
  onPlayback,
  onSelectPlayer,
  panel,
  onPanelChange,
  onComments,
  fullscreenContainer,
  background = false,
  watchMedia,
  pip,
  preferredVoice,
  preferredEpisode,
  startPlaying,
  presentation,
  onBack,
}) => {
  const immersive = presentation === 'immersive';
  const session = useSession();
  const settings = usePlaybackSettings();
  const resource = useResource(
    signal => animeVideos(anime.anime_id, signal),
    [anime.anime_id, session?.token, session?.verified],
    () => peekAnimeVideos(anime.anime_id)
  );
  const all = resource.value?.data || EMPTY_VIDEOS;
  const initial = useMemo(
    () => resumeSelection(all, history, preferredVoice),
    [all, history, preferredVoice]
  );
  const [voice, setVoice] = useState(() => initial?.data.dubbing || '');
  const [episode, setEpisode] = useState(
    () =>
      all.find(
        video =>
          video.number === preferredEpisode &&
          voiceKey(video.data.dubbing) === voiceKey(initial?.data.dubbing || '')
      )?.number ||
      initial?.number ||
      ''
  );
  const [overlay, setOverlay] = useState<'voice' | 'episodes' | 'player' | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (panel || background) setOverlay(null);
  }, [panel, background]);

  const episodesOpen =
    !background && (panel === undefined ? overlay === 'episodes' : panel === 'episodes');

  const openEpisodes = useCallback(() => {
    setQuery('');
    if (onPanelChange) onPanelChange('episodes');
    else setOverlay('episodes');
  }, [onPanelChange]);

  const closeEpisodes = useCallback(() => {
    if (onPanelChange) onPanelChange(null);
    else setOverlay(null);
  }, [onPanelChange]);

  const [autoNext, setAutoNext] = useState(() => readJSON('yumiwatch:auto-next', false));
  const autoplay = useRef(startPlaying === true);
  const [resumeAutoplay, setResumeAutoplay] = useState(false);

  useEffect(() => {
    if (!history?.playing) return;

    let cancelled = false;

    void probeAudioPlayback().then(allowed => {
      if (!cancelled) setResumeAutoplay(allowed);
    });

    return () => {
      cancelled = true;
    };
  }, [anime.anime_id, session?.token]);

  const [playback, setPlayback] = useState<PlaybackSnapshot>();
  const localMedia = useRef<PlaybackMedia>(null);
  const media = watchMedia || localMedia;
  const fullscreenFrame = useRef<HTMLDivElement>(null);
  const currentSession = useRef<ReturnType<typeof createPlaybackSession>>();
  const checkpoints = useRef(new Map<number, WatchEntry>());
  const callbacks = useRef({ onCheckpoint, onPlayback });

  callbacks.current = { onCheckpoint, onPlayback };

  const selectionScope = `${anime.anime_id}:${session?.token || ''}:${preferredVoice || ''}:${preferredEpisode || ''}`;
  const initialized = useRef(selectionScope);

  useEffect(() => {
    if (!all.length) return;
    if (
      initialized.current === selectionScope &&
      all.some(
        video => video.number === episode && voiceKey(video.data.dubbing) === voiceKey(voice)
      )
    )
      return;
    initialized.current = selectionScope;

    const resumed = resumeSelection(all, history, preferredVoice);

    setVoice(resumed.data.dubbing);
    setEpisode(
      all.find(
        video =>
          video.number === preferredEpisode &&
          voiceKey(video.data.dubbing) === voiceKey(resumed.data.dubbing)
      )?.number || resumed.number
    );
  }, [resource.value, preferredVoice, preferredEpisode, selectionScope]);

  const videos = useMemo(() => voiceVideos(all, voice), [all, voice]);
  const current = videos.find(video => video.number === episode) || videos[0];
  const index = current ? videos.findIndex(video => video.number === current.number) : -1;
  const candidates = useMemo(
    () =>
      all.filter(
        video =>
          current &&
          video.number === current.number &&
          voiceKey(video.data.dubbing) === voiceKey(voice)
      ),
    [all, current?.number, voice]
  );
  const sourceScope = useMemo(
    () => candidates.map(video => video.video_id).join(','),
    [candidates]
  );
  const desktop = isDesktop();
  const sourceChoices = useMemo(
    () =>
      candidates.flatMap((video): SourceChoice[] => {
        const provider = streamSourceFamily(video.iframe_url);
        const videoId = video.video_id;
        if (!provider || (!desktop && provider !== 'CVH')) return [];
        if (provider === 'Kodik')
          return [
            { value: `${videoId}:hls`, label: 'Kodik · HLS', videoId, format: 'hls' },
            { value: `${videoId}:mp4`, label: 'Kodik · MP4', videoId, format: 'mp4' },
          ];
        return [{ value: String(videoId), label: provider, videoId }];
      }),
    [candidates, desktop]
  );
  const inventory = useResource(
    async signal => ({
      data: await inspectStreamQualities(candidates, signal),
      cached: false,
      savedAt: Date.now(),
    }),
    [candidates]
  );
  const [sourceChoice, setSourceChoice] = useState<{ scope: string; value: string }>();
  const manualSource =
    sourceChoice?.scope === sourceScope
      ? sourceChoices.find(choice => choice.value === sourceChoice.value)
      : undefined;
  const [failedSources, setFailedSources] = useState<{
    scope: string;
    ids: number[];
    kodikReserves: StreamResult[];
  }>({ scope: '', ids: EMPTY_IDS, kodikReserves: EMPTY_RESERVES });
  const failed = !manualSource && failedSources.scope === sourceScope ? failedSources : undefined;
  const excluded = failed?.ids ?? EMPTY_IDS;
  const kodikReserves = failed?.kodikReserves ?? EMPTY_RESERVES;
  const available = useMemo(
    () =>
      candidates.filter(video =>
        manualSource ? video.video_id === manualSource.videoId : !excluded.includes(video.video_id)
      ),
    [candidates, excluded, manualSource]
  );
  const availableSignature = useMemo(
    () => available.map(video => video.video_id).join(','),
    [available]
  );
  const recoveryAutoplay = useRef<boolean>();
  const recoveryMedia = useRef<{ muted: boolean; volume: number; rate: number }>();
  const preferredId = useMemo(() => {
    const recent = [...checkpoints.current.values()]
      .filter(entry => candidates.some(video => video.video_id === entry.videoId))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const preferred = resumeVideo(candidates, recent || history);

    return preferred?.video_id;
  }, [sourceScope]);
  const [refreshRequest, setRefreshRequest] = useState<{
    scope: string;
    videoId?: number;
    revision: number;
  }>({ scope: '', revision: 0 });
  const [qualityRevision, setQualityRevision] = useState(0);
  const targetQuality = preferredStreamQuality(settings.quality);
  const resolvingId =
    manualSource?.videoId ??
    (refreshRequest.scope === sourceScope &&
    available.some(video => video.video_id === refreshRequest.videoId)
      ? refreshRequest.videoId
      : preferredId);
  const streams = useResource<StreamResult | undefined>(
    async signal => {
      if (!current) return { data: undefined, cached: false, savedAt: 0 };
      const reserveStream = kodikReserves.length
        ? selectStream(
            kodikReserves.flatMap(source => source.streams),
            settings.quality
          )
        : undefined;
      const reserve =
        reserveStream && kodikReserves.find(source => source.streams.includes(reserveStream));
      let data: StreamResult | undefined;
      if (available.length) {
        try {
          data = await resolveStream(available, signal, {
            preferredVideoId: resolvingId,
            ...(!manualSource && sourceChoices.length && { quality: targetQuality }),
          });
        } catch (error) {
          if (!reserve || signal.aborted || navigator.onLine === false) throw error;
        }
      }
      if (data && manualSource?.format) {
        const selectedFormat =
          manualSource.format === 'mp4'
            ? kodikMp4(data)?.streams
            : data.streams.filter(stream => stream.type === 'hls');
        if (!selectedFormat?.length)
          throw new Error(`Поток Kodik · ${manualSource.format.toUpperCase()} недоступен.`);
        data = { ...data, streams: selectedFormat };
      }
      return { data: data ?? reserve, cached: false, savedAt: Date.now() };
    },
    [
      availableSignature,
      resolvingId,
      manualSource?.value,
      refreshRequest.revision,
      qualityRevision,
      kodikReserves,
    ]
  );
  const resolved = streams.value?.data;
  const result =
    resolved &&
    (available.some(video => video.video_id === resolved.videoId) ||
      kodikReserves.includes(resolved))
      ? resolved
      : undefined;
  const [settledFailure, setSettledFailure] = useState('');
  const failureKey = streams.error ? `${sourceScope}:${availableSignature}:${streams.error}` : '';

  useEffect(() => {
    setSettledFailure('');
    if (!failureKey) return;

    const timer = setTimeout(() => setSettledFailure(failureKey), STREAM_ERROR_DELAY_MS);

    return () => clearTimeout(timer);
  }, [failureKey]);

  const showStreamError = !!failureKey && settledFailure === failureKey;
  const active =
    all.find(video => video.video_id === result?.videoId) ||
    candidates.find(video => video.video_id === currentSession.current?.snapshot().videoId) ||
    current;
  const { selected, previewStream, variants } = useMemo(() => {
    if (!result) return {};

    const regular =
      result.provider === 'Kodik'
        ? result.streams.filter(stream => stream.type !== 'mp4')
        : result.streams;
    const onlyMp4Matches =
      !regular.some(stream => stream.quality === targetQuality) &&
      result.streams.some(stream => stream.quality === targetQuality && stream.type === 'mp4');
    const variants = regular.length && !onlyMp4Matches ? regular : result.streams;
    if (manualSource && !variants.some(stream => stream.quality <= targetQuality))
      return { variants };
    const stream = selectStream(variants, settings.quality);
    const lowest = variants.reduce(
      (current, variant) => (variant.quality < current.quality ? variant : current),
      stream
    );
    return { selected: stream, previewStream: lowest, variants };
  }, [result, settings.quality, targetQuality, manualSource]);
  const qualityUnavailable = !!(manualSource && result && !selected);
  const qualities = useMemo(
    () =>
      [
        ...new Set([
          ...(inventory.value?.data ?? []),
          ...(result?.streams.map(stream => stream.quality) ?? []),
        ]),
      ].sort((a, b) => a - b),
    [inventory.value, result]
  );
  const previewEpisode = current?.number || episode || preferredEpisode || history?.episode;
  const poster = imageUrl(
    anime.random_screenshots?.find(frame => frame.episode === previewEpisode)?.sizes.small ||
      (history?.episode === previewEpisode ? history?.preview : undefined) ||
      anime.poster?.medium ||
      anime.poster?.big
  );
  const frameKey = watchFrameKey(anime.anime_id, previewEpisode, session?.user.id);
  const savedFrame = useWatchFrame(frameKey);
  const fallbackImage = useCachedImage(poster);
  const loadingImage = savedFrame || fallbackImage;
  const skipMarkers = useMemo(
    () => mergeSkips(active?.skips, result?.skips),
    [active?.skips, result?.skips]
  );
  const watch = useMemo(() => {
    if (!active) return undefined;

    const previous = currentSession.current?.snapshot();
    const entries = [...checkpoints.current.values(), ...(history ? [history] : [])]
      .filter(
        entry =>
          entry.episode === active.number &&
          all.some(
            video =>
              video.video_id === entry.videoId &&
              voiceKey(video.data.dubbing) === voiceKey(active.data.dubbing)
          )
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const saved =
      previous?.episode === active.number &&
      voiceKey(previous.dubbing) === voiceKey(active.data.dubbing)
        ? { position: previous.position, duration: previous.duration }
        : videoPosition(
            active,
            entries[0] ? { ...entries[0], videoId: active.video_id } : undefined
          );
    const video = active;

    return createPlaybackSession({
      anime,
      video,
      token: session?.token || null,
      position: saved.position,
      duration: saved.duration,
      onCheckpoint: entry => {
        checkpoints.current.set(entry.videoId, entry);
        callbacks.current.onCheckpoint?.(entry);
      },
      onReport: event => callbacks.current.onPlayback?.(event),
      onChange: next => {
        if (currentSession.current?.snapshot().videoId !== video.video_id) return;
        setPlayback(previous => (sameSnapshot(previous, next) ? previous : next));
      },
    });
  }, [anime.anime_id, active?.video_id, session?.token]);

  currentSession.current = watch;

  const snapshot = playback?.videoId === active?.video_id ? playback : watch?.snapshot();

  useDiscordPresence(
    anime,
    active,
    !result && snapshot
      ? { ...snapshot, playing: false, reason: streams.error ? 'error' : 'sourcechange' }
      : snapshot
  );
  useAnimeDiscordContext(
    anime,
    overlay === 'voice'
      ? 'Выбирает озвучку'
      : overlay === 'player'
        ? 'Выбирает плеер'
        : episodesOpen
          ? 'Выбирает серию'
          : panel === 'comments'
            ? 'Читает комментарии'
            : !active && !resource.error && (resource.loading || all.length > 0)
              ? 'Смотрит · Загрузка'
              : undefined,
    query,
    200
  );

  const position = snapshot?.position || 0,
    duration = snapshot?.duration || result?.duration || 0;

  useLayoutEffect(() => {
    const flush = () => currentSession.current?.flush();

    const saveBeforeClose = (event: Event) => {
      const video = media.current;
      const watch = currentSession.current;
      if (!watch || !video || video.readyState < 2 || video.error) {
        flush();
        return;
      }
      video.prepareToClose?.((event as CustomEvent<PlaybackClosePositions>).detail);
      watch.update({
        reason: 'dispose',
        position: video.currentTime,
        duration: video.duration,
        playing: false,
        seeking: video.seeking,
        playbackRate: video.playbackRate,
      });
    };

    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    const timer = setInterval(flush, 10000);

    window.addEventListener('pagehide', flush);
    window.addEventListener(PLAYBACK_FLUSH, flush);
    window.addEventListener(PLAYBACK_SHUTDOWN, saveBeforeClose);
    document.addEventListener('visibilitychange', hidden);

    return () => {
      clearInterval(timer);
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener(PLAYBACK_FLUSH, flush);
      window.removeEventListener(PLAYBACK_SHUTDOWN, saveBeforeClose);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [media]);

  const choose = useCallback(
    (number: string, nextVoice = voice) => {
      watch?.flush();
      autoplay.current = true;
      recoveryAutoplay.current = undefined;
      recoveryMedia.current = undefined;
      setFailedSources({ scope: '', ids: EMPTY_IDS, kodikReserves: EMPTY_RESERVES });
      setSourceChoice(undefined);
      setEpisode(number);
      setVoice(nextVoice);
      setOverlay(null);
      if (panel === 'episodes') onPanelChange?.(null);
    },
    [voice, watch, panel, onPanelChange]
  );

  const prepareRecovery = useCallback(
    (playing: boolean) => {
      recoveryAutoplay.current = playing;
      if (media.current)
        recoveryMedia.current ??= {
          muted: media.current.muted,
          volume: media.current.volume,
          rate: selectedPlaybackRate(media.current),
        };
      watch?.flush();
    },
    [watch]
  );

  const retrySources = streams.retry;
  const retryStream = useCallback(() => {
    const video = media.current;
    if (video && video.readyState >= 2 && !video.error)
      prepareRecovery(!video.paused && !mediaAtEnd(video));
    setFailedSources({ scope: sourceScope, ids: EMPTY_IDS, kodikReserves: EMPTY_RESERVES });
    retrySources();
  }, [sourceScope, retrySources, prepareRecovery]);

  const refreshStream = useCallback(
    (playing: boolean) => {
      if (navigator.onLine === false || result?.provider !== 'Alloha') return false;
      prepareRecovery(playing);
      // A changed resource dependency discards the expired URL, including when
      // this is the only provider. A failed renewal can then show a retry action.
      setRefreshRequest(previous => ({
        scope: sourceScope,
        videoId: result.videoId,
        revision: previous.revision + 1,
      }));
      return true;
    },
    [prepareRecovery, result, sourceScope]
  );

  const resumeStream = useCallback(() => refreshStream(true), [refreshStream]);

  const streamFailed = useCallback(
    (playing: boolean) => {
      // An old session is not evidence that its provider is unavailable. Renew
      // it once; a failure of the fresh stream follows the ordinary fallbacks.
      if (
        result?.provider === 'Alloha' &&
        navigator.onLine !== false &&
        Date.now() - (streams.value?.savedAt || 0) >= STREAM_RESUME_REFRESH_MS
      )
        return refreshStream(playing);
      prepareRecovery(playing);
      if (navigator.onLine === false || !result || manualSource) return false;

      if (kodikReserves.includes(result)) {
        if (kodikReserves.length < 2) return false;
        setFailedSources(previous => ({
          scope: sourceScope,
          ids: candidates.map(video => video.video_id),
          kodikReserves: previous.kodikReserves.filter(reserve => reserve !== result),
        }));

        return true;
      }
      const reserve = selected?.type !== 'mp4' ? kodikMp4(result) : undefined;
      if (
        !reserve &&
        !kodikReserves.length &&
        !available.some(video => video.video_id !== result.videoId)
      )
        return false;
      setFailedSources(previous => {
        const ids = previous.scope === sourceScope ? previous.ids : EMPTY_IDS;
        const reserves = previous.scope === sourceScope ? previous.kodikReserves : EMPTY_RESERVES;

        return ids.includes(result.videoId)
          ? previous
          : {
              scope: sourceScope,
              ids: [...ids, result.videoId],
              kodikReserves: reserve ? [...reserves, reserve] : reserves,
            };
      });

      return true;
    },
    [
      prepareRecovery,
      refreshStream,
      result,
      streams.value?.savedAt,
      selected?.type,
      available,
      candidates,
      kodikReserves,
      manualSource,
      sourceScope,
    ]
  );

  const selectPlayer = useCallback(
    (video?: Video) => {
      if (video && active)
        onSelectPlayer?.(
          video,
          'source',
          video.number === current?.number ? position : 0,
          video.number === current?.number ? duration : 0
        );
    },
    [active, onSelectPlayer, current, position, duration]
  );

  const changeQuality = (quality: string) => {
    const target = preferredStreamQuality(quality);
    const canKeepSource =
      variants?.some(stream => stream.quality === target) &&
      (result?.provider !== 'Kodik' ||
        variants.some(stream => stream.quality === target && stream.type !== 'mp4'));
    const resolveAgain = !manualSource && sourceChoices.length > 0 && !canKeepSource;
    const noLowerQuality =
      manualSource && variants && !variants.some(stream => stream.quality <= target);
    if (resolveAgain || noLowerQuality) {
      const video = media.current;
      if (video && video.readyState >= 2 && !video.error)
        prepareRecovery(!video.paused && !mediaAtEnd(video));
    }
    if (resolveAgain) {
      setFailedSources({ scope: sourceScope, ids: EMPTY_IDS, kodikReserves: EMPTY_RESERVES });
      setQualityRevision(revision => revision + 1);
    }
    savePlaybackSettings({ quality });
  };

  const changeSource = (value: string) => {
    if (value && !sourceChoices.some(choice => choice.value === value)) return;
    const video = media.current;
    if (video && video.readyState >= 2 && !video.error)
      prepareRecovery(!video.paused && !mediaAtEnd(video));
    setFailedSources({ scope: sourceScope, ids: EMPTY_IDS, kodikReserves: EMPTY_RESERVES });
    setSourceChoice(value ? { scope: sourceScope, value } : undefined);
  };

  const retrySync = useCallback(() => watch?.flush(), [watch]);

  const updateMedia = useCallback(
    (event: MediaUpdate, playingStream: Stream) => {
      if (!watch) return;
      if (event.reason === 'loadedmetadata' && recoveryMedia.current && media.current) {
        const saved = recoveryMedia.current;

        media.current.muted = saved.muted;
        media.current.volume = saved.volume;
        setPlaybackRate(media.current, saved.rate);
        recoveryMedia.current = undefined;
      }
      watch.setStream(playingStream, result?.provider || active.data.player, !!result?.relay);
      watch.update(event);
    },
    [watch, result, active]
  );

  const restoreQuality = useCallback(
    (playingStream: Stream) => savePlaybackSettings({ quality: String(playingStream.quality) }),
    []
  );

  const openVoicePicker = useCallback(() => {
    onPanelChange?.(null);
    setQuery('');
    setOverlay('voice');
  }, [onPanelChange]);

  const previousEpisode = useCallback(
    () => choose(videos[index - 1].number),
    [choose, videos, index]
  );

  const nextEpisode = useCallback(() => choose(videos[index + 1].number), [choose, videos, index]);

  const switchToSource = useCallback(() => active && selectPlayer(active), [active, selectPlayer]);

  const openVoices = useCallback(() => {
    setQuery('');
    setOverlay('voice');
  }, []);

  const openPlayers = useCallback(() => {
    setQuery('');
    setOverlay('player');
  }, []);

  const changeAutoNext = useCallback((event: JSX.TargetedEvent<HTMLInputElement>) => {
    setAutoNext(event.currentTarget.checked);
    writeJSON('yumiwatch:auto-next', event.currentTarget.checked);
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const qualityPicker = (
    <label class="video-setting-field video-quality-choice">
      <span>Качество</span>
      <Dropdown
        aria-label="Качество видео"
        value={settings.quality}
        disabled={!qualities.length}
        onChange={changeQuality}
        options={[
          { value: 'auto', label: 'Авто · до 480p' },
          ...qualities.map(quality => ({ value: String(quality), label: `${quality}p` })),
          ...(settings.quality !== 'auto' && !qualities.includes(targetQuality)
            ? [
                {
                  value: settings.quality,
                  label: `${settings.quality}p · недоступно`,
                  disabled: true,
                },
              ]
            : []),
        ]}
      />
    </label>
  );
  const sourcePicker = !background && sourceChoices.length > 0 && (
    <label class="video-source-choice">
      <span>Источник потока</span>
      <Dropdown
        aria-label="Источник потока"
        value={manualSource?.value ?? ''}
        onChange={changeSource}
        options={[
          { value: '', label: 'Авто' },
          ...sourceChoices.map(choice => ({
            value: choice.value,
            label: sourceChoices.some(other => other.label === choice.label && other !== choice)
              ? `${choice.label} · ${choice.videoId}`
              : choice.label,
          })),
        ]}
      />
    </label>
  );
  const playerSettings = (
    <>
      <AutoSkipSettings />
      <AutoPictureInPictureSetting />
    </>
  );
  const streamInfo = result && selected && (
    <span class="video-stream-meta">
      {result.provider} · {snapshot?.quality || selected.quality}p · {selected.type.toUpperCase()}
      <span>
        {' '}
        · {selected.sourceHost || (!result.relay ? new URL(selected.url).hostname : 'Через сервер')}
      </span>
    </span>
  );
  const syncStatus =
    snapshot?.sync === 'saving' ? (
      'Сохраняем позицию…'
    ) : snapshot?.sync === 'saved' ? (
      session ? (
        'Позиция сохранена в Yummy'
      ) : (
        'Сохранено на устройстве'
      )
    ) : snapshot?.sync === 'error' ? (
      <button onClick={retrySync}>Сохранено локально · повторить синхронизацию</button>
    ) : null;

  const checkingAccount = !!session && !session.verified;
  const loadingEpisodes = resource.loading || (all.length > 0 && !current);
  const hasSurface = !!(
    selected &&
    current &&
    watch &&
    !checkingAccount &&
    !loadingEpisodes &&
    !resource.error &&
    all.length
  );
  const unavailable =
    !!resource.error ||
    showStreamError ||
    qualityUnavailable ||
    (!checkingAccount && !loadingEpisodes && !all.length);
  useEffect(() => {
    if (pip?.active && !hasSurface)
      void setPictureInPictureUnavailable(unavailable).catch(() => {});
  }, [pip?.active, hasSurface, unavailable]);
  const pipButton = pip && !background && <PictureInPictureButton pip={pip} floating />;

  if (checkingAccount)
    return (
      <>
        <p class="account-loading">Проверяем аккаунт для восстановления просмотра…</p>
        {pipButton}
      </>
    );
  if (loadingEpisodes)
    return (
      <>
        {loadingImage ? (
          <div class="player-frame player-skeleton">
            <PlaybackLoader label="Загружаем серии…" preview={loadingImage} />
          </div>
        ) : (
          <div class="player-skeleton skeleton" role="status" aria-label="Загрузка серий" />
        )}
        {pipButton}
      </>
    );
  if (resource.error)
    return (
      <>
        <ErrorState error={resource.error} retry={resource.retry} />
        {pipButton}
      </>
    );
  if (!all.length)
    return (
      <>
        <Empty title="Серии пока не появились">Попробуй вернуться позже.</Empty>
        {pipButton}
      </>
    );

  return (
    <section
      class={`watch-area mobile-watch universal-watch ${immersive ? 'immersive-player' : ''}`}
      id="watch"
      aria-label="Просмотр аниме"
    >
      <div class="watch-sticky">
        {!immersive && (
          <div class="watch-now">
            <span>
              <strong>Серия {current?.number}</strong>
              <span> · наш плеер</span>
            </span>
            <span class="watch-clock">
              {formatTime(position)}
              {duration > 0 && ` / ${formatTime(duration)}`}
            </span>
          </div>
        )}
        <div class="universal-stage" ref={fullscreenFrame}>
          {selected && current && watch ? (
            <VideoSurface
              key={active.video_id}
              fullscreenFrame={fullscreenContainer || fullscreenFrame}
              stream={selected}
              previewStream={previewStream}
              provider={result?.provider}
              caption={result?.caption}
              identity={active.video_id}
              start={watch.snapshot().position}
              autoplay={recoveryAutoplay.current ?? (autoplay.current || resumeAutoplay)}
              media={media}
              background={background}
              pip={pip}
              title={`${anime.title} — серия ${current.number}`}
              poster={poster}
              loadingImage={loadingImage}
              frameKey={frameKey}
              skips={skipMarkers}
              autoOpening={settings.autoSkipOpening}
              autoEnding={settings.autoSkipEnding}
              onUpdate={updateMedia}
              autoNext={autoNext}
              retry={retryStream}
              onStreamError={streamFailed}
              onResume={result?.provider === 'Alloha' ? resumeStream : undefined}
              onQualityError={restoreQuality}
              onBack={onBack}
              onVoice={immersive ? openVoicePicker : undefined}
              voiceLabel={voice.replace(/^Озвучка /, '')}
              onEpisodes={openEpisodes}
              onComments={onComments}
              settings={playerSettings}
              quality={qualityPicker}
              sourcePicker={sourcePicker}
              streamInfo={streamInfo}
              syncStatus={syncStatus}
              previous={index > 0 ? previousEpisode : undefined}
              next={index < videos.length - 1 ? nextEpisode : undefined}
            />
          ) : (
            <div class="player-frame native-placeholder">
              <PlaybackLoader
                preview={loadingImage}
                failed={showStreamError || qualityUnavailable}
                label={
                  qualityUnavailable
                    ? 'Качество недоступно'
                    : showStreamError
                      ? 'Не удалось загрузить видео'
                      : excluded.length
                        ? 'Пробуем другой источник…'
                        : 'Подбираем видеопоток…'
                }
                detail={
                  qualityUnavailable
                    ? `В выбранном потоке нет ${targetQuality}p или ниже. Выбери другое качество или источник.`
                    : showStreamError
                      ? excluded.length
                        ? `Резервные источники недоступны. ${streams.error}`
                        : streams.error
                      : excluded.length
                        ? 'Серия, озвучка и позиция сохраняются'
                        : undefined
                }
              >
                {!background && qualities.length > 0 && qualityPicker}
                {sourcePicker}
                {showStreamError && (
                  <>
                    <Button onClick={retryStream} variant="primary">
                      Повторить
                    </Button>
                    {immersive ? (
                      <Button onClick={onBack} variant="text">
                        Другие источники на странице аниме
                      </Button>
                    ) : (
                      <Button onClick={switchToSource} variant="text">
                        Плеер источника
                      </Button>
                    )}
                  </>
                )}
              </PlaybackLoader>
            </div>
          )}
          {!hasSurface && pipButton}
          {!selected && onBack && (
            <button class="native-state-back" onClick={onBack}>
              <Icon name="back" size={21} />
              Об аниме
            </button>
          )}
        </div>
      </div>

      {!immersive && (
        <>
          <div class="watch-source-buttons">
            <WatchPicker label="Озвучка" value={voice} onClick={openVoices} />
            <WatchPicker label="Плеер" value="Наш плеер" onClick={openPlayers} />
          </div>

          <div class="watch-preferences">
            <span class="player-settings-hint">
              Качество и автопропуск — в ⚙ настройках плеера.
            </span>
            <Toggle checked={autoNext} onChange={changeAutoNext}>
              Следующая серия автоматически
            </Toggle>
          </div>
          <button class="episode-launcher" aria-haspopup="dialog" onClick={openEpisodes}>
            <Icon name="list" size={23} />
            <span>
              <strong>Все серии</strong>
              <small>
                Выбрана {current?.number} из {videos.length}
              </small>
            </span>
            <Icon name="chevron" size={19} />
          </button>
          <p class="player-note">
            {result
              ? `${result.provider} · ${result.relay ? 'через сервер' : 'прямой поток'}`
              : 'Наш плеер'}
          </p>
        </>
      )}
      <Sidebar
        open={episodesOpen}
        title="Серии"
        subtitle={anime.title}
        close={closeEpisodes}
        className="episodes-sidebar"
      >
        {immersive && (
          <Toggle checked={autoNext} onChange={changeAutoNext} class="sidebar-auto-next">
            Следующая серия автоматически
          </Toggle>
        )}
        <SearchField
          value={query}
          onValueChange={setQuery}
          label="Найти серию"
          placeholder="Номер серии"
        />
        <EpisodeOptions
          anime={anime}
          videos={videos}
          history={
            snapshot && active
              ? {
                  anime,
                  episode: snapshot.episode,
                  videoId: snapshot.videoId,
                  group: groupKey(active),
                  updatedAt: Date.now(),
                  position: snapshot.position,
                  duration: snapshot.duration,
                }
              : undefined
          }
          checkpoints={[...checkpoints.current.values()].filter(entry =>
            all.some(
              video =>
                video.video_id === entry.videoId && voiceKey(video.data.dubbing) === voiceKey(voice)
            )
          )}
          episode={current.number}
          query={query}
          onSelect={choose}
        />
      </Sidebar>
      <Sidebar
        open={!background && immersive && overlay === 'voice'}
        title="Озвучка"
        subtitle={anime.title}
        close={closeOverlay}
        className="voices-sidebar"
      >
        <SearchField
          value={query}
          onValueChange={setQuery}
          label="Найти озвучку"
          placeholder="Название озвучки"
        />
        <VoiceOptions
          videos={all}
          voice={voice}
          episode={current.number}
          query={query}
          onSelect={choose}
        />
      </Sidebar>
      {!immersive && overlay && overlay !== 'episodes' && (
        <Sheet
          title={overlay === 'voice' ? 'Выбрать озвучку' : 'Выбрать плеер'}
          subtitle={anime.title}
          close={closeOverlay}
        >
          <SearchField
            value={query}
            onValueChange={setQuery}
            label={overlay === 'voice' ? 'Найти озвучку' : 'Найти плеер'}
            placeholder={overlay === 'voice' ? 'Название озвучки' : 'Название плеера'}
          />
          {overlay === 'player' ? (
            <SourceOptions
              videos={all}
              voice={voice}
              episode={current.number}
              query={query}
              onSelect={selectPlayer}
              onUniversal={closeOverlay}
            />
          ) : (
            <VoiceOptions
              videos={all}
              voice={voice}
              episode={current.number}
              query={query}
              onSelect={choose}
            />
          )}
        </Sheet>
      )}
    </section>
  );
};
