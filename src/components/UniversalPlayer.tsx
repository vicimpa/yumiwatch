import { SEARCH_INPUT_PROPS } from '../lib/search';
import { CachedImage } from './CachedImage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { animeVideos,peekAnimeVideos, imageUrl } from '../lib/api';
import { useResource, useSession } from '../lib/hooks';
import { formatTime, resumeVideo, videoPosition } from '../lib/player';
import { PLAYBACK_FLUSH, savePlaybackSettings, usePlaybackSettings } from '../lib/playback-settings';
import { resolveStream, selectStream, voiceKey, voiceVideos } from '../lib/streams';
import { readJSON, writeJSON } from '../lib/storage';
import type { Anime, Video, WatchEntry } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Sidebar } from './Sidebar';
import { Empty, ErrorState } from './UI';
import { STREAM_ERROR_DELAY_MS, VideoSurface } from './VideoSurface';
import { AutoSkipSettings } from './PlaybackSettings';
import { createPlaybackSession, type PlaybackReport, type PlaybackSnapshot } from '../lib/playback-session';
import { mergeSkips } from '../../shared/skips.mjs';
import { Select } from './Select';
import { PlaybackLoader } from './PlaybackLoader';
import type { PlayerProps } from './Player';
import { WatchPicker } from './WatchPicker';
import { groupVideos } from '../lib/player';
import { probeAudioPlayback } from '../lib/autoplay';

export function UniversalPlayer({ anime, history, onCheckpoint, onPlayback, onSelectPlayer, panel, onPanelChange, onComments, fullscreenContainer, preferredVoice, preferredEpisode, startPlaying, presentation, onBack }: PlayerProps) {
  const immersive=presentation==='immersive';
  const session=useSession();const settings=usePlaybackSettings();
  const resource=useResource(signal=>animeVideos(anime.anime_id,signal),[anime.anime_id,session?.token,session?.verified],()=>peekAnimeVideos(anime.anime_id));
  const all=resource.value?.data||[];
  const voices=[...new Map(all.map(video=>[voiceKey(video.data.dubbing),video.data.dubbing])).values()];
  const initial=resumeVideo(preferredVoice?all.filter(video=>voiceKey(video.data.dubbing)===voiceKey(preferredVoice)):all,history)||resumeVideo(all,history);
  const [voice,setVoice]=useState(()=>initial?.data.dubbing||'');const [episode,setEpisode]=useState(()=>all.find(video=>video.number===preferredEpisode&&voiceKey(video.data.dubbing)===voiceKey(initial?.data.dubbing||''))?.number||initial?.number||'');const [overlay,setOverlay]=useState<'voice'|'episodes'|'player'|null>(null);const [query,setQuery]=useState('');
  useEffect(()=>{if(panel)setOverlay(null);},[panel]);
  const episodesOpen=panel===undefined?overlay==='episodes':panel==='episodes';
  const openEpisodes=()=>{setQuery('');if(onPanelChange)onPanelChange('episodes');else setOverlay('episodes');};
  const closeEpisodes=()=>{if(onPanelChange)onPanelChange(null);else setOverlay(null);};
  const [autoNext,setAutoNext]=useState(()=>readJSON('yumiwatch:auto-next',false)); const autoplay=useRef(startPlaying===true);
  const [resumeAutoplay, setResumeAutoplay] = useState(false);
  useEffect(() => {
    if (!history?.playing) return;
    let cancelled = false;
    void probeAudioPlayback().then(allowed => { if (!cancelled) setResumeAutoplay(allowed); });
    return () => { cancelled = true; };
  }, [anime.anime_id, session?.token]);
  const [playback,setPlayback]=useState<PlaybackSnapshot>(); const media=useRef<HTMLVideoElement>(null); const fullscreenFrame=useRef<HTMLDivElement>(null);
  const currentSession=useRef<ReturnType<typeof createPlaybackSession>>();
  const checkpoints=useRef(new Map<number,WatchEntry>());
  const callbacks=useRef({onCheckpoint,onPlayback});callbacks.current={onCheckpoint,onPlayback};
  const selectionScope=`${anime.anime_id}:${session?.token||''}:${preferredVoice||''}:${preferredEpisode||''}`;
  const initialized=useRef(selectionScope);
  useEffect(()=>{
    if(!all.length)return;
    if(initialized.current===selectionScope&&all.some(video=>video.number===episode&&voiceKey(video.data.dubbing)===voiceKey(voice)))return;
    initialized.current=selectionScope;
    const resumed=resumeVideo(preferredVoice?all.filter(video=>voiceKey(video.data.dubbing)===voiceKey(preferredVoice)):all,history)||resumeVideo(all,history);
    setVoice(resumed.data.dubbing);setEpisode(all.find(video=>video.number===preferredEpisode&&voiceKey(video.data.dubbing)===voiceKey(resumed.data.dubbing))?.number||resumed.number);
  },[resource.value,preferredVoice,preferredEpisode,selectionScope]);
  const videos=useMemo(()=>voiceVideos(all,voice),[resource.value,voice]);const current=videos.find(video=>video.number===episode)||videos[0];const index=current?videos.findIndex(video=>video.number===current.number):-1;
  const candidates=all.filter(video=>current&&video.number===current.number&&voiceKey(video.data.dubbing)===voiceKey(voice));const signature=candidates.map(video=>video.video_id).join(',');
  const sourceScope=signature;
  const [failedSources,setFailedSources]=useState<{scope:string;ids:number[];providers?:string[]}>({scope:'',ids:[]});
  const excluded=failedSources.scope===sourceScope?failedSources.ids:[];
  const available=candidates.filter(video=>!excluded.includes(video.video_id));
  const availableSignature=available.map(video=>video.video_id).join(',');
  const recoveryAutoplay=useRef<boolean>();
  const recoveryMedia=useRef<{muted:boolean;volume:number;rate:number}>();
  const preferredId=useMemo(()=>{const recent=[...checkpoints.current.values()].filter(entry=>candidates.some(video=>video.video_id===entry.videoId)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];const preferred=resumeVideo(candidates,recent||history);return preferred?.video_id;},[signature]);
  const streams=useResource(signal=>current?resolveStream(available,signal,{preferredVideoId:preferredId}).then(data=>({data,cached:false,savedAt:Date.now()})):Promise.resolve({data:undefined,cached:false,savedAt:0}),[availableSignature,preferredId]);
  const result=streams.value?.data&&available.some(video=>video.video_id===streams.value!.data!.videoId)?streams.value.data:undefined;
  const [settledFailure,setSettledFailure]=useState('');
  const failureKey=streams.error?`${sourceScope}:${availableSignature}:${streams.error}`:'';
  useEffect(()=>{
    setSettledFailure('');
    if(!failureKey)return;
    const timer=setTimeout(()=>setSettledFailure(failureKey),STREAM_ERROR_DELAY_MS);
    return()=>clearTimeout(timer);
  },[failureKey]);
  const showStreamError=!!failureKey&&settledFailure===failureKey;
  const active=all.find(video=>video.video_id===result?.videoId)||candidates.find(video=>video.video_id===currentSession.current?.snapshot().videoId)||current;
  const selected=result?selectStream(result.streams,settings.quality):undefined;
  const watch=useMemo(()=>{
    if(!active)return undefined;
    const previous = currentSession.current?.snapshot();
    const entries = [...checkpoints.current.values(), ...(history ? [history] : [])].filter(entry => entry.episode === active.number && all.some(video => video.video_id === entry.videoId && voiceKey(video.data.dubbing) === voiceKey(active.data.dubbing))).sort((a,b) => b.updatedAt-a.updatedAt);
    const saved = previous?.episode === active.number && voiceKey(previous.dubbing) === voiceKey(active.data.dubbing)
      ? { position: previous.position, duration: previous.duration }
      : videoPosition(active, entries[0] ? { ...entries[0], videoId: active.video_id } : undefined);
    const video=active;
    return createPlaybackSession({anime,video,token:session?.token||null,position:saved.position,duration:saved.duration,
      onCheckpoint:entry=>{checkpoints.current.set(entry.videoId,entry);callbacks.current.onCheckpoint?.(entry);},onReport:event=>callbacks.current.onPlayback?.(event),
      onChange:next=>{if(currentSession.current?.snapshot().videoId!==video.video_id)return;setPlayback(previous=>previous?.videoId===next.videoId&&Math.floor(previous.position)===Math.floor(next.position)&&Math.floor(previous.watchedSeconds)===Math.floor(next.watchedSeconds)&&previous.duration===next.duration&&previous.sync===next.sync&&previous.playing===next.playing&&previous.quality===next.quality?previous:next);}
    });
  },[anime.anime_id,active?.video_id,session?.token]);
  currentSession.current=watch;
  const snapshot=playback?.videoId===active?.video_id?playback:watch?.snapshot();
  const position=snapshot?.position||0,duration=snapshot?.duration||result?.duration||0;
  useLayoutEffect(()=>{
    const flush=()=>currentSession.current?.flush();const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    const timer=setInterval(flush,10000);window.addEventListener('pagehide',flush);window.addEventListener(PLAYBACK_FLUSH,flush);document.addEventListener('visibilitychange',hidden);
    return()=>{clearInterval(timer);flush();window.removeEventListener('pagehide',flush);window.removeEventListener(PLAYBACK_FLUSH,flush);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  const choose=(number:string,nextVoice=voice)=>{watch?.flush();autoplay.current=true;recoveryAutoplay.current=undefined;recoveryMedia.current=undefined;setFailedSources({scope:'',ids:[]});setEpisode(number);setVoice(nextVoice);setOverlay(null);if(panel==='episodes')onPanelChange?.(null);};
  const retryStream=()=>{setFailedSources({scope:sourceScope,ids:[]});streams.retry();};
  const streamFailed=(playing:boolean)=>{
    recoveryAutoplay.current=playing;
    if(media.current)recoveryMedia.current={muted:media.current.muted,volume:media.current.volume,rate:media.current.playbackRate};
    watch?.flush();
    if(navigator.onLine===false||!result||!available.some(video=>video.video_id!==result.videoId))return false;
    setFailedSources(previous=>{
      const ids=previous.scope===sourceScope?previous.ids:[];
      return ids.includes(result.videoId)?previous:{scope:sourceScope,ids:[...ids,result.videoId],providers:[...(previous.scope===sourceScope?previous.providers||[]:[]),result.provider]};
    });
    return true;
  };
  const selectPlayer = (video?: Video) => { if (video && active) onSelectPlayer?.(video, 'source', video.number === current?.number ? position : 0, video.number === current?.number ? duration : 0); };
  const qualityPicker = <label class="video-setting-field"><span>Качество</span><Select aria-label="Качество видео" value={selected?.quality||settings.quality} disabled={!result} onChange={event=>savePlaybackSettings({quality:event.currentTarget.value})}>{result?result.streams.map(stream=><option key={stream.quality} value={stream.quality}>{stream.quality}p</option>):<option value={settings.quality}>{settings.quality==='auto'?'Авто':`${settings.quality}p`}</option>}</Select></label>;
  const playerSettings = <AutoSkipSettings/>;
  const streamInfo = result && selected && <span class="video-stream-meta">{result.provider} · {snapshot?.quality||selected.quality}p · {selected.type.toUpperCase()}<span> · {selected.sourceHost||(!result.relay?new URL(selected.url).hostname:'Через сервер')}</span></span>;
  const syncStatus = snapshot?.sync === 'saving' ? 'Сохраняем позицию…' : snapshot?.sync === 'saved' ? (session ? 'Позиция сохранена в Yani' : 'Сохранено на устройстве') : snapshot?.sync === 'error' ? <button onClick={()=>watch?.flush()}>Сохранено локально · повторить синхронизацию</button> : null;

  if(session&&!session.verified)return <p class="account-loading">Проверяем аккаунт для восстановления просмотра…</p>;
  if(resource.loading || all.length > 0 && !current)return <div class="player-skeleton skeleton" role="status" aria-label="Загрузка серий"/>;
  if(resource.error)return <ErrorState error={resource.error} retry={resource.retry}/>;
  if(!all.length)return <Empty title="Серии пока не появились">Попробуй вернуться позже.</Empty>;
  return <section class={`watch-area mobile-watch universal-watch ${immersive?'immersive-player':''}`} id="watch" aria-label="Просмотр аниме"><div class="watch-sticky">{!immersive&&<div class="watch-now"><span><strong>Серия {current?.number}</strong><span> · наш плеер</span></span><span class="watch-clock">{formatTime(position)}{duration>0&&` / ${formatTime(duration)}`}</span></div>}
    <div class="universal-stage" ref={fullscreenFrame}>{selected&&current&&watch?<VideoSurface key={active.video_id} fullscreenFrame={fullscreenContainer||fullscreenFrame} stream={selected} provider={result?.provider} caption={result?.caption} identity={active.video_id} start={watch.snapshot().position} autoplay={recoveryAutoplay.current??(autoplay.current||resumeAutoplay)} media={media} title={`${anime.title} — серия ${current.number}`} poster={imageUrl(anime.random_screenshots?.find(frame=>frame.episode===current.number)?.sizes.small||anime.poster?.medium)} skips={mergeSkips(active.skips,result?.skips)} autoOpening={settings.autoSkipOpening} autoEnding={settings.autoSkipEnding} onUpdate={(event,playingStream)=>{if(event.reason==='loadedmetadata'&&recoveryMedia.current&&media.current){const saved=recoveryMedia.current;media.current.muted=saved.muted;media.current.volume=saved.volume;media.current.playbackRate=saved.rate;recoveryMedia.current=undefined;}watch.setStream(playingStream,result?.provider||active.data.player,!!result?.relay);watch.update(event);}} autoNext={autoNext} retry={retryStream} onStreamError={streamFailed} onQualityError={playingStream=>savePlaybackSettings({quality:String(playingStream.quality)})} onBack={onBack} onVoice={immersive?()=>{onPanelChange?.(null);setQuery('');setOverlay('voice');}:undefined} voiceLabel={voice.replace(/^Озвучка /,'')} onEpisodes={openEpisodes} onComments={onComments} settings={playerSettings} quality={qualityPicker} streamInfo={streamInfo} syncStatus={syncStatus} previous={index>0?()=>choose(videos[index-1].number):undefined} next={index<videos.length-1?()=>choose(videos[index+1].number):undefined}/>:<div class="player-frame native-placeholder">{showStreamError?<div class="native-error" role="alert"><p>{excluded.length?`Не удалось восстановить просмотр после сбоя ${failedSources.providers?.join(', ')||'видеопотока'}. Резервные источники тоже недоступны.`:streams.error}</p>{excluded.length>0&&<p class="stream-failure-detail">{streams.error}</p>}<button class="button secondary" onClick={retryStream}>Повторить</button>{immersive?<button class="text-link" onClick={onBack}>Другие источники на странице аниме</button>:<button class="text-link" onClick={()=>active&&selectPlayer(active)}>Плеер источника</button>}</div>:<PlaybackLoader label={excluded.length?"Пробуем другой источник…":"Подбираем видеопоток…"} detail={excluded.length?"Серия, озвучка и позиция сохраняются":undefined}/>}</div>}{!selected&&onBack&&<button class="native-state-back" onClick={onBack}><Icon name="back" size={21}/>Об аниме</button>}</div>
    </div>

    {!immersive&&<>
    <div class="watch-source-buttons"><WatchPicker label="Озвучка" value={voice} onClick={()=>{setQuery('');setOverlay('voice');}}/><WatchPicker label="Плеер" value="Наш плеер" onClick={()=>{setQuery('');setOverlay('player');}}/></div>

    <div class="watch-preferences"><span class="player-settings-hint">Качество и автопропуск — в ⚙ настройках плеера.</span><label class="watch-toggle"><input type="checkbox" checked={autoNext} onChange={event=>{setAutoNext(event.currentTarget.checked);writeJSON('yumiwatch:auto-next',event.currentTarget.checked);}}/>Следующая серия автоматически</label></div><button class="episode-launcher" aria-haspopup="dialog" onClick={openEpisodes}><Icon name="list" size={23}/><span><strong>Все серии</strong><small>Выбрана {current?.number} из {videos.length}</small></span><Icon name="chevron" size={19}/></button><p class="player-note">{result?`${result.provider} · ${result.relay?'через сервер':'прямой поток'}`:'Наш плеер'}</p>
    </>}
    <Sidebar open={episodesOpen} title="Серии" subtitle={anime.title} close={closeEpisodes} className="episodes-sidebar">{immersive&&<label class="watch-toggle sidebar-auto-next"><input type="checkbox" checked={autoNext} onChange={event=>{setAutoNext(event.currentTarget.checked);writeJSON('yumiwatch:auto-next',event.currentTarget.checked);}}/>Следующая серия автоматически</label>}<div class="source-search"><Icon name="search" size={18}/><input type="search" {...SEARCH_INPUT_PROPS} aria-label="Найти серию" placeholder="Номер серии" value={query} onInput={event=>setQuery(event.currentTarget.value)}/></div><div class="episode-cards">{videos.filter(video=>video.number.includes(query)).map(video=>{const frame=anime.random_screenshots?.find(frame=>frame.episode===video.number);return <button aria-label={`Серия ${video.number}`} aria-pressed={current?.number===video.number} class={`episode-card ${current?.number===video.number?'selected':''}`} key={video.number} onClick={()=>choose(video.number)}><div class="episode-preview"><CachedImage src={imageUrl(frame?.sizes.small||anime.poster?.medium)} alt="" loading="lazy"/><span class="episode-play"><Icon name="play" size={20}/></span></div><span class="episode-caption"><strong>Серия {video.number}</strong><small>{frame?'Смотреть':'Без превью'}</small></span></button>;})}</div></Sidebar>
    <Sidebar open={immersive&&overlay==='voice'} title="Озвучка" subtitle={anime.title} close={()=>setOverlay(null)} className="voices-sidebar"><div class="source-search"><Icon name="search" size={18}/><input type="search" {...SEARCH_INPUT_PROPS} aria-label="Найти озвучку" placeholder="Название озвучки" value={query} onInput={event=>setQuery(event.currentTarget.value)}/></div><div class="source-options">{voices.filter(value=>value.toLowerCase().includes(query.toLowerCase())).map(value=><button class={`source-option ${voiceKey(value)===voiceKey(voice)?'selected':''}`} key={value} disabled={!voiceVideos(all,value).some(video=>video.number===current?.number)} onClick={()=>choose(current.number,value)}><span><strong>{value}</strong><small>{voiceVideos(all,value).length} серий</small></span>{voiceKey(value)===voiceKey(voice)&&<Icon name="check" size={20}/>}</button>)}</div></Sidebar>
    {!immersive&&overlay&&overlay!=='episodes'&&<Sheet title={overlay==='voice'?'Выбрать озвучку':'Выбрать плеер'} subtitle={anime.title} close={()=>setOverlay(null)}><div class="source-search"><Icon name="search" size={18}/><input type="search" {...SEARCH_INPUT_PROPS} aria-label={overlay==='voice'?'Найти озвучку':'Найти плеер'} value={query} onInput={event=>setQuery(event.currentTarget.value)} placeholder={overlay==='voice'?'Название озвучки':'Название плеера'}/></div>{overlay==='player'?<div class="source-options">{'наш плеер'.includes(query.toLowerCase())&&<button class="source-option selected" onClick={()=>setOverlay(null)}><span><strong>Наш плеер</strong><small>Единое управление · автопропуск</small></span><Icon name="check" size={20}/></button>}{[...groupVideos(all)].filter(([,group])=>voiceKey(group.videos[0].data.dubbing)===voiceKey(voice)&&group.videos[0].data.player.toLowerCase().includes(query.toLowerCase())).map(([key,group])=><button key={key} class="source-option" disabled={!group.videos.some(video=>video.number===current?.number)} onClick={()=>selectPlayer(group.videos.find(video=>video.number===current?.number))}><span><strong>{group.videos[0].data.player}</strong><small>{group.videos.some(video=>video.number===current?.number)?`${group.videos.length} серий`:`Серия ${current?.number} недоступна`}</small></span></button>)}</div>:<div class="source-options">{voices.filter(value=>value.toLowerCase().includes(query.toLowerCase())).map(value=><button class={`source-option ${voiceKey(value)===voiceKey(voice)?'selected':''}`} key={value} disabled={!voiceVideos(all,value).some(video=>video.number===current?.number)} onClick={()=>{const available=voiceVideos(all,value);choose(available.find(video=>video.number===current?.number)?.number||available[0].number,value);}}><span><strong>{value}</strong><small>{voiceVideos(all,value).length} серий</small></span>{voiceKey(value)===voiceKey(voice)&&<Icon name="check" size={20}/>}</button>)}</div>}</Sheet>}
  </section>;
}
