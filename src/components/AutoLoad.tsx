import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function AutoLoad({enabled,loading,error,load,children}:{enabled:boolean;loading:boolean;error:string;load:()=>void;children:ComponentChildren}) {
  const marker=useRef<HTMLDivElement>(null),callback=useRef(load);callback.current=load;
  useEffect(()=>{
    if(!enabled||loading||error||!marker.current||typeof IntersectionObserver==='undefined')return;
    let requested=false;
    const observer=new IntersectionObserver(entries=>{
      if(!requested&&entries.some(entry=>entry.isIntersecting)){requested=true;callback.current();}
    },{root:marker.current.closest('.media-scroll,.sidebar-scroll,.modal-scroll'),rootMargin:'600px 0px'});
    observer.observe(marker.current);return()=>observer.disconnect();
  },[enabled,loading,error]);
  if(!enabled)return null;
  return <><div class="auto-load-marker" ref={marker} aria-hidden="true"/>
    {loading&&children}
    {error?<div class="auto-load-error" role="alert"><p>{error}</p><button class="button secondary" onClick={load}>Повторить загрузку</button></div>
      :!loading&&typeof IntersectionObserver==='undefined'&&<button class="button secondary" onClick={load}>Загрузить ещё</button>}
  </>;
}
