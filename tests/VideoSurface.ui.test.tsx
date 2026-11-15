// @vitest-environment jsdom
import { useRef } from 'preact/hooks';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_ACTION_DELAY_MS } from '../src/components/AutoActionCountdown';
import { STREAM_ERROR_DELAY_MS, STREAM_STALL_TIMEOUT_MS, VideoSurface } from '../src/components/VideoSurface';
import { CONTROLS_IDLE_MS } from '../src/components/VideoControls';
function Harness({failure=()=>{},autoOpening=false,autoEnding=false,autoNext=false,next,ended,skips={}}:{failure?:(playing:boolean)=>void;autoOpening?:boolean;autoEnding?:boolean;autoNext?:boolean;next?:()=>void;ended?:()=>void;skips?:{opening?:{time:number;length:number};ending?:{time:number;length:number}}}){
 const media=useRef<HTMLVideoElement>(null);
 return <VideoSurface stream={{quality:360,type:'mp4',url:'https://cdn.example/test.mp4'}} identity={1} start={0} autoplay={false} media={media} onUpdate={()=>{}} onEnded={ended} autoNext={autoNext} next={next} onStreamError={failure} retry={()=>{}} title="Тест" poster="" skips={skips} autoOpening={autoOpening} autoEnding={autoEnding}/>;
}
beforeEach(()=>{
 vi.useFakeTimers();vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const advance=()=>act(()=>{vi.advanceTimersByTime(STREAM_STALL_TIMEOUT_MS+STREAM_ERROR_DELAY_MS+1);});
describe('unresponsive media sources',()=>{
 it('publishes immersive idle state and restores window controls when leaving playback',()=>{
  const {container,unmount}=render(<div class="media-app is-playback"><Harness/></div>);const media=container.querySelector('video')!;
  playing(media,10);act(()=>{vi.advanceTimersByTime(CONTROLS_IDLE_MS+1);});expect(document.documentElement.dataset.playerChrome).toBe('hidden');
  fireEvent.pointerMove(document.body);expect(document.documentElement.dataset.playerChrome).toBe('visible');
  act(()=>{vi.advanceTimersByTime(CONTROLS_IDLE_MS+1);});unmount();expect(document.documentElement.dataset.playerChrome).toBeUndefined();
 });
 it('delays the final alert and cancels it when frames recover during the grace period',()=>{
  const {container}=render(<Harness/>);const media=container.querySelector('video')!;
  Object.defineProperty(media,'error',{value:{code:2},writable:true,configurable:true});fireEvent.error(media);
  act(()=>{vi.advanceTimersByTime(STREAM_ERROR_DELAY_MS-1);});expect(screen.queryByRole('alert')).toBeNull();
  Object.defineProperty(media,'error',{value:null,configurable:true});playing(media,10);
  act(()=>{vi.advanceTimersByTime(STREAM_ERROR_DELAY_MS);});expect(screen.queryByRole('alert')).toBeNull();
 });
 it('keeps an alert hidden while another provider is being tried',()=>{
  const failure=vi.fn().mockReturnValue(true);const {container}=render(<Harness failure={failure}/>);
  const media=container.querySelector('video')!;Object.defineProperty(media,'error',{value:{code:2},configurable:true});fireEvent.error(media);
  advance();expect(failure).toHaveBeenCalledOnce();expect(screen.queryByRole('alert')).toBeNull();
 });
 it('clears a failure overlay when decoded playback resumes',()=>{
  const failure=vi.fn();const {container}=render(<Harness failure={failure}/>);const media=container.querySelector('video')!;
  playing(media,10);Object.defineProperty(media,'error',{value:{code:2},writable:true,configurable:true});fireEvent.error(media);act(()=>{vi.advanceTimersByTime(STREAM_ERROR_DELAY_MS);});expect(screen.getByRole('alert')).toBeTruthy();
  Object.defineProperty(media,'error',{value:null,configurable:true});media.currentTime=11;fireEvent.playing(media);fireEvent.timeUpdate(media);
  expect(screen.queryByRole('alert')).toBeNull();expect(container.querySelector('.video-controls')?.hasAttribute('inert')).toBe(false);
 });
 it.each(['yumiwatch:stream-error','error'])('does not cover progressing video or discard its source after %s',event=>{
  const failure=vi.fn();const {container}=render(<Harness failure={failure}/>);const media=container.querySelector('video')!;
  playing(media,10);fireEvent(media,new Event(event));
  expect(screen.queryByRole('alert')).toBeNull();expect(failure).not.toHaveBeenCalled();
  media.currentTime=11;fireEvent.timeUpdate(media);advance();expect(screen.queryByRole('alert')).toBeNull();expect(failure).not.toHaveBeenCalled();
 });
 it('still fails a decoder error when buffered frames stop advancing',()=>{
  const failure=vi.fn();const {container}=render(<Harness failure={failure}/>);const media=container.querySelector('video')!;
  playing(media,10);fireEvent(media,new Event('yumiwatch:stream-error'));advance();
  expect(failure).toHaveBeenCalledOnce();expect(screen.getByRole('alert')).toBeTruthy();
 });
 it('fails a source that never delivers frames, only once',()=>{
  const failure=vi.fn();const {container}=render(<Harness failure={failure}/>);advance();expect(failure).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'Повторить загрузку'})).toBeTruthy();
  fireEvent.error(container.querySelector('video')!);advance();expect(failure).toHaveBeenCalledOnce();
 });
 it('does not treat an offline device as a failed provider or fire after leaving',()=>{
  const failure=vi.fn();const {unmount}=render(<Harness failure={failure}/>);const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  advance();expect(failure).not.toHaveBeenCalled();online.mockReturnValue(true);unmount();advance();expect(failure).not.toHaveBeenCalled();
 });
 it('times out a real playback stall but cancels the timeout on recovery or intentional pause',()=>{
  const failure=vi.fn();const {container}=render(<Harness failure={failure}/>);const media=container.querySelector('video')!;
  Object.defineProperty(media,'readyState',{value:4,writable:true,configurable:true});Object.defineProperty(media,'paused',{value:false,writable:true,configurable:true});fireEvent.loadedMetadata(media);fireEvent.playing(media);advance();expect(failure).not.toHaveBeenCalled();
  Object.defineProperty(media,'readyState',{value:2,writable:true,configurable:true});fireEvent.waiting(media);fireEvent.playing(media);advance();expect(failure).not.toHaveBeenCalled();
  fireEvent.waiting(media);Object.defineProperty(media,'paused',{value:true,writable:true,configurable:true});fireEvent.pause(media);advance();expect(failure).not.toHaveBeenCalled();
  Object.defineProperty(media,'paused',{value:false,writable:true,configurable:true});fireEvent.playing(media);fireEvent.waiting(media);advance();expect(failure).toHaveBeenCalledOnce();expect(failure).toHaveBeenCalledWith(true);
 });
});

function playing(media:HTMLVideoElement,time:number,duration=100){
 Object.defineProperty(media,'readyState',{value:4,writable:true,configurable:true});Object.defineProperty(media,'duration',{value:duration,writable:true,configurable:true});Object.defineProperty(media,'paused',{value:false,writable:true,configurable:true});media.currentTime=time;fireEvent.loadedMetadata(media);fireEvent.playing(media);fireEvent.timeUpdate(media);
}
const countdown=()=>act(()=>{vi.advanceTimersByTime(AUTO_ACTION_DELAY_MS);});
describe('completion and cancellable automatic actions',()=>{
 it('finishes a credits skip without waiting for native ended, never buffers at the end, and starts the next timer when enabled later',()=>{
  const next=vi.fn(),ended=vi.fn(),failure=vi.fn();const props={failure,ended,next,skips:{ending:{time:90,length:10}}};const {container,rerender}=render(<Harness {...props}/>);const media=container.querySelector('video')!;playing(media,95);
  fireEvent.click(screen.getByRole('button',{name:'Пропустить титры'}));expect(media.currentTime).toBe(100);expect(ended).toHaveBeenCalledOnce();Object.defineProperty(media,'readyState',{value:0,writable:true,configurable:true});fireEvent.waiting(media);advance();expect(container.querySelector('.playback-loader')).toBeNull();expect(failure).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
  rerender(<Harness {...props} autoNext/>);expect(screen.getByRole('group',{name:'Следующая серия'})).toBeTruthy();countdown();expect(next).toHaveBeenCalledOnce();fireEvent.ended(media);fireEvent.timeUpdate(media);countdown();expect(next).toHaveBeenCalledOnce();expect(ended).toHaveBeenCalledOnce();
 });
 it('cancels the automatic next episode and rearms after a rewind and a new completion',()=>{
  const next=vi.fn();const {container}=render(<Harness autoNext next={next}/>);const media=container.querySelector('video')!;playing(media,100);
  fireEvent.click(screen.getByRole('button',{name:'Отмена'}));countdown();expect(next).not.toHaveBeenCalled();fireEvent.ended(media);expect(screen.queryByRole('group',{name:'Следующая серия'})).toBeNull();
  media.currentTime=50;fireEvent.seeking(media);fireEvent.seeked(media);media.currentTime=100;fireEvent.timeUpdate(media);expect(screen.getByRole('group',{name:'Следующая серия'})).toBeTruthy();countdown();expect(next).toHaveBeenCalledOnce();
 });
 it('gives an automatic opening skip five seconds, supports cancellation, and keeps manual skipping instant',()=>{
  const {container}=render(<Harness autoOpening skips={{opening:{time:10,length:20}}}/>);const media=container.querySelector('video')!;playing(media,15);act(()=>{vi.advanceTimersByTime(2000);});expect(media.currentTime).toBe(15);
  fireEvent.click(screen.getByRole('button',{name:'Отмена'}));countdown();fireEvent.timeUpdate(media);expect(media.currentTime).toBe(15);expect(screen.queryByRole('group',{name:'Пропуск опенинга'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Пропустить опенинг'}));expect(media.currentTime).toBe(30);
 });
 it('never skips on pause or after seeking away and starts a fresh timer on resumed playback',()=>{
  const {container}=render(<Harness autoOpening skips={{opening:{time:10,length:20}}}/>);const media=container.querySelector('video')!;playing(media,15);
  act(()=>{vi.advanceTimersByTime(2000);});Object.defineProperty(media,'paused',{value:true,writable:true,configurable:true});fireEvent.pause(media);countdown();expect(media.currentTime).toBe(15);
  Object.defineProperty(media,'paused',{value:false,writable:true,configurable:true});fireEvent.playing(media);media.currentTime=40;fireEvent.seeking(media);fireEvent.seeked(media);countdown();expect(media.currentTime).toBe(40);
  media.currentTime=15;fireEvent.seeked(media);fireEvent.playing(media);countdown();expect(media.currentTime).toBe(30);
 });
 it('preserves post-credit scenes and starts the next timer only at the real end',()=>{
  const next=vi.fn();const {container}=render(<Harness autoEnding autoNext next={next} skips={{ending:{time:80,length:10}}}/>);const media=container.querySelector('video')!;playing(media,85);countdown();expect(media.currentTime).toBe(90);expect(next).not.toHaveBeenCalled();expect(screen.queryByRole('group',{name:'Следующая серия'})).toBeNull();
  media.currentTime=100;fireEvent.timeUpdate(media);countdown();expect(next).toHaveBeenCalledOnce();
 });
 it('does not schedule a nonexistent next episode and can recover readiness without a metadata event',()=>{
  const failure=vi.fn();const {container}=render(<Harness autoNext failure={failure}/>);const media=container.querySelector('video')!;playing(media,42);Object.defineProperty(media,'readyState',{value:0,writable:true,configurable:true});fireEvent.emptied(media);expect(failure).not.toHaveBeenCalled();Object.defineProperty(media,'readyState',{value:4,writable:true,configurable:true});fireEvent.loadedData(media);advance();expect(container.querySelector('.playback-loader')).toBeNull();expect(failure).not.toHaveBeenCalled();expect(media.currentTime).toBe(42);
  media.currentTime=100;fireEvent.timeUpdate(media);expect(screen.queryByRole('group',{name:'Следующая серия'})).toBeNull();expect(screen.getAllByRole('button',{name:'Смотреть заново'}).length).toBeGreaterThan(0);
 });
});
