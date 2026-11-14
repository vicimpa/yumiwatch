import { useEffect, useMemo, useState } from 'preact/hooks';
import { animeVideos } from '../lib/api';
import { useResource } from '../lib/hooks';
import { groupKey, groupVideos, playerUrl, resumeVideo } from '../lib/player';
import { recordWatch } from '../lib/storage';
import type { Anime, Video, WatchEntry } from '../lib/types';
import { Icon } from './Icon';
import { CachedNotice, Empty, ErrorState, notify } from './UI';

export function Player({ anime, history }: { anime: Anime; history?: WatchEntry }) {
  const resource = useResource(signal => animeVideos(anime.anime_id, signal), [anime.anime_id]);
  const groups = useMemo(() => groupVideos(resource.value?.data || []), [resource.value]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState('');
  const [active, setActive] = useState<Video>();
  useEffect(() => {
    if (!groups.size) return;
    const key = history?.group && groups.has(history.group) ? history.group : groups.keys().next().value!;
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
    setActive(video); setSelectedEpisode(video.number);
    try { recordWatch(anime, video, groupKey(video)); } catch (error) { notify((error as Error).message); }
  };
  if (resource.loading) return <div class="player-skeleton skeleton" role="status" aria-label="Загрузка серий"/>;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.retry}/>;
  if (!groups.size) return <Empty icon="calendar" title="Серии пока не появились" action={<a class="button secondary" href={`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`} target="_blank" rel="noreferrer">Проверить на YummyAnime<Icon name="external" size={16}/></a>}>Здесь появятся доступные озвучки и плееры, когда их добавят в Yani.</Empty>;
  return <div class="watch-area" id="watch">
    <div class="section-heading"><div><h2>Устраивайся поудобнее</h2><p>{active ? `Серия ${active.number} · ${active.data.dubbing}` : 'Выбери озвучку и свою серию'}</p></div><span class="small-label">{videos.length} серий</span></div>
    {resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}
    <div class="player-frame">
      {active ? <iframe key={active.video_id} src={playerUrl(active.iframe_url)} title={`${anime.title} — серия ${active.number}, ${active.data.dubbing}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerPolicy="strict-origin-when-cross-origin"/> : <div class="player-placeholder"><button class="big-play" onClick={() => open(current)} aria-label={`Смотреть серию ${current?.number}`}><Icon name="play" size={30}/></button><h3>{history ? 'Продолжим с того же места?' : 'Твоя история начинается здесь'}</h3><p>Серия {current?.number} · {current?.data.dubbing}</p></div>}
    </div>
    <div class="player-controls"><label>Озвучка и плеер<select value={selectedGroup} onChange={event => {
      const key = event.currentTarget.value;
      const next = groups.get(key)!.videos.find(v => v.number === selectedEpisode) || groups.get(key)!.videos[0];
      setSelectedGroup(key); setSelectedEpisode(next.number); if (active) open(next);
    }}>{[...groups].map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><div class="episode-stepper"><button class="icon-button" disabled={index <= 0} onClick={() => open(videos[index - 1])} aria-label="Предыдущая серия"><Icon name="back"/></button><span>Серия {current?.number}</span><button class="icon-button" disabled={index < 0 || index >= videos.length - 1} onClick={() => open(videos[index + 1])} aria-label="Следующая серия"><Icon name="arrow"/></button></div></div>
    <div class="episodes" aria-label="Выбор серии">{videos.map(video => <button key={video.video_id} class={current?.video_id === video.video_id ? 'selected' : ''} aria-label={`Серия ${video.number}`} aria-pressed={current?.video_id === video.video_id} onClick={() => open(video)}>{video.number}</button>)}</div>
    <p class="player-note">Плееры предоставляют сторонние сервисы. Если видео не загружается, выбери другой плеер.{active && <> <a href={playerUrl(active.iframe_url)} target="_blank" rel="noreferrer">Открыть плеер отдельно ↗</a></>}</p>
  </div>;
}
