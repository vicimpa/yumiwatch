import { CachedImage } from './CachedImage';
import { useEffect, useRef, useState } from 'preact/hooks';
import { animeList,peekAnimeList, imageUrl, plainText } from '../lib/api';
import { useLibrary, useResource } from '../lib/hooks';
import { formatTime } from '../lib/player';
import { navigateGallery } from '../lib/gallery-navigation';
import type { Anime } from '../lib/types';
import { AnimeCard, CachedNotice, CardSkeleton, ErrorState, FavoriteButton, Poster } from './UI';
import { GalleryShelf, GalleryToolbar } from './GalleryShelf';
import { FilterSheet } from './Filters';
import { Icon } from './Icon';

export function Gallery({active=true}:{active?:boolean}) {
  const now=new Date(),seasonIndex=Math.floor(now.getMonth()/3),season=['winter','spring','summer','fall'][seasonIndex];
  const seasonName=['Зимний','Весенний','Летний','Осенний'][seasonIndex];
  const ongoing=useResource(signal=>animeList({status:'ongoing',from_year:now.getFullYear(),to_year:now.getFullYear(),season,sort:'views',sort_forward:false,limit:12},signal),[],()=>peekAnimeList({status:'ongoing',from_year:now.getFullYear(),to_year:now.getFullYear(),season,sort:'views',sort_forward:false,limit:12}));
  const popular=useResource(signal=>animeList({sort:'top',sort_forward:true,limit:12},signal),[],()=>peekAnimeList({sort:'top',sort_forward:true,limit:12}));
  const announces=useResource(signal=>animeList({status:'announcement',sort:'views',sort_forward:false,limit:12},signal),[],()=>peekAnimeList({status:'announcement',sort:'views',sort_forward:false,limit:12}));
  const screen=useRef<HTMLElement>(null), wasActive=useRef(active);
  const library=useLibrary();const [selected,setSelected]=useState<Anime>();const [filters,setFilters]=useState(false);
  useEffect(()=>{if(!active)setFilters(false);},[active]);
  useEffect(()=>{
    const returning=active&&!wasActive.current;wasActive.current=active;
    if(returning){ongoing.retry();popular.retry();announces.retry();}
    if(returning&&selected){const frame=requestAnimationFrame(()=>screen.current?.querySelector<HTMLAnchorElement>(`[data-gallery-link][href="#/anime/${selected.anime_id}?view=anime-about"]`)?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);}
  },[active]);
  const feature=selected||ongoing.value?.data[0]||popular.value?.data[0];
  const resume=feature&&library.history.find(entry=>entry.anime.anime_id===feature.anime_id);
  const shelf=(resource:typeof popular,title:string,href:string,subtitle?:string)=><>
    {resource.error?<section class="section"><h2>{title}</h2><ErrorState error={resource.error} retry={resource.retry}/></section>:<GalleryShelf title={title} href={href} subtitle={subtitle} count={resource.value?.data.length||0}>{resource.loading?Array.from({length:6},(_,index)=><CardSkeleton key={index}/>):resource.value?.data.map(anime=><AnimeCard key={anime.anime_id} anime={anime} onFocus={()=>setSelected(anime)} onPreview={()=>setSelected(anime)}/>)}</GalleryShelf>}
    {resource.value?.cached&&!resource.refreshing&&<CachedNotice savedAt={resource.value.savedAt}/>}</>;
  return <section ref={screen} class="gallery-screen" aria-label="Галерея аниме" onKeyDown={navigateGallery}>
    <GalleryToolbar title="Каталог" subtitle="Твои истории и новые открытия" onFilters={()=>setFilters(true)}/>
    <nav class="gallery-categories" aria-label="Подборки каталога"><a class="active" href="#/" aria-current="page">Обзор</a><a href="#/catalog">Все аниме<Icon name="grid" size={16}/></a><a href="#/catalog?status=ongoing">Онгоинги</a><a href="#/catalog?sort=top">Лучшие</a><a href="#/catalog?types=movie">Фильмы</a><a href="#/catalog?status=announcement">Скоро</a><a href="#/schedule">Расписание<Icon name="calendar" size={16}/></a></nav>
    {feature&&<section class="gallery-feature" aria-label="Выбранное аниме"><div class="gallery-feature-poster"><Poster key={feature.anime_id} anime={feature} large/></div><div class="gallery-feature-copy"><p class="eyebrow">{resume?'ПРОДОЛЖИТЬ ПРОСМОТР':'В КАТАЛОГЕ'}</p><h2>{feature.title}</h2><div class="gallery-feature-meta">{feature.rating?.average?<span class="hero-score">★ {feature.rating.average.toFixed(1)}</span>:null}<span>{feature.year}</span><span>{feature.type?.name}</span>{feature.episodes?.aired?<span>{feature.episodes.aired} серий</span>:null}</div><p class="gallery-feature-description">{plainText(feature.description)||feature.genres?.map(genre=>genre.title).join(' · ')||'Открой карточку, чтобы узнать больше об аниме.'}</p><div class="gallery-feature-actions"><a class="button primary" href={`#/anime/${feature.anime_id}?view=${resume?'watch&play=1':'anime-about'}`}><Icon name={resume?'play':'arrow'} size={18}/>{resume?`Продолжить · серия ${resume.episode}`:'Подробнее'}</a><FavoriteButton anime={feature}/></div></div></section>}
    {!!library.history.length&&<GalleryShelf title="Продолжить просмотр" href="#/library?tab=history" count={library.history.length}>{library.history.slice(0,12).map(entry=><a class="gallery-continue" data-gallery-link href={`#/anime/${entry.anime.anime_id}?view=watch&play=1`} key={entry.anime.anime_id}><div class="continue-image">{imageUrl(entry.preview||entry.anime.poster?.big||entry.anime.poster?.medium)&&<CachedImage src={imageUrl(entry.preview||entry.anime.poster?.big||entry.anime.poster?.medium)} alt="" loading="lazy"/>}<span class="continue-series">Серия {entry.episode}</span><span class="continue-time">{formatTime(entry.position)}{entry.duration?` / ${formatTime(entry.duration)}`:''}</span><span class="continue-play"><Icon name="play" size={22}/></span>{entry.duration?<span class="continue-progress" style={{width:`${Math.min(100,(entry.position||0)/entry.duration*100)}%`}}/>:null}</div><h3>{entry.anime.title}</h3></a>)}</GalleryShelf>}
    {shelf(ongoing,`${seasonName} сезон`, `#/catalog?status=ongoing&season=${season}&from_year=${now.getFullYear()}&to_year=${now.getFullYear()}`,String(now.getFullYear()))}
    {shelf(popular,'Лучшие аниме','#/catalog?sort=top','Рейтинг YummyAnime')}
    {shelf(announces,'Скоро на экранах','#/catalog?status=announcement')}
    {active&&filters&&<FilterSheet query="" initialSection="main" close={()=>setFilters(false)}/>}
  </section>;
}
