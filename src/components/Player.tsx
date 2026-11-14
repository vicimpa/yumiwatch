import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { animeVideos, imageUrl } from '../lib/api';
import { useMediaQuery, useResource, useSession } from '../lib/hooks';
import { formatTime, groupKey, groupVideos, playbackEvent, playbackMessage, playbackUrl, playerCommand, playerUrl, resumeVideo, videoPosition } from '../lib/player';
import { recordWatch } from '../lib/library';
import { readJSON, writeJSON } from '../lib/storage';
import type { Anime, Video, WatchEntry } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { CachedNotice, Empty, ErrorState, notify } from './UI';

interface PlayerProps { anime: Anime; history?: WatchEntry; onCheckpoint?: (entry: WatchEntry) => void }
export function Player({ anime, history, onCheckpoint }: PlayerProps) {
  const session = useSession();
  return <PlayerContent key={session?.token || 'guest'} anime={anime} history={history} onCheckpoint={onCheckpoint}/>;
}
function PlayerContent({ anime, history, onCheckpoint }: PlayerProps) {
  const session = useSession();
  const mobile = useMediaQuery('(max-width: 760px)');
  const [overlay, setOverlay] = useState<'episodes' | 'dubbing' | 'player' | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const scope = session?.verified ? session.token : session ? 'restoring' : 'guest';
  const resource = useResource(signal => animeVideos(anime.anime_id, signal), [anime.anime_id, scope]);
  const groups = useMemo(() => groupVideos(resource.value?.data || []), [resource.value]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [autoNext, setAutoNext] = useState(() => readJSON('yumiwatch:auto-next', false));
  const [showPreviews, setShowPreviews] = useState(() => readJSON('yumiwatch:episode-previews', true));
  const [progress, setProgress] = useState<Record<number, { position: number; duration: number }>>({});
  const iframe = useRef<HTMLIFrameElement>(null);
  const flushProgress = useRef<() => void>(() => {});
  const playOnLoad = useRef(false);
  const autoNextRef = useRef(autoNext); autoNextRef.current = autoNext;
  useEffect(() => {
    if (!groups.size) return;
    const all = [...groups.values()].flatMap(group => group.videos);
    let resume = resumeVideo(all, history);
    if (!history && !all.some(video => video.watched?.date)) {
      const preferred = readJSON<{ dubbing?: string; player?: number }>('yumiwatch:player-preference', {});
      resume = all.find(video => video.data.dubbing === preferred.dubbing && video.data.player_id === preferred.player) || all.find(video => video.data.dubbing === preferred.dubbing) || resume;
    }
    setSelectedGroup(groupKey(resume)); setSelectedEpisode(resume.number);
  }, [groups]);
  const videos = groups.get(selectedGroup)?.videos || [];
  const current = videos.find(video => video.number === selectedEpisode) || videos[0];
  const index = current ? videos.findIndex(video => video.video_id === current.video_id) : -1;
  const initial = useMemo(() => {
    const saved = current ? videoPosition(current, history) : { position: 0, duration: 0 };
    return saved.duration > 0 && saved.duration - saved.position <= 20 ? { ...saved, position: 0 } : saved;
  }, [current?.video_id, scope]);
  const send = (command: 'play' | 'pause' | 'seek', seconds = 0) => {
    if (!current) return;
    const value = playerCommand(current, command, seconds);
    if (value !== null) iframe.current?.contentWindow?.postMessage(value, new URL(playerUrl(current.iframe_url)).origin);
  };
  const choose = (video: Video | undefined, closeOverlay = true) => {
    if (!video) return;
    flushProgress.current();
    if (closeOverlay) { setOverlay(null); if (mobile) requestAnimationFrame(() => document.getElementById('watch')?.scrollIntoView?.({ block: 'start', behavior: 'instant' })); }
    writeJSON('yumiwatch:player-preference', { dubbing: video.data.dubbing, player: video.data.player_id });
    playOnLoad.current = true;
    setSelectedGroup(groupKey(video)); setSelectedEpisode(video.number);
    if (current?.video_id === video.video_id) send('play');
  };
  useLayoutEffect(() => {
    if (!current) return;
    const token = session?.token || null;
    const origin = new URL(playerUrl(current.iframe_url)).origin;
    const observesPlayback = playerCommand(current, 'play') !== null;
    let time = initial.position; let length = initial.duration; let dirty = false; let started = false; let restored = false; let failed = false;
    setPosition(time); setDuration(length);
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      onCheckpoint?.({ anime, episode: current.number, videoId: current.video_id, group: groupKey(current), updatedAt: Date.now(), position: time, duration: length });
      void recordWatch(anime, current, groupKey(current), time, length, token).then(() => { failed = false; }).catch(error => { dirty = true; if (!failed) { notify(error.message); failed = true; } });
    };
    flushProgress.current = flush;
    const message = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== origin) return;
      const playback = playbackEvent(event.data);
      if (playback === 'play' && !started) { started = true; dirty = true; flush(); }
      const value = playbackMessage(event.data);
      if (value?.duration !== undefined) {
        length = value.duration; setDuration(length);
        if (length > 0 && !restored && initial.position > 5) { restored = true; send('seek', Math.max(0, initial.position - 5)); }
      }
      if (value?.time !== undefined) {
        time = value.time; setPosition(Math.floor(time));
        if (started) dirty = true;
        setProgress(previous => ({ ...previous, [current.video_id]: { position: time, duration: length } }));
        if (!length && typeof event.data === 'string') iframe.current?.contentWindow?.postMessage('{"api":"duration"}', origin);
        if (!started && time > 0 && !observesPlayback) { started = true; dirty = true; flush(); }
      }
      if (playback === 'pause') flush();
      if (playback === 'ended') {
        if (length) time = length;
        dirty = true; flush();
        if (autoNextRef.current) choose(videos[index + 1], false);
      }
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const timer = setInterval(flush, 10000);
    window.addEventListener('message', message); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); flush(); if (flushProgress.current === flush) flushProgress.current = () => {}; window.removeEventListener('message', message); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [current?.video_id, scope]);
  if (session && !session.verified) return <div class="account-loading" role="status">Проверяем аккаунт для восстановления просмотра.<br/><a class="text-link" href="#/account">Проверить вход</a></div>;
  if (resource.loading || (groups.size > 0 && !current)) return <div class="player-skeleton skeleton" role="status" aria-label="Загрузка серий"/>;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.retry}/>;
  if (!groups.size || !current) return <Empty icon="calendar" title="Серии пока не появились" action={<a class="button secondary" href={`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`} target="_blank" rel="noreferrer">Проверить на YummyAnime<Icon name="external" size={16}/></a>}>Здесь появятся доступные озвучки и плееры, когда их добавят в Yani.</Empty>;
  const dubbings = [...new Set([...groups.values()].map(group => group.videos[0].data.dubbing))];
  const providers = [...groups].filter(([, group]) => group.videos[0].data.dubbing === current.data.dubbing);
  const canSeek = playerCommand(current, 'seek', 0) !== null;
  const skip = [current.skips?.opening, current.skips?.ending].find(segment => segment && position >= segment.time && position < segment.time + segment.length);
  const episodePanel = <>
    <div class="episode-toolbar"><h2>Серии <span>{videos.length}</span></h2><label class="watch-toggle"><input type="checkbox" checked={showPreviews} onChange={event => { setShowPreviews(event.currentTarget.checked); writeJSON('yumiwatch:episode-previews', event.currentTarget.checked); }}/>Кадры</label></div>
    {videos.length > 24 && <input class="episode-search" type="search" inputMode="numeric" placeholder="Номер серии" aria-label="Найти серию" value={episodeQuery} onInput={event => setEpisodeQuery(event.currentTarget.value)}/>}
    <div class={`episode-cards ${showPreviews ? '' : 'numbers-only'}`} aria-label="Выбор серии">{videos.filter(video => !episodeQuery || video.number.includes(episodeQuery)).map(video => {
      const frame = anime.random_screenshots?.find(frame => frame.episode === video.number);
      const saved = progress[video.video_id] || videoPosition(video, history);
      const percent = saved.duration > 0 ? Math.min(100, saved.position / saved.duration * 100) : 0;
      const preview = imageUrl(frame?.sizes.small || anime.poster?.medium || anime.poster?.big);
      return <button key={video.video_id} class={current.video_id === video.video_id ? 'episode-card selected' : 'episode-card'} aria-label={`Серия ${video.number}`} aria-pressed={current.video_id === video.video_id} onClick={() => choose(video)}>{showPreviews && <div class={`episode-preview ${frame ? '' : 'poster-preview'}`}>{preview && <img src={preview} alt={frame ? `Кадр серии ${video.number}` : ''} loading="lazy" decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden'; }}/>}<span class="episode-play"><Icon name={current.video_id === video.video_id ? 'play' : percent >= 95 ? 'check' : 'play'} size={20}/></span>{saved.duration > 0 && <span class="episode-duration">{formatTime(saved.duration)}</span>}{percent > 0 && <span class="episode-progress" style={{ width: `${percent}%` }}/>}</div>}<span class="episode-caption"><strong>{showPreviews ? `Серия ${video.number}` : video.number}</strong>{showPreviews && <small>{saved.position > 0 ? `Просмотрено ${formatTime(saved.position)}` : current.video_id === video.video_id ? 'Выбрана' : frame ? 'Смотреть' : 'Без превью'}</small>}</span></button>;
    })}</div>
  </>;
  return <section class="watch-area mobile-watch" id="watch" aria-label="Просмотр аниме">
    <div class="watch-sticky"><div class="watch-now"><span><strong>Серия {current.number}</strong><span> · {current.data.dubbing.replace(/^Озвучка /, '')}</span></span><span class="watch-clock">{formatTime(position)}{duration > 0 && ` / ${formatTime(duration)}`}</span></div>
      <div class="player-frame"><iframe ref={iframe} key={current.video_id} src={playbackUrl(current, initial.position)} title={`${anime.title} — серия ${current.number}, ${current.data.dubbing}`} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => { if (playOnLoad.current) { playOnLoad.current = false; send('play'); } }}/></div>
      <div class="watch-transport"><button disabled={index <= 0} onClick={() => choose(videos[index - 1])} aria-label="Предыдущая серия"><Icon name="back" size={18}/><span>Пред.</span></button><button disabled={!canSeek} onClick={() => send('seek', Math.max(0, position - 10))} aria-label="Назад на 10 секунд">−10 с</button><button disabled={!canSeek} onClick={() => send('seek', Math.min(duration || Infinity, position + 10))} aria-label="Вперёд на 10 секунд">+10 с</button>{skip && canSeek ? <button class="skip-opening" onClick={() => send('seek', skip.time + skip.length)}>Пропустить</button> : <button onClick={() => { const element = iframe.current; if (element?.requestFullscreen) void element.requestFullscreen().catch(() => notify('Открой полный экран кнопкой внутри плеера.')); else notify('Открой полный экран кнопкой внутри плеера.'); }} aria-label="Полный экран"><Icon name="external" size={18}/></button>}<button disabled={index >= videos.length - 1} onClick={() => choose(videos[index + 1])} aria-label="Следующая серия"><span>След.</span><Icon name="arrow" size={18}/></button></div>
    </div>
    {resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}
    {initial.position > 5 && <div class="resume-notice"><Icon name="clock" size={17}/><span>Остановились на <strong>{formatTime(initial.position)}</strong> · серия {current.number}</span><button onClick={() => send('seek', 0)} disabled={!canSeek}>Сначала</button></div>}
    {mobile ? <div class="watch-source-buttons"><button aria-haspopup="dialog" aria-label={`Озвучка: ${current.data.dubbing}`} onClick={() => { setSourceQuery(''); setOverlay('dubbing'); }}><span><small>Озвучка</small><strong>{current.data.dubbing.replace(/^Озвучка /, '')}</strong></span><Icon name="chevron" size={17}/></button><button aria-haspopup="dialog" aria-label={`Плеер: ${current.data.player}`} onClick={() => { setSourceQuery(''); setOverlay('player'); }}><span><small>Плеер</small><strong>{current.data.player.replace(/^Плеер /, '')}</strong></span><Icon name="chevron" size={17}/></button></div> : <div class="watch-selectors"><label>Озвучка<select value={current.data.dubbing} onChange={event => { const match = [...groups.values()].find(group => group.videos[0].data.dubbing === event.currentTarget.value); if (match) choose(match.videos.find(video => video.number === current.number) || match.videos[0]); }}>{dubbings.map(dubbing => <option key={dubbing} value={dubbing}>{dubbing}</option>)}</select></label><label>Плеер<select value={selectedGroup} onChange={event => { const group = groups.get(event.currentTarget.value); if (group) choose(group.videos.find(video => video.number === current.number) || group.videos[0]); }}>{providers.map(([key, group]) => <option key={key} value={key}>{group.videos[0].data.player}</option>)}</select></label></div>}
    <div class="watch-preferences"><label class="watch-toggle"><input type="checkbox" checked={autoNext} onChange={event => { setAutoNext(event.currentTarget.checked); writeJSON('yumiwatch:auto-next', event.currentTarget.checked); }}/>Следующая серия автоматически</label></div>
    {mobile ? <><button class="episode-launcher" aria-haspopup="dialog" onClick={() => setOverlay('episodes')}><Icon name="list" size={23}/><span><strong>Все серии</strong><small>Выбрана {current.number} из {videos.length}</small></span><Icon name="chevron" size={19}/></button>{videos[index + 1] && <button class="next-episode-card" onClick={() => choose(videos[index + 1])}><div>{imageUrl(anime.random_screenshots?.find(frame => frame.episode === videos[index + 1].number)?.sizes.small || anime.poster?.medium) && <img src={imageUrl(anime.random_screenshots?.find(frame => frame.episode === videos[index + 1].number)?.sizes.small || anime.poster?.medium)} alt="" loading="lazy"/>}<Icon name="play" size={24}/></div><span><small>Далее</small><strong>Серия {videos[index + 1].number}</strong>{!!videos[index + 1].duration && <span>{formatTime(videos[index + 1].duration!)}</span>}</span><Icon name="arrow" size={19}/></button>}</> : episodePanel}
    {overlay && <Sheet title={overlay === 'episodes' ? 'Серии' : overlay === 'dubbing' ? 'Выбрать озвучку' : 'Выбрать плеер'} subtitle={overlay === 'episodes' ? anime.title : `Серия ${current.number} · ${current.data.dubbing.replace(/^Озвучка /, '')}`} close={() => setOverlay(null)} className={overlay === 'episodes' ? 'episodes-screen' : 'sources-screen'}>{overlay === 'episodes' ? episodePanel : <><div class="source-search"><Icon name="search" size={18}/><input type="search" value={sourceQuery} onInput={event => setSourceQuery(event.currentTarget.value)} placeholder={overlay === 'dubbing' ? 'Название озвучки' : 'Название плеера'} aria-label="Поиск варианта просмотра"/></div><div class="source-options">{(overlay === 'dubbing' ? dubbings.map(dubbing => { const group = [...groups.values()].find(group => group.videos[0].data.dubbing === dubbing)!; return { label: dubbing, videos: group.videos, selected: current.data.dubbing === dubbing }; }) : providers.map(([, group]) => ({ label: group.videos[0].data.player, videos: group.videos, selected: group.videos[0].data.player_id === current.data.player_id }))).filter(option => option.label.toLocaleLowerCase().includes(sourceQuery.toLocaleLowerCase())).map(option => <button key={option.label} class={option.selected ? 'source-option selected' : 'source-option'} onClick={() => { const next = option.videos.find(video => video.number === current.number) || option.videos[0]; if (next.number !== current.number) notify(`Серия ${current.number} здесь недоступна. Выбрана серия ${next.number}.`); choose(next); }}><span><strong>{option.label}</strong><small>{option.videos.length} серий</small></span>{option.selected && <Icon name="check" size={21}/>}</button>)}</div></>}</Sheet>}
    <p class="player-note">Нажми Play прямо в плеере. Позиция восстанавливается у совместимых плееров.{<a href={playerUrl(current.iframe_url)} target="_blank" rel="noreferrer"> Открыть отдельно ↗</a>}</p>
  </section>;
}
