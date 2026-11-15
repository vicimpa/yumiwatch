import { useEffect, useState } from 'preact/hooks';
import { CachedImage } from './CachedImage';
import { Icon } from './Icon';
import { subscribeImage } from '../lib/image-cache';

export function ArtworkImage({src='',alt,eager=false,tone=0,className='',imageClass=''}:{src?:string;alt:string;eager?:boolean;tone?:number;className?:string;imageClass?:string}) {
  const [broken,setBroken]=useState('');
  const [loaded,setLoaded]=useState('');
  useEffect(()=>subscribeImage(src,()=>setBroken('')),[src]);
  const available=!!src&&broken!==src;
  return <span class={`poster-artwork ${className} ${available&&loaded===src?'is-loaded':''}`} data-tone={tone%3} role={available?undefined:'img'} aria-label={available?undefined:alt}>
    <span class={`poster-placeholder ${available?'skeleton':''}`} aria-hidden="true"><Icon name="spark" size={30}/></span>
    {available&&<CachedImage class={imageClass||undefined} src={src} alt={alt} loading={eager?'eager':'lazy'} decoding="async" onLoad={()=>setLoaded(src)} onError={()=>setBroken(src)}/>}
  </span>;
}
