import { SEARCH_INPUT_PROPS } from '../lib/search';
import { CachedImage } from './CachedImage';
import { useEffect, useState } from 'preact/hooks';
import { imageUrl } from '../lib/api';
import { formatTime, videoPosition } from '../lib/player';
import { voiceKey, voiceVideos } from '../lib/streams';
import type { Anime, Video, WatchEntry } from '../lib/types';
import { Icon } from './Icon';
import { Select } from './Select';
import { Sidebar } from './Sidebar';
import { Empty, ErrorState } from './UI';

export function AboutEpisodes({anime,videos,history,open,close,loading,error,retry}:{anime:Anime;videos:Video[];history?:WatchEntry;open:boolean;close:()=>void;loading:boolean;error:string;retry:()=>void}){
 const [selectedVoice,setSelectedVoice]=useState(''),[query,setQuery]=useState('');
 useEffect(()=>{if(open)setQuery('');},[open]);
 const voices=[...new Map(videos.map(video=>[voiceKey(video.data.dubbing),video.data.dubbing])).entries()];
 const savedVoice=videos.find(video=>video.video_id===history?.videoId)?.data.dubbing;
 const voice=voices.find(([key])=>key===selectedVoice)?.[1]||savedVoice||voices[0]?.[1]||'';
 const episodes=voiceVideos(videos,voice).filter(video=>video.number.includes(query.trim()));
 return <Sidebar open={open} title="Серии" subtitle={anime.title} close={close} className="episodes-sidebar about-episodes-sidebar">
  {loading?<p class="collection-note" role="status">Загружаем серии…</p>:error?<ErrorState error={error} retry={retry}/>:!voices.length?<Empty title="Серии пока не появились">Попробуй вернуться позже.</Empty>:<>
   <label class="about-episodes-voice">Озвучка<Select aria-label="Озвучка серий" value={voiceKey(voice)} onChange={event=>setSelectedVoice(event.currentTarget.value)}>{voices.map(([key,title])=><option key={key} value={key}>{title.replace(/^Озвучка /,'')}</option>)}</Select></label>
   <div class="source-search"><Icon name="search" size={18}/><input type="search" {...SEARCH_INPUT_PROPS} aria-label="Найти серию" placeholder="Номер серии" value={query} onInput={event=>setQuery(event.currentTarget.value)}/></div>
   {episodes.length?<div class="episode-cards">{episodes.map(video=>{
    const frame=anime.random_screenshots?.find(image=>image.episode===video.number),preview=imageUrl(frame?.sizes.small||anime.poster?.medium);
    const saved=videoPosition(video,savedVoice&&history&&voiceKey(savedVoice)===voiceKey(voice)&&history.episode===video.number?{...history,videoId:video.video_id}:history),current=history?.episode===video.number&&!!saved.position;
    return <a class={`episode-card ${current?'selected':''}`} key={video.number} aria-label={`Серия ${video.number}`} aria-current={current?'true':undefined} href={`#/anime/${anime.anime_id}?view=watch&play=1&episode=${encodeURIComponent(video.number)}&voice=${encodeURIComponent(voice)}`} onClick={close}>
     <div class="episode-preview">{preview&&<CachedImage src={preview} alt="" loading="lazy"/>}<span class="episode-play"><Icon name="play" size={20}/></span>{saved.duration>0&&saved.position>0&&<span class="episode-progress" style={{width:`${Math.min(100,saved.position/saved.duration*100)}%`}}/>}</div>
     <span class="episode-caption"><strong>Серия {video.number}</strong><small>{saved.position?`Продолжить · ${formatTime(saved.position)}`:'Смотреть'}</small></span>
    </a>;
   })}</div>:<p class="collection-note">Такая серия не найдена.</p>}
  </>}
 </Sidebar>;
}
