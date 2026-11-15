import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
export const AUTO_ACTION_DELAY_MS=5000;
export function AutoActionCountdown({label,onComplete,onCancel,onNow}:{label:string;onComplete:()=>void;onCancel:()=>void;onNow:()=>void}){
 const [seconds,setSeconds]=useState(AUTO_ACTION_DELAY_MS/1000),done=useRef(false),timer=useRef<ReturnType<typeof setInterval>>();
 const callbacks=useRef({onComplete,onCancel,onNow});callbacks.current={onComplete,onCancel,onNow};
 const findHost=()=>document.querySelector<HTMLElement>('[data-sidebar-open=true]');
 const [host,setHost]=useState(findHost);
 const finish=(action:'onComplete'|'onCancel'|'onNow')=>{if(done.current)return;done.current=true;clearInterval(timer.current);callbacks.current[action]();};
 useLayoutEffect(()=>{const deadline=performance.now()+AUTO_ACTION_DELAY_MS;timer.current=setInterval(()=>{const left=deadline-performance.now();if(left<=0)finish('onComplete');else setSeconds(Math.ceil(left/1000));},100);return()=>clearInterval(timer.current);},[]);
 useLayoutEffect(()=>{const update=()=>setHost(findHost());const observer=new MutationObserver(update);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sidebar-open']});return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();finish('onCancel');}};document.addEventListener('keydown',keyboard,true);return()=>document.removeEventListener('keydown',keyboard,true);},[]);
 const content=<div class={`native-auto-action ${host?'is-in-sidebar':''}`} role="group" aria-label={label}><span role="status" aria-live="polite">{label} через <strong>{seconds}</strong> с</span><div><button class="button secondary" aria-keyshortcuts="Escape" onClick={()=>finish('onCancel')}>Отмена</button><button class="button primary" onClick={()=>finish('onNow')}>Сейчас</button></div></div>;
 return host?createPortal(content,host):content;
}
