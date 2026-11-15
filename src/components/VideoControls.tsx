import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, RefObject } from 'preact';
import { mediaAtEnd } from '../lib/media-state';
import { formatTime } from '../lib/player';
import { Icon } from './Icon';
import { Select } from './Select';
import { PLAYBACK_RATE_EVENT, selectedPlaybackRate, setPlaybackRate } from '../lib/playback-rate';
import { saveInterfaceSettings } from '../lib/interface-settings';
import { PlaybackLoader } from './PlaybackLoader';
import { desktopFullscreen, isDesktop, isDesktopWindow, toggleDesktopFullscreen } from '../lib/desktop';

export const CONTROLS_IDLE_MS = 3000;
export function VideoControls({ mediaVersion = 0, media, frame, title, position, loading, failed, settings, quality, streamInfo, syncStatus, previous, next, onVisibility, onEpisodes, onComments, onBack, onVoice, voiceLabel }: {
  mediaVersion?: number; media: RefObject<HTMLVideoElement>; frame: RefObject<HTMLDivElement>; title: string; position: number;
  loading: boolean; failed: boolean; settings: ComponentChildren; previous?: () => void; next?: () => void;
  quality?: ComponentChildren; streamInfo?: ComponentChildren; syncStatus?: ComponentChildren;
  onBack?:()=>void; onVoice?:()=>void; voiceLabel?:string; onVisibility: (visible: boolean) => void; onEpisodes?:()=>void; onComments?:()=>void;
}) {
  const [ended,setEnded]=useState(false);
  const [paused, setPaused] = useState(true), [buffering, setBuffering] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [duration, setDuration] = useState(0), [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false), [volume, setVolume] = useState(1);
  const [rate,setRate]=useState(1);
  const [visible, setVisible] = useState(true), [menu, setMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false), [fullError, setFullError] = useState('');
  const [activity, setActivity] = useState(0), [focused, setFocused] = useState(false), [dragging, setDragging] = useState(false);
  const keyboard = useRef(false);
  const controls = useRef<HTMLDivElement>(null);
  const surfaceClickTimer = useRef<ReturnType<typeof setTimeout>>();
  const surfaceClickPlayback = useRef<{video:HTMLVideoElement;paused:boolean}>();
  useEffect(()=>()=>{
    clearTimeout(surfaceClickTimer.current);surfaceClickPlayback.current=undefined;
  },[mediaVersion,failed]);
  const menuElement = useRef<HTMLDivElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const wake = () => { setVisible(true); setActivity(value => value + 1); };
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      if(event.pointerType==='touch')return;
      const target=event.target;
      if(document.querySelector('.media-app.is-playback')||target instanceof Node&&frame.current?.contains(target)||target instanceof Element&&target.closest('.window-chrome'))wake();
    };
    window.addEventListener('pointermove',move,{passive:true});
    return()=>window.removeEventListener('pointermove',move);
  },[]);
  const seek = (time: number) => { const video = media.current; if (video && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, time)); wake(); };
  const togglePlay = () => { const video = media.current; if (!video) return; if (mediaAtEnd(video)) { video.currentTime=0;void video.play().catch(()=>{}); } else if (video.paused) void video.play().catch(() => {}); else video.pause(); wake(); };
  const toggleMute = () => { if (media.current) media.current.muted = !media.current.muted; wake(); };
  const toggleFullscreen = async () => {
    // Mobile playback already fills the app; desktop window APIs are unavailable.
    if (isDesktop() && !isDesktopWindow()) return;
    const element = frame.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    setFullError('');
    try {
      if (isDesktopWindow()) await toggleDesktopFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
      else if (element?.requestFullscreen) await element.requestFullscreen();
      else if (element?.webkitRequestFullscreen) element.webkitRequestFullscreen();
      else setFullError('Браузер не поддерживает полный экран с нашим интерфейсом.');
    } catch { setFullError('Не удалось открыть полный экран. Попробуй ещё раз.'); }
    wake();
  };
  const surfaceClick = (event:MouseEvent) => {
    clearTimeout(surfaceClickTimer.current);
    if(event.detail>1)return;
    surfaceClickPlayback.current=undefined;
    if(!visible){wake();return;}
    // Keyboard activation stays immediate. Wait briefly before a mouse click so
    // a double click can change fullscreen without pausing the video.
    if(!event.detail){togglePlay();return;}
    const video=media.current;if(!video)return;
    surfaceClickPlayback.current={video,paused:video.paused};
    surfaceClickTimer.current=setTimeout(()=>{if(media.current===video)togglePlay();},250);
  };
  const surfaceDoubleClick = (event:MouseEvent) => {
    event.preventDefault();event.stopPropagation();clearTimeout(surfaceClickTimer.current);
    const before=surfaceClickPlayback.current;surfaceClickPlayback.current=undefined;
    // Respect slower double clicks too, after the single-click delay elapsed.
    if(before&&before.video===media.current&&before.video.paused!==before.paused){
      if(before.paused)before.video.pause();else void before.video.play().catch(()=>{});
    }
    void toggleFullscreen();
  };
  useEffect(() => {
    const video = media.current!;
    let lastPosition=video.currentTime;
    const update = (event?: Event) => {
      setEnded(mediaAtEnd(video));setPaused(video.paused || mediaAtEnd(video)); setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (video.paused || mediaAtEnd(video) || video.readyState >= 3 || event?.type==='timeupdate'&&!video.seeking&&video.currentTime>lastPosition+.01) setBuffering(false);
      lastPosition=video.currentTime;
      setMuted(video.muted); setVolume(video.volume);
      setRate(selectedPlaybackRate(video));
      let end = 0;
      for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) end = video.buffered.end(i);
      setBuffered(end);
    };
    const wait = () => setBuffering(!video.paused && !mediaAtEnd(video) && video.readyState < 3), ready = () => setBuffering(false);
    const full = () => { setFullscreen(desktopFullscreen() || (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) === frame.current); wake(); };
    const up = () => setDragging(false);
    const events = ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'timeupdate', 'volumechange', 'progress', 'seeked', 'ratechange', PLAYBACK_RATE_EVENT, 'yumiwatch:complete'];
    for (const event of events) video.addEventListener(event, update);
    const disconnect = () => { setOffline(true); wait(); }, connect = () => { setOffline(false); wait(); };
    video.addEventListener('waiting', wait); video.addEventListener('stalled', wait); video.addEventListener('playing', ready); video.addEventListener('canplay', ready); video.addEventListener('pause', ready); video.addEventListener('error', ready);
    window.addEventListener('offline', disconnect); window.addEventListener('online', connect);
    document.addEventListener('fullscreenchange', full); document.addEventListener('webkitfullscreenchange', full);
    window.addEventListener('yumiwatch:fullscreen', full);
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    update(); full();
    return () => {
      for (const event of events) video.removeEventListener(event, update);
      video.removeEventListener('waiting', wait); video.removeEventListener('stalled', wait); video.removeEventListener('playing', ready); video.removeEventListener('canplay', ready); video.removeEventListener('pause', ready); video.removeEventListener('error', ready);
      window.removeEventListener('offline', disconnect); window.removeEventListener('online', connect);
      document.removeEventListener('fullscreenchange', full); document.removeEventListener('webkitfullscreenchange', full);
      window.removeEventListener('yumiwatch:fullscreen', full);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    };
  }, [mediaVersion]);
  useEffect(() => {
    if (paused || loading || failed || buffering || menu || focused || dragging) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(false), CONTROLS_IDLE_MS);
    return () => clearTimeout(timer);
  }, [paused, loading, failed, buffering, menu, focused, dragging, activity]);
  useEffect(() => { onVisibility(visible); }, [visible]);
  useEffect(() => { if (failed) setMenu(false); }, [failed]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuElement.current?.contains(target) || menuButton.current?.contains(target)) return;
      setMenu(false); wake();
      if (!(target instanceof HTMLElement&&target.closest('.native-auto-action'))&&(media.current?.closest('.universal-frame')||frame.current)?.contains(target)) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [menu]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (failed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input,select,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox]')) return;
      const dialog = document.querySelector('[aria-modal=true]');
      if (dialog && !frame.current?.contains(dialog)) return;
      if (target?.closest('[data-sidebar-open=true]') && event.key.startsWith('Arrow')) return;
      if (event.key === 'Escape') { setMenu(false); return; }
      if (event.key === 'Enter' && !target?.closest('button,a')) {
        event.preventDefault();keyboard.current=true;wake();
        requestAnimationFrame(()=>controls.current?.querySelector<HTMLButtonElement>('.video-toolbar button:not(:disabled)')?.focus());return;
      }
      if (event.key.startsWith('Arrow') && target?.closest('.video-toolbar button,.video-top-actions button,.native-auto-action button')) return;
      const physical: Record<string,string> = {KeyK:'k',KeyJ:'j',KeyL:'l',KeyM:'m',KeyF:'f',Space:' '};
      const key = physical[event.code] || event.key.toLowerCase();
      if (key === ' ' && target?.closest('button,a')) return;
      if (![' ','k','j','l','m','f','arrowleft','arrowright'].includes(key)) return;
      event.preventDefault(); keyboard.current = true; wake();
      if (event.repeat && [' ','k','m','f'].includes(key)) return;
      if (key === ' ' || key === 'k') togglePlay();
      else if (key === 'j' || key === 'arrowleft') seek((media.current?.currentTime || 0) - (key === 'j' ? 10 : 5));
      else if (key === 'l' || key === 'arrowright') seek((media.current?.currentTime || 0) + (key === 'l' ? 10 : 5));
      else if (key === 'm') toggleMute();
      else if (key === 'f' && !isDesktopWindow()) void toggleFullscreen();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [failed]);
  return <div ref={controls} inert={failed} aria-hidden={failed} class={`video-controls ${visible ? 'is-visible' : 'is-hidden'}`} tabIndex={0} aria-label="Видеоплеер" onPointerDown={event => { keyboard.current = false; setFocused(false); if (!(event.target as HTMLElement).closest('.video-hit-area')) wake(); }} onKeyDown={event => { keyboard.current = true; if (event.key === 'Tab') { setFocused(true); wake(); } }} onFocusIn={event => { if (keyboard.current || (event.target as HTMLElement).matches(':focus-visible')) { setFocused(true); wake(); } }} onFocusOut={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
    <button class="video-hit-area" tabIndex={-1} aria-label={visible ? (paused ? 'Воспроизвести видео' : 'Приостановить видео') : 'Показать управление'} onClick={surfaceClick} onDblClick={surfaceDoubleClick}/>
    {(onBack||onVoice)&&<div class="video-chrome video-top-actions" inert={!visible}>{onBack&&<button aria-label="Об аниме" title="Об аниме (I)" onClick={onBack}><Icon name="back" size={21}/><span>Об аниме</span></button>}{onVoice&&<button aria-label={`Озвучка: ${voiceLabel||'Выбрать'}`} onClick={onVoice}><Icon name="volume" size={19}/><span>{voiceLabel||'Озвучка'}</span><Icon name="chevron" size={15}/></button>}</div>}
    <div class="video-chrome video-heading"><span class="video-brand">YUMMYWATCH</span><strong>{title}</strong>{streamInfo}</div>
    {syncStatus && <span class="video-chrome video-save-status" role="status">{syncStatus}</span>}
    {paused && !loading && !failed && !buffering && <button class="video-center-play" aria-label={ended?'Смотреть заново':'Продолжить просмотр'} onClick={surfaceClick} onDblClick={surfaceDoubleClick}><Icon name="play" size={32}/></button>}
    {buffering && !paused && !loading && !failed && <PlaybackLoader label={offline ? 'Соединение потеряно' : 'Буферизация…'} detail={offline ? 'Ждём сеть. Позиция сохранена.' : 'Подгружаем видео'}/>}
    {menu && <div ref={menuElement} class="video-settings" role="dialog" aria-label="Настройки плеера"><div class="video-settings-heading"><strong>Настройки плеера</strong><button aria-label="Закрыть настройки" onClick={() => setMenu(false)}><Icon name="close"/></button></div><div class="video-settings-selects">{quality}<label class="video-setting-field"><span>Скорость</span><Select aria-label="Скорость воспроизведения" value={rate} onChange={event => { if (media.current) setPlaybackRate(media.current,Number(event.currentTarget.value)); wake(); }}>{[0.5,0.75,1,1.25,1.5,1.75,2].map(rate => <option value={rate} key={rate}>{rate}×</option>)}</Select></label></div>{settings}<p class="video-shortcuts">Пробел / K — пауза · J / L — ±10 с · M — звук · F — полный экран</p></div>}
    <div class="video-chrome video-bottom" role="group" aria-label="Управление воспроизведением" inert={!visible}>
      <div class="video-timeline"><div class="video-timeline-track"><span class="video-buffered" style={{ width: `${duration ? buffered / duration * 100 : 0}%` }}/><span class="video-progress" style={{ width: `${duration ? Math.min(100, position / duration * 100) : 0}%` }}/></div><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(position, duration)} disabled={!duration} aria-label="Позиция воспроизведения" aria-valuetext={`${formatTime(position)} из ${formatTime(duration)}`} onPointerDown={() => setDragging(true)} onInput={event => seek(Number(event.currentTarget.value))}/></div>
      <div class="video-toolbar"><button aria-label={ended?'Смотреть заново':paused ? 'Воспроизвести' : 'Пауза'} title="Пауза / воспроизведение (K)" onClick={togglePlay}><Icon name={paused ? 'play' : 'pause'} size={22}/></button><button class="video-previous" aria-label="Предыдущая серия" disabled={!previous} onClick={previous}><Icon name="skipBack"/></button><button aria-label="Следующая серия" disabled={!next} onClick={next}><Icon name="skipNext"/></button><span class="video-time">{formatTime(position)}<span> / {formatTime(duration)}</span></span><div class="video-volume"><button aria-label={muted || !volume ? 'Включить звук' : 'Выключить звук'} title="Звук (M)" onClick={toggleMute}><Icon name={muted || !volume ? 'volumeOff' : 'volume'}/></button><input aria-label="Громкость" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onPointerDown={() => setDragging(true)} onInput={event => { if (media.current) { media.current.volume = Number(event.currentTarget.value); saveInterfaceSettings({volume:media.current.volume}); media.current.muted = false; } wake(); }}/></div>{onEpisodes&&<button aria-label="Серии" title="Серии (E)" onClick={onEpisodes}><Icon name="list"/></button>}{onComments&&<button aria-label="Комментарии" title="Комментарии (C)" onClick={onComments}><Icon name="comment"/></button>}<button ref={menuButton} aria-label="Настройки плеера" aria-expanded={menu} title="Настройки" onClick={() => { setMenu(value => !value); wake(); }}><Icon name="settings"/></button>{(!isDesktop() || isDesktopWindow()) && <button aria-label={fullscreen ? 'Выйти из полного экрана' : 'Полный экран'} title="Полный экран (F)" onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'minimize' : 'fullscreen'}/></button>}</div>
    </div>
    {fullError && <p class="video-fullscreen-error" role="status">{fullError}</p>}
  </div>;
}
