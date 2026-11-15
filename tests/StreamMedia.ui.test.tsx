// @vitest-environment jsdom
import { useRef } from 'preact/hooks';
import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamMedia, nativeHls } from '../src/components/StreamMedia';
const engine=vi.hoisted(()=>({listeners:new Map<string,(event:Event)=>void>(),loaded:vi.fn(),retry:vi.fn().mockReturnValue(true),configure:vi.fn()}));
vi.mock('shaka-player',()=>({default:{polyfill:{installAll:()=>{}},net:{NetworkingEngine:{RequestType:{MANIFEST:1}}},Player:class{
 static isBrowserSupported(){return true;}async attach(){}configure(config:unknown){engine.configure(config);}getVariantTracks(){return [];}getNetworkingEngine(){return {registerResponseFilter:()=>{}};}addEventListener(name:string,callback:(event:Event)=>void){engine.listeners.set(name,callback);}retryStreaming(){return engine.retry();}async load(){await engine.loaded();}getChaptersTracks(){return [];}async destroy(){}
}}}));
function Harness({failure,provider,type='hls',pending}:{failure:(error:Error)=>void;provider?:string;type?:'hls'|'mp4';pending?:(value:boolean)=>void}){const video=useRef<HTMLVideoElement>(null);return <StreamMedia provider={provider} stream={{quality:720,type,url:`https://cdn.example/video.${type==='hls'?'m3u8':'mp4'}`}} video={video} active title="Видео" poster="" start={()=>0} onReady={()=>{}} onError={failure} onPending={pending} onSkips={()=>{}}/>;}
beforeEach(()=>{engine.listeners.clear();engine.loaded.mockClear();engine.retry.mockClear();engine.configure.mockClear();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('adaptive stream errors',()=>{
 it('keeps startup retries pending until the engine finishes loading',async()=>{
  let finish!:()=>void;engine.loaded.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const pending=vi.fn(),failure=vi.fn();render(<Harness provider="CVH" failure={failure} pending={pending}/>);
  await waitFor(()=>expect(typeof finish).toBe('function'));expect(pending).toHaveBeenLastCalledWith(true);expect(failure).not.toHaveBeenCalled();
  finish();await waitFor(()=>expect(pending).toHaveBeenLastCalledWith(false));
 });
 it('loads native MP4 without a CORS Origin that the CVH CDN rejects',async()=>{
  const load=vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
  const failure=vi.fn();const {container}=render(<Harness provider="CVH" type="mp4" failure={failure}/>);
  await waitFor(()=>expect(load).toHaveBeenCalled());
  const video=container.querySelector('video')!;
  expect(video.getAttribute('crossorigin')).toBeNull();expect(video.src).toBe('https://cdn.example/video.mp4');
  expect(engine.loaded).not.toHaveBeenCalled();expect(failure).not.toHaveBeenCalled();
 });
 it('uses the adaptive engine for desktop Chromium despite native HLS advertising maybe',()=>{
  const media=document.createElement('video');vi.spyOn(media,'canPlayType').mockReturnValue('maybe');vi.stubGlobal('MediaSource',class{});const agent=vi.spyOn(navigator,'userAgent','get');agent.mockReturnValue('Mozilla/5.0 Chrome/144.0.0.0 Safari/537.36');expect(nativeHls(media)).toBe(false);agent.mockReturnValue('Mozilla/5.0 Version/18.0 Safari/605.1.15');expect(nativeHls(media)).toBe(true);
 });
 it('uses managed Kodik HLS retries even when WebKit advertises native playback',async()=>{
  vi.spyOn(HTMLMediaElement.prototype,'canPlayType').mockReturnValue('maybe');vi.stubGlobal('MediaSource',class{});
  vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 Version/18.0 Safari/605.1.15');
  const {container}=render(<Harness provider="Kodik" failure={()=>{}}/>);await waitFor(()=>expect(engine.loaded).toHaveBeenCalled());
  expect(container.querySelector('video')?.getAttribute('src')).toBeNull();
 });
 it.each(['Kodik','Alloha'])('keeps segment timestamps continuous only for the affected Kodik HLS (%s)',async provider=>{
  render(<Harness provider={provider} failure={()=>{}}/>);await waitFor(()=>expect(engine.loaded).toHaveBeenCalled());const hls=engine.configure.mock.calls[0][0].manifest.hls;
  if(provider==='Kodik')expect(hls).toEqual({sequenceMode:false,ignoreManifestTimestampsInSegmentsMode:true});else expect(hls).toEqual({});
 });
 it('leaves recoverable HLS errors to the decoder and reports a critical error',async()=>{
  const failure=vi.fn();render(<Harness failure={failure}/>);await waitFor(()=>expect(engine.loaded).toHaveBeenCalled());
  engine.listeners.get('error')!(new CustomEvent('error',{detail:{severity:1}}));expect(failure).not.toHaveBeenCalled();engine.listeners.get('error')!(new CustomEvent('error',{detail:{severity:2}}));expect(failure).toHaveBeenCalledOnce();
 });
 it('retries a stopped VOD network engine twice before discarding the source',async()=>{
  const failure=vi.fn();render(<Harness failure={failure}/>);await waitFor(()=>expect(engine.loaded).toHaveBeenCalled());const error=()=>engine.listeners.get('error')!(new CustomEvent('error',{detail:{severity:2,category:1}}));
  error();error();expect(engine.retry).toHaveBeenCalledTimes(2);expect(failure).not.toHaveBeenCalled();error();expect(failure).toHaveBeenCalledOnce();
 });

});
