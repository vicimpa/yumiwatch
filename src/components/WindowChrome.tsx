import { useEffect, useState } from 'preact/hooks';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopFullscreen, desktopInvoke, isDesktopWindow, syncDesktopFullscreen, toggleDesktopFullscreen } from '../lib/desktop';
import { notify } from './UI';
import { PLAYER_CHROME_EVENT,playerChromeVisible } from '../lib/player-chrome';

export function WindowChrome() {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [visible,setVisible]=useState(playerChromeVisible);
  useEffect(()=>{
    const update=()=>setVisible(playerChromeVisible());
    window.addEventListener(PLAYER_CHROME_EVENT,update);update();
    return()=>window.removeEventListener(PLAYER_CHROME_EVENT,update);
  },[]);
  useEffect(()=>{
    if(isDesktopWindow()&&document.documentElement.dataset.desktop==='macos')void desktopInvoke('set_window_controls_visible',{visible}).catch(()=>{});
  },[visible,fullscreen]);
  useEffect(()=>()=>{
    if(isDesktopWindow()&&document.documentElement.dataset.desktop==='macos')void desktopInvoke('set_window_controls_visible',{visible:true}).catch(()=>{});
  },[]);
  useEffect(() => {
    if (!isDesktopWindow()) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    const sync = async () => {
      const [maximized, nativeFullscreen] = await Promise.all([appWindow.isMaximized(), appWindow.isFullscreen()]);
      if (disposed) return;
      setMaximized(maximized);
      setFullscreen(nativeFullscreen || !!document.fullscreenElement);
      syncDesktopFullscreen(nativeFullscreen);
    };
    const refresh = () => { void sync().catch(() => {}); };
    const resize = appWindow.onResized(refresh);
    const externalError = () => notify('Не удалось открыть ссылку в браузере.');
    const updateFullscreen = () => setFullscreen(desktopFullscreen() || !!document.fullscreenElement);
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code !== 'KeyF' && event.key.toLowerCase() !== 'f') return;
      if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) void toggleDesktopFullscreen().catch(() => notify('Не удалось изменить полный экран.'));
    };
    refresh();
    document.addEventListener('fullscreenchange', refresh);
    window.addEventListener('yumiwatch:external-error', externalError);
    window.addEventListener('yumiwatch:fullscreen', updateFullscreen);
    window.addEventListener('keydown', keyboard, true);
    return () => {
      disposed = true; void resize.then(unlisten => unlisten());
      document.removeEventListener('fullscreenchange', refresh);
      window.removeEventListener('yumiwatch:external-error', externalError);
      window.removeEventListener('yumiwatch:fullscreen', updateFullscreen);
      window.removeEventListener('keydown', keyboard, true);
    };
  }, []);
  if (!isDesktopWindow() || !['macos', 'windows'].includes(document.documentElement.dataset.desktop || '') || fullscreen) return null;
  const windows = document.documentElement.dataset.desktop === 'windows';
  const action = (run: () => Promise<void>) => { void run().catch(() => notify('Не удалось изменить окно.')); };
  return <div class={`window-chrome ${visible?'':'is-hidden'}`} inert={!visible} aria-hidden={!visible}>
    <div class="window-drag-region" aria-hidden="true" onMouseDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      action(() => event.detail === 2 ? getCurrentWindow().toggleMaximize() : getCurrentWindow().startDragging());
    }}/>
    {windows && <div class="window-controls" role="group" aria-label="Управление окном">
      <button aria-label="Свернуть окно" title="Свернуть" onClick={() => action(() => getCurrentWindow().minimize())}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10"/></svg></button>
      <button aria-label={maximized ? 'Восстановить окно' : 'Развернуть окно'} title={maximized ? 'Восстановить' : 'Развернуть'} onClick={() => action(() => getCurrentWindow().toggleMaximize())}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{maximized ? <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z"/> : <path d="M1.5 1.5h9v9h-9z"/>}</svg></button>
      <button class="window-close" aria-label="Закрыть окно" title="Закрыть" onClick={() => action(() => getCurrentWindow().close())}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg></button>
    </div>}
  </div>;
}
