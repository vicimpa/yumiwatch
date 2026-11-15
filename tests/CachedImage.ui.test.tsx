// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { cleanup,render,screen,waitFor } from '@testing-library/preact';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { CachedImage } from '../src/components/CachedImage';
import { putCache } from '../src/lib/cache-store';
import { beginImageRefresh } from '../src/lib/image-cache';
const create=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),revoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');
beforeEach(()=>{
 let sequence=0;vi.stubGlobal('indexedDB',{});vi.stubGlobal('Blob',NodeBlob);
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>`blob:cache-test-${++sequence}`)});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});beginImageRefresh();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();if(create)Object.defineProperty(URL,'createObjectURL',create);else Reflect.deleteProperty(URL,'createObjectURL');if(revoke)Object.defineProperty(URL,'revokeObjectURL',revoke);else Reflect.deleteProperty(URL,'revokeObjectURL');});
describe('cached images',()=>{
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
