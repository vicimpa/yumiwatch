import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { animeVideos } from '../lib/api';
import { useResource, useSession } from '../lib/hooks';
import { groupKey, groupVideos, playbackMessage, playbackUrl, playerUrl, resumeVideo } from '../lib/player';
import { recordWatch } from '../lib/library';
import type { Anime, Video, WatchEntry } from '../lib/types';
import { Icon } from './Icon';
import { CachedNotice, Empty, ErrorState, notify } from './UI';

export function Player({ anime, history }: { anime: Anime; history?: WatchEntry }) {
  const session = useSession();
  return <PlayerContent key={session?.token || 'guest'} anime={anime} history={history}/>;
}
function PlayerContent({ anime, history }: { anime: Anime; history?: WatchEntry }) {
  const session = useSession();
  const scope = session?.verified ? session.token : session ? 'restoring' : 'guest';
  const resource = useResource(signal => animeVideos(anime.anime_id, signal), [anime.anime_id, scope]);
  const groups = useMemo(() => groupVideos(resource.value?.data || []), [resource.value]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState('');
  const [active, setActive] = useState<Video>();
  const [start, setStart] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const flushProgress = useRef<() => void>(() => {});
  useEffect(() => { setActive(undefined); }, [scope]);
  useEffect(() => {
    if (!groups.size) return;
    const resume = resumeVideo([...groups.values()].flatMap(group => group.videos), history);
    const key = history?.group && groups.has(history.group) ? history.group : groupKey(resume);
    setSelectedGroup(key);
    const video = resumeVideo(groups.get(key)!.videos, history);
    setSelectedEpisode(video?.number || '');
  }, [groups]);
  const group = groups.get(selectedGroup);
  const videos = group?.videos || [];
  const current = videos.find(v => v.number === selectedEpisode) || videos[0];
  const index = current ? videos.findIndex(v => v.video_id === current.video_id) : -1;
  const open = (video: Video | undefined) => {
    if (!video) return;
    if (session && !session.verified) { notify('Дождись проверки аккаунта или повтори вход.'); return; }
    flushProgress.current();
    const sameHistory = history?.videoId === video.video_id || (!history?.videoId && history?.episode === video.number);
    const position = sameHistory && (history?.updatedAt || 0) >= (video.watched?.date || 0) * 1000 ? history?.position || 0 : video.watched?.end_time || 0;
    setStart(position); setActive(video); setSelectedEpisode(video.number);
    void recordWatch(anime, video, groupKey(video), position, undefined, session?.token || null).catch(error => notify(error.message));
  };
  useEffect(() => {
    if (!active) return;
    const token = session?.token || null;
    const origin = new URL(playerUrl(active.iframe_url)).origin;
    let position = start; let duration = active.duration || 0; let dirty = false; let failed = false;
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      void recordWatch(anime, active, groupKey(active), position, duration, token).then(() => { failed = false; }).catch(error => { dirty = true; if (!failed) { notify(error.message); failed = true; } });
    };
    flushProgress.current = flush;
    const message = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== origin) return;
      const value = playbackMessage(event.data);
      if (!value) return;
      if (value.duration !== undefined) duration = value.duration;
      if (value.time !== undefined) {
        position = value.time; dirty = true;
        if (!duration && typeof event.data === 'string') iframe.current?.contentWindow?.postMessage('{"api":"duration"}', origin);
      }
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const timer = setInterval(flush, 10000);
    window.addEventListener('message', message); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); flush(); if (flushProgress.current === flush) flushProgress.current = () => {}; window.removeEventListener('message', message); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [active?.video_id, scope, start]);
  if (resource.loading) return <div class="player-skeleton skeleton" role="status" aria-label="Загрузка серий"/>;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.retry}/>;
  if (!groups.size) return <Empty icon="calendar" title="Серии пока не появились" action={<a class="button secondary" href={`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`} target="_blank" rel="noreferrer">Проверить на YummyAnime<Icon name="external" size={16}/></a>}>Здесь появятся доступные озвучки и плееры, когда их добавят в Yani.</Empty>;
  return <div class="watch-area" id="watch">
    <div class="section-heading"><div><h2>Устраивайся поудобнее</h2><p>{active ? `Серия ${active.number} · ${active.data.dubbing}` : 'Выбери озвучку и свою серию'}</p></div><span class="small-label">{videos.length} серий</span></div>
    {resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}
    <div class="player-frame">
      {active ? <iframe ref={iframe} key={active.video_id} src={playbackUrl(active, start)} title={`${anime.title} — серия ${active.number}, ${active.data.dubbing}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerPolicy="strict-origin-when-cross-origin"/> : <div class="player-placeholder"><button class="big-play" onClick={() => open(current)} aria-label={`Смотреть серию ${current?.number}`}><Icon name="play" size={30}/></button><h3>{history ? 'Продолжим с того же места?' : 'Твоя история начинается здесь'}</h3><p>Серия {current?.number} · {current?.data.dubbing}</p></div>}
    </div>
    <div class="player-controls"><label>Озвучка и плеер<select value={selectedGroup} onChange={event => {
      const key = event.currentTarget.value;
      const next = groups.get(key)!.videos.find(v => v.number === selectedEpisode) || groups.get(key)!.videos[0];
      setSelectedGroup(key); setSelectedEpisode(next.number); if (active) open(next);
    }}>{[...groups].map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><div class="episode-stepper"><button class="icon-button" disabled={index <= 0} onClick={() => open(videos[index - 1])} aria-label="Предыдущая серия"><Icon name="back"/></button><span>Серия {current?.number}</span><button class="icon-button" disabled={index < 0 || index >= videos.length - 1} onClick={() => open(videos[index + 1])} aria-label="Следующая серия"><Icon name="arrow"/></button></div></div>
    <div class="episodes" aria-label="Выбор серии">{videos.map(video => <button key={video.video_id} class={current?.video_id === video.video_id ? 'selected' : ''} aria-label={`Серия ${video.number}`} aria-pressed={current?.video_id === video.video_id} onClick={() => open(video)}>{video.number}</button>)}</div>
    <p class="player-note">Плееры предоставляют сторонние сервисы. Позиция сохраняется у поддерживаемых плееров; у остальных — открытая серия. Если видео не загружается, выбери другой плеер.{active && <> <a href={playerUrl(active.iframe_url)} target="_blank" rel="noreferrer">Открыть плеер отдельно ↗</a></>}</p>
  </div>;
}
