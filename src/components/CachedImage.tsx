import { useEffect,useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { cachedImage,normalizeImage,refreshImage,subscribeImage } from '../lib/image-cache';

export function useCachedImage(raw?:string){
 const url=normalizeImage(raw);
 const [value,setValue]=useState(()=>({key:url,src:cachedImage(url)}));
 useEffect(()=>{
  let mounted=true;
  const update=()=>{if(mounted)setValue({key:url,src:cachedImage(url)||url});};
  const unsubscribe=subscribeImage(url,update);
  void refreshImage(url,true).then(update);
  return()=>{mounted=false;unsubscribe();};
 },[url]);
 return value.key===url?value.src:cachedImage(url);
}
export function CachedImage({src,...props}:JSX.ImgHTMLAttributes<HTMLImageElement>){
 const cached=useCachedImage(typeof src==='string'?src:undefined);
 return <img {...props} src={cached||undefined} onError={event=>{if(cached)props.onError?.(event);}}/>;
}
