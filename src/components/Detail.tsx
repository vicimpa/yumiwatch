import { useEffect, useRef, useState } from 'preact/hooks';
import { animeDetail,peekAnimeDetail } from '../lib/api';
import { useLibrary, useResource, useSession } from '../lib/hooks';
import { readPlaybackRecovery } from '../lib/playback-recovery';
import { formatTime } from '../lib/player';
import type { WatchEntry } from '../lib/types';
import { AnimeAbout } from './AnimeAbout';
import { AnimeListButton } from './Library';
import { Player } from './Player';
import { Comments } from './Comments';
import { Sidebar, type MediaPanel } from './Sidebar';
import { CachedNotice, ErrorState, FavoriteButton, Poster } from './UI';
import { Icon } from './Icon';
import { exitPlayerFullscreen, isDesktop } from '../lib/desktop';

export function Detail({id,query='',returnTo='/'}:{id:string;query?:string;returnTo?:string}){
 const resource=useResource(signal=>animeDetail(id,signal),[id,new URLSearchParams(query).get('view')||'about'],()=>peekAnimeDetail(id));const library=useLibrary(),session=useSession();
 const checkpoint=useRef<{token:string|null;entry:WatchEntry}>();const room=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(checkpoint.current?.token!==(session?.token||null))checkpoint.current=undefined;},[session?.token]);
 const anime=resource.value?.data,params=new URLSearchParams(query),watching=params.get('view')==='watch'||params.has('watch');
 const [panel,setPanel]=useState<MediaPanel>(()=>params.get('view')==='comments'||params.get('panel')==='comments'?'comments':null);
 useEffect(()=>{if(new URLSearchParams(query).get('view')==='comments')setPanel('comments');},[query]);
 const entries=[library.history.find(entry=>entry.anime.anime_id===Number(id)),checkpoint.current?.token===(session?.token||null)?checkpoint.current.entry:undefined,readPlaybackRecovery(Number(id))].filter((entry):entry is WatchEntry=>!!entry);
 const history=entries.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 const openComments=()=>setPanel(current=>current==='comments'?null:'comments');
 const backToAbout=()=>{void exitPlayerFullscreen().catch(()=>{}).then(()=>{location.hash=`/anime/${id}`;});};
 useEffect(()=>{
  const keys=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])'))||document.querySelector('dialog[open],.video-settings'))return;
   const key=event.code||event.key.toLowerCase();
   if(key==='KeyC'||key==='c'){event.preventDefault();openComments();}
   if(key==='KeyE'||key==='e'){event.preventDefault();setPanel(current=>current==='episodes'?null:'episodes');}
   if(watching&&(key==='KeyI'||key==='i')){event.preventDefault();backToAbout();}
  };window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[watching,id]);
 const returnLabel=returnTo.startsWith('/search')?'Результаты поиска':returnTo.startsWith('/library')?'Моя коллекция':'Каталог аниме';
 return <section class={`anime-detail-screen ${watching?'is-watching':'is-about'}`}>
  <a class={watching?'watch-state-back':'back-link'} href={watching?`#/anime/${id}`:`#${returnTo}`}><Icon name="back" size={18}/>{watching?'Об аниме':returnLabel}</a>
  {resource.loading?<div class="detail-loading"><div class="skeleton detail-poster"/><div><div class="skeleton line"/><div class="skeleton line short"/></div></div>:resource.error?<ErrorState error={resource.error} retry={resource.retry}/>:anime&&<>
   {!watching&&resource.value?.cached&&!resource.refreshing&&<CachedNotice savedAt={resource.value.savedAt}/>}
   <div ref={room} class={`anime-room ${watching?'is-watch':'is-info'} `}>
    <div class="room-main">
     {!watching&&<>
      <a class="anime-resume-row" data-nav-primary href={`#/anime/${id}?view=watch&play=1`}><span class="resume-row-play"><Icon name="play" size={24}/></span><span><strong>{history?.position?'Продолжить просмотр':'Начать просмотр'}</strong><small>{history?`Серия ${history.episode} · ${formatTime(history.position)}${history.duration?` / ${formatTime(history.duration)}`:''}`:'Озвучки и доступные источники — ниже'}</small></span><Icon name="arrow" size={22}/></a>
      <header class="anime-watch-heading overview-heading"><div class="watch-poster"><Poster anime={anime} large/></div><div class="watch-title"><h1>{anime.title}</h1><div class="detail-meta">{anime.rating?.average?<span class="hero-score">★ {anime.rating.average.toFixed(1)}</span>:null}<span>{anime.year}</span><span>{anime.type?.name}</span><span>{anime.anime_status?.title}</span>{anime.min_age?.title&&<span>{anime.min_age.title}</span>}</div><div class="watch-title-actions"><button class="button secondary" aria-label="Поделиться аниме" onClick={async()=>{try{if(navigator.share)await navigator.share({title:anime.title,url:isDesktop()?`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`:location.href});else await navigator.clipboard.writeText(isDesktop()?`https://ru.yummyani.me/catalog/item/${encodeURIComponent(anime.anime_url)}`:location.href);}catch{/* Sharing can be cancelled. */}}}><Icon name="external" size={18}/></button><FavoriteButton anime={anime}/><button class="button secondary" onClick={()=>setPanel(current=>current==='episodes'?null:'episodes')} aria-haspopup="dialog" aria-expanded={panel==='episodes'} title="Серии (E)"><Icon name="list" size={18}/>Серии</button><button class="button secondary" onClick={openComments} aria-expanded={panel==='comments'} title="Комментарии (C)"><Icon name="comment" size={18}/>Комментарии{anime.comments_count?` · ${anime.comments_count}`:''}</button></div><AnimeListButton anime={anime}/></div></header>
     </>}
     {watching?<Player presentation="immersive" modeOverride="universal" onBack={backToAbout} key={anime.anime_id} anime={anime} history={history} startPlaying={params.has('play')} preferredVoice={params.get('voice')||undefined} preferredEpisode={params.get('episode')||undefined} panel={panel} onPanelChange={setPanel} onComments={openComments} fullscreenContainer={room} onCheckpoint={entry=>{checkpoint.current={token:session?.token||null,entry};}}/>:<AnimeAbout anime={anime} history={history} episodesOpen={panel==='episodes'} closeEpisodes={()=>setPanel(null)}/>}
    </div>
    <Sidebar open={panel==='comments'} title="Комментарии" subtitle={anime.title} close={()=>setPanel(null)} className="comments-sidebar"><Comments animeId={anime.anime_id} returnTo={`/anime/${id}?view=${watching?'watch':'anime-about'}&panel=comments`}/></Sidebar>
   </div>
  </>}
 </section>;
}
