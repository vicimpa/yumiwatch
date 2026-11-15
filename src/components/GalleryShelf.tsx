import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

export function GalleryShelf({ title, href, children, count, subtitle }: { title:string; href:string; children:ComponentChildren; count:number; subtitle?:string }) {
  const rail=useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({start:true,end:true});
  const update=()=>{const element=rail.current;if(element){const start=element.scrollLeft<2,end=element.scrollLeft+element.clientWidth>=element.scrollWidth-2;setEdges(previous=>previous.start===start&&previous.end===end?previous:{start,end});}};
  useEffect(()=>{
    update();
    let frame=0;
    // Rendering from the observer itself can resize the rail during delivery.
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);});
    if(rail.current)observer?.observe(rail.current);
    return()=>{observer?.disconnect();cancelAnimationFrame(frame);};
  },[count]);
  const move=(direction:number)=>rail.current?.scrollBy({left:direction*rail.current.clientWidth*.8,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  return <section class="section gallery-shelf" aria-label={title}><div class="section-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><div class="gallery-shelf-actions"><a class="text-link" href={href}>Все<Icon name="arrow" size={16}/></a><button class="icon-button" aria-label={`${title}: назад`} disabled={edges.start} onClick={()=>move(-1)}><Icon name="back" size={18}/></button><button class="icon-button" aria-label={`${title}: вперёд`} disabled={edges.end} onClick={()=>move(1)}><Icon name="arrow" size={18}/></button></div></div><div ref={rail} class="poster-rail gallery-rail" data-gallery-row onScroll={update}>{children}</div></section>;
}

export function GalleryToolbar({title,subtitle,onFilters,count=0,query=''}:{title:string;subtitle?:string;onFilters?:()=>void;count?:number;query?:string}) {
  return <header class="gallery-heading"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><nav class="gallery-actions" aria-label="Действия каталога"><a class="button secondary" href={`#/search${query?`?q=${encodeURIComponent(query)}`:''}`}><Icon name="search" size={20}/><span>Поиск</span></a>{onFilters&&<button class={`button secondary ${count?'has-filters':''}`} aria-haspopup="dialog" onClick={onFilters}><Icon name="filter" size={20}/><span>Фильтры</span>{count>0&&<small>{count}</small>}</button>}<a class="button secondary gallery-collection-action" href="#/library" aria-label="Моя коллекция"><Icon name="bookmark" size={20}/><span>Коллекция</span></a></nav></header>;
}
