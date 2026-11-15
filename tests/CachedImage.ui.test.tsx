// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { act,cleanup,render,screen,waitFor } from '@testing-library/preact';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { CachedImage } from '../src/components/CachedImage';
import { putCache } from '../src/lib/cache-store';
import { beginImageRefresh,refreshImage } from '../src/lib/image-cache';
const create=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),revoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');
beforeEach(()=>{
 let sequence=0;vi.stubGlobal('indexedDB',{});vi.stubGlobal('Blob',NodeBlob);
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>`blob:cache-test-${++sequence}`)});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});beginImageRefresh();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();if(create)Object.defineProperty(URL,'createObjectURL',create);else Reflect.deleteProperty(URL,'createObjectURL');if(revoke)Object.defineProperty(URL,'revokeObjectURL',revoke);else Reflect.deleteProperty(URL,'revokeObjectURL');});
describe('cached images',()=>{
 it('starts lazy requests only when images approach the viewport and shares identical requests',async()=>{
  const callbacks=new Map<Element,(visible:boolean)=>void>();
  vi.stubGlobal('IntersectionObserver',class{
   constructor(private callback:IntersectionObserverCallback){}
   observe(element:Element){callbacks.set(element,visible=>this.callback([{target:element,isIntersecting:visible} as IntersectionObserverEntry],this as unknown as IntersectionObserver));}
   unobserve(element:Element){callbacks.delete(element);}
   disconnect(){callbacks.clear();}
  });
  let finish!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise<Response>(resolve=>{finish=resolve;})));
  render(<><CachedImage src="https://static.yani.tv/visible.webp" alt="First"/><CachedImage src="https://static.yani.tv/visible.webp" alt="Second"/></>);
  const first=screen.getByAltText('First'),second=screen.getByAltText('Second');
  await waitFor(()=>expect(callbacks.size).toBe(2));expect(fetch).not.toHaveBeenCalled();expect(first.hasAttribute('src')).toBe(false);
  act(()=>{callbacks.get(first)!(true);callbacks.get(second)!(true);});
  await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  act(()=>callbacks.get(first)!(false));
  finish(new Response(new Uint8Array([8]),{headers:{'Content-Type':'image/webp'}}));
  await waitFor(()=>expect(second.getAttribute('src')).toMatch(/^blob:/));
 });
 it('prioritizes new visible images, cancels unused queued work and keeps shared consumers',async()=>{
  const finishers=new Map<string,()=>void>(),started:string[]=[];
  vi.stubGlobal('fetch',vi.fn((url:string)=>{started.push(url);return new Promise<Response>(resolve=>finishers.set(url,()=>resolve(new Response(new Uint8Array([7]),{headers:{'Content-Type':'image/png'}}))));}));
  const address=(name:string)=>`https://static.yani.tv/queue-${name}.png`;
  const tasks=[refreshImage(address('background-1')),refreshImage(address('background-2')),refreshImage(address('background-3'))];
  for(let i=0;i<4;i++)tasks.push(refreshImage(address(`visible-${i}`),true));
  expect(started).toHaveLength(6);expect(started).not.toContain(address('background-3'));
  const abandoned=new AbortController(),first=new AbortController(),second=new AbortController();
  tasks.push(refreshImage(address('abandoned'),true,abandoned.signal));abandoned.abort();
  tasks.push(refreshImage(address('shared'),true,first.signal));tasks.push(refreshImage(address('shared'),true,second.signal));first.abort();
  finishers.get(address('visible-0'))!();await waitFor(()=>expect(started).toContain(address('shared')));
  expect(started).not.toContain(address('abandoned'));expect(started).not.toContain(address('background-3'));
  for(const finish of finishers.values())finish();
  await waitFor(()=>expect(started).toContain(address('background-3')));finishers.get(address('background-3'))!();
  await Promise.all(tasks);
  const retry=refreshImage(address('abandoned'),true);expect(started).toContain(address('abandoned'));
  finishers.get(address('abandoned'))!();await retry;
 });
 it('shows saved bytes immediately and replaces an updated image at the same URL',async()=>{
  const url='https://static.yani.tv/changed.png';putCache('image',url,new Blob([new Uint8Array([1,2])],{type:'image/png'}));
  let finish!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise<Response>(resolve=>{finish=resolve;})));
  render(<CachedImage src={url} alt="Preview"/>);const image=screen.getByAltText('Preview');expect(image.getAttribute('src')).toBe('blob:cache-test-1');
  finish(new Response(new Uint8Array([3,4]),{headers:{'Content-Type':'image/png'}}));
  await waitFor(()=>expect(image.getAttribute('src')).toBe('blob:cache-test-2'));expect(screen.getByAltText('Preview')).toBe(image);
 });
 it('keeps the object URL unchanged when the server returns identical bytes',async()=>{
  const url='https://static.yani.tv/unchanged.png',bytes=new Uint8Array([1,2]);putCache('image',url,new Blob([bytes],{type:'image/png'}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(bytes,{headers:{'Content-Type':'image/png'}})));
  render(<CachedImage src={url} alt="Preview"/>);await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  await new Promise(resolve=>setTimeout(resolve,10));expect(screen.getByAltText('Preview').getAttribute('src')).toBe('blob:cache-test-1');expect(URL.createObjectURL).toHaveBeenCalledOnce();
 });
 it('retains a saved image after a failed background request',async()=>{
  const url='https://static.yani.tv/offline.png';putCache('image',url,new Blob([new Uint8Array([1])],{type:'image/png'}));
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));render(<CachedImage src={url} alt="Preview"/>);
  await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());expect(screen.getByAltText('Preview').getAttribute('src')).toBe('blob:cache-test-1');
 });
});
