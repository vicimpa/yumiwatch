import { getCache,putCache,hasCache } from './cache-store';
import { desktopInvoke,isDesktop } from './desktop';

const urls=new Map<string,{blob:Blob;url:string}>(),listeners=new Map<string,Set<()=>void>>();
const pending=new Map<string,Promise<void>>(),checked=new Map<string,number>();
let generation=0,active=0;const queue:Array<()=>Promise<void>>=[];
export const canCacheImages=()=>typeof indexedDB!=='undefined'&&typeof URL.createObjectURL==='function';
export function normalizeImage(url?:string){try{const value=new URL(url||'','https://static.yani.tv');return url&&value.protocol==='https:'?value.href:'';}catch{return '';}}
export function beginImageRefresh(){generation++;for(const [key,epoch] of checked)if(epoch<generation-1)checked.delete(key);}
export function cachedImage(url:string){
 if(!canCacheImages())return url;
 const entry=getCache<Blob>('image',url);if(!entry)return '';
 const previous=urls.get(url);if(previous?.blob===entry.data)return previous.url;
 const value=URL.createObjectURL(entry.data);urls.set(url,{blob:entry.data,url:value});
 if(previous){const revoke=URL.revokeObjectURL.bind(URL);setTimeout(()=>revoke(previous.url),1000);}
 for(const [key,entry] of urls)if(!hasCache('image',key)&&!listeners.get(key)?.size){urls.delete(key);URL.revokeObjectURL(entry.url);}
 return value;
}
export function subscribeImage(url:string,listener:()=>void){
 const group=listeners.get(url)||new Set();group.add(listener);listeners.set(url,group);
 return()=>{group.delete(listener);if(!group.size)listeners.delete(url);};
}
async function fetchImage(url:string){
 if(isDesktop()){
  const result=await desktopInvoke<{data:string;mime:string}>('fetch_image',{url});
  return new Blob([Uint8Array.from(atob(result.data),value=>value.charCodeAt(0))],{type:result.mime});
 }
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),credentials:'omit',cache:'no-cache'});
 if(!response.ok)throw new Error('Image unavailable');return response.blob();
}
function run(){while(active<3&&queue.length){active++;void queue.shift()!().finally(()=>{active--;run();});}}
export function refreshImage(url:string,priority=false):Promise<void>{
 if(!url||!canCacheImages())return Promise.resolve();
 if(pending.has(url))return pending.get(url)!;
 if(checked.get(url)===generation)return Promise.resolve();checked.set(url,generation);
 let finish!:()=>void;const promise=new Promise<void>(resolve=>{finish=resolve;});pending.set(url,promise);
 const task=async()=>{
  try{
   const blob=await fetchImage(url);if(!blob.type.startsWith('image/')||blob.size>8*1024*1024)return;
   const old=getCache<Blob>('image',url)?.data;
   let same=false;
   if(old?.size===blob.size&&old.type===blob.type){const [a,b]=await Promise.all([old.arrayBuffer(),blob.arrayBuffer()]);const bytes=new Uint8Array(b);same=new Uint8Array(a).every((value,index)=>value===bytes[index]);}
   if(!same){putCache('image',url,blob);for(const listener of listeners.get(url)||[])listener();}
  }catch{/* The saved image remains usable during network errors. */}
  finally{pending.delete(url);finish();}
 };
 if(priority)queue.unshift(task);else queue.push(task);run();return promise;
}
export function primeImages(data:unknown){
 if(!canCacheImages())return;
 const found=new Set<string>();
 const image=(value:unknown)=>{if(typeof value==='string'){const url=normalizeImage(value);if(url)found.add(url);}};
 const visit=(value:unknown)=>{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const item of value)visit(item);return;}
  const row=value as Record<string,unknown>;
  for(const [key,child] of Object.entries(row)){
   if(key==='poster'&&child&&typeof child==='object'){
    const poster=child as Record<string,unknown>;for(const size of ['medium','big','huge'])image(poster[size]);
   }
   else if(['sizes','avatars'].includes(key)&&child&&typeof child==='object')for(const url of Object.values(child))image(url);
   else if(['avatar','preview'].includes(key))image(child);
   else if(typeof child==='object')visit(child);
  }
 };
 visit(data);for(const url of [...found].slice(0,128))void refreshImage(url);
}
