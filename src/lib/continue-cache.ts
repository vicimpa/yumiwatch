import { getSession } from './session';
import { LIBRARY_EVENT, readJSON, writeJSON } from './storage';
import type { WatchEntry } from './types';
interface SavedEntry { entry:WatchEntry; pending:boolean }
const key=()=>{const session=getSession();return session?`yumiwatch:continue:v1:account:${session.user.id}`:undefined;};
function compact(entry:WatchEntry):WatchEntry|undefined{
 if(!entry?.anime||!Number.isInteger(entry.anime.anime_id)||typeof entry.anime.title!=='string'||typeof entry.episode!=='string'||!Number.isFinite(entry.updatedAt))return;
 const anime=entry.anime,poster=anime.poster;
 return {anime:{anime_id:anime.anime_id,anime_url:anime.anime_url||'',title:anime.title,year:anime.year,poster:poster?{medium:poster.medium,big:poster.big}:undefined},episode:entry.episode,videoId:entry.videoId||0,group:typeof entry.group==='string'?entry.group:'',updatedAt:entry.updatedAt,position:Number.isFinite(entry.position)?Math.max(0,entry.position!):0,duration:Number.isFinite(entry.duration)?Math.max(0,entry.duration!):0,preview:entry.preview,playing:entry.playing};
}
function read():SavedEntry[]{
 const address=key(),values=address?readJSON<unknown>(address,[]):[];
 return Array.isArray(values)?values.flatMap(value=>{const entry=compact(value?.entry);return entry?[{entry,pending:value.pending===true}]:[];}).slice(0,100):[];
}
function write(values:SavedEntry[]){
 const address=key();if(!address)return;
 writeJSON(address,values.sort((a,b)=>b.entry.updatedAt-a.entry.updatedAt).slice(0,100));
}
export function mergeContinueHistory(...groups:WatchEntry[][]){
 const entries=new Map<number,WatchEntry>();
 for(const entry of groups.flat()){
  const previous=entries.get(entry.anime.anime_id);
  if(!previous||entry.updatedAt>previous.updatedAt)entries.set(entry.anime.anime_id,entry);
 }
 return [...entries.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
}
export const readContinueHistory=()=>read().map(value=>value.entry);
export function rememberContinue(entry:WatchEntry,token:string|null){
 if(!getSession()||getSession()?.token!==token)return;
 const value=compact(entry);if(!value)return;
 write([{entry:value,pending:true},...read().filter(previous=>previous.entry.anime.anime_id!==value.anime.anime_id)]);
 window.dispatchEvent(new Event(LIBRARY_EVENT));
}
export function confirmContinue(entry:WatchEntry,token:string){
 if(getSession()?.token!==token)return;
 const value=compact(entry);if(!value)return;
 const saved=read(),previous=saved.find(item=>item.entry.anime.anime_id===value.anime.anime_id);
 if(previous&&(previous.entry.updatedAt>value.updatedAt||previous.pending&&previous.entry.updatedAt===value.updatedAt&&(previous.entry.videoId!==value.videoId||previous.entry.position!==value.position||previous.entry.episode!==value.episode)))return;
 if(previous?.entry.videoId===value.videoId)value.playing=previous.entry.playing;
 write([{entry:value,pending:false},...saved.filter(item=>item.entry.anime.anime_id!==value.anime.anime_id)]);
}
export function syncContinueHistory(entries:WatchEntry[],token:string){
 if(getSession()?.token!==token)return entries;
 const pending=read().filter(value=>value.pending),history=mergeContinueHistory(pending.map(value=>value.entry),entries);
 write(history.flatMap(entry=>{const value=compact(entry);return value?[{entry:value,pending:pending.some(item=>item.entry.anime.anime_id===value.anime.anime_id&&item.entry.updatedAt===value.updatedAt)}]:[];}));
 return history;
}
