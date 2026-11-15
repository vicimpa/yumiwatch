import { useEffect } from 'preact/hooks';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopInvoke,isDesktopWindow } from '../lib/desktop';
import { PLAYER_CHROME_EVENT,playerChromeVisible } from '../lib/player-chrome';

export function WindowCursor(){
  useEffect(()=>{
    if(!isDesktopWindow())return;
    const appWindow=getCurrentWindow();
    let disposed=false,inside=document.documentElement.matches(':hover'),focused=document.hasFocus(),focusRevision=0,last:boolean|undefined;
    let pending=Promise.resolve();
    const request=(visible:boolean)=>{
      if(last===visible)return;last=visible;
      pending=pending.catch(()=>{}).then(async()=>{if(!disposed||visible)await desktopInvoke('set_window_cursor_visible',{visible});});
      void pending.catch(()=>{});
    };
    const update=()=>request(playerChromeVisible()||!inside||!focused||document.visibilityState==='hidden');
    const move=()=>{inside=true;request(true);};
    const leave=()=>{inside=false;request(true);};
    const focus=appWindow.onFocusChanged(({payload})=>{focusRevision++;focused=payload;update();});
    void appWindow.isFocused().then(value=>{if(!disposed&&!focusRevision){focused=value;update();}}).catch(()=>{});
    window.addEventListener(PLAYER_CHROME_EVENT,update);
    window.addEventListener('pointermove',move,{passive:true});
    document.documentElement.addEventListener('pointerleave',leave);
    document.addEventListener('visibilitychange',update);
    update();
    return()=>{
      disposed=true;window.removeEventListener(PLAYER_CHROME_EVENT,update);window.removeEventListener('pointermove',move);
      document.documentElement.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',update);
      void focus.then(unlisten=>unlisten()).catch(()=>{});
      request(true);
    };
  },[]);
  return null;
}
