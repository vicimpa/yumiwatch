import { useEffect,useRef,useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { cachedImage,normalizeImage,refreshImage,subscribeImage } from '../lib/image-cache';

const visibility=new Map<Element,(visible:boolean)=>void>();
let observer:IntersectionObserver|undefined;
function observeImage(image:HTMLImageElement,update:(visible:boolean)=>void){
 observer??=new IntersectionObserver(entries=>{
  for(const entry of entries)visibility.get(entry.target)?.(entry.isIntersecting);
 },{rootMargin:'160px'});
 visibility.set(image,update);observer.observe(image);
 return()=>{visibility.delete(image);observer?.unobserve(image);if(!visibility.size){observer?.disconnect();observer=undefined;}};
}
export function useCachedImage(raw?:string,enabled=true){
 const url=normalizeImage(raw);
 const [value,setValue]=useState(()=>({key:url,src:cachedImage(url)}));
 useEffect(()=>{
  let mounted=true;
  const update=()=>{if(mounted)setValue({key:url,src:cachedImage(url)||url});};
  const unsubscribe=subscribeImage(url,update),controller=new AbortController();
  if(enabled)void refreshImage(url,!cachedImage(url),controller.signal).then(update);
  return()=>{mounted=false;controller.abort();unsubscribe();};
 },[url,enabled]);
 const cached=value.key===url?value.src:cachedImage(url);
 // Without persistent caching, the browser owns the request. Do not give it
 // a remote src until the same visibility gate has opened.
 return cached===url&&!enabled?undefined:cached;
}
export function CachedImage({src,loading='lazy',decoding='async',...props}:JSX.ImgHTMLAttributes<HTMLImageElement>){
 const image=useRef<HTMLImageElement>(null);
 const [visible,setVisible]=useState(false);
 const eager=loading==='eager'||typeof IntersectionObserver==='undefined';
 useEffect(()=>{
  if(eager||!image.current)return;
  return observeImage(image.current,setVisible);
 },[eager]);
 const cached=useCachedImage(typeof src==='string'?src:undefined,eager||visible);
 // Visibility is already gated above; do not add a second native lazy gate
 // before decoding a poster that is about to become visible.
 return <img {...props} ref={image} loading={eager||visible?'eager':'lazy'} decoding={decoding} src={cached||undefined} onError={event=>{if(cached)props.onError?.(event);}}/>;
}
