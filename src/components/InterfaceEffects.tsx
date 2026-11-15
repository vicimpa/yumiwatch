import { useEffect, useRef } from 'preact/hooks';
import { useInterfaceSettings } from '../lib/interface-settings';
import { focusTarget, keyboardTargets, revealFocus } from '../lib/keyboard-navigation';

export function InterfaceEffects({onBack,watching}:{onBack:()=>void;watching:boolean}){
 const settings=useInterfaceSettings(),context=useRef<AudioContext>();const latest=useRef({settings,onBack,watching});latest.current={settings,onBack,watching};
 useEffect(()=>{
  document.documentElement.dataset.motion=settings.animations?'on':'off';document.documentElement.dataset.interfaceStyle=settings.style;
  for(const video of document.querySelectorAll('video'))video.volume=settings.volume;
 },[settings]);
 useEffect(()=>{
  let lastTarget:Element|null=null,lastTime=0,keyboardInput=false,focusFrame=0;
  const reveal=()=>{
   cancelAnimationFrame(focusFrame);
   if(keyboardInput)focusFrame=requestAnimationFrame(()=>{if(document.activeElement instanceof HTMLElement)revealFocus(document.activeElement);});
  };
  const pointerMode=()=>{keyboardInput=false;cancelAnimationFrame(focusFrame);};
  const pointer=()=>{pointerMode();unlock();};
  const keyboardFocus=(event:KeyboardEvent)=>{
   if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
   keyboardInput=true;unlock();
   if(event.defaultPrevented||event.key!=='Tab')return;
   const scope=[...document.querySelectorAll('dialog[open]')].at(-1)||document.querySelector('[data-sidebar-open=true]')||document.getElementById('app');
   if(!scope)return;
   const targets=keyboardTargets(scope);if(!targets.length)return;
   const index=targets.indexOf(document.activeElement as HTMLElement),step=event.shiftKey?-1:1;
   const next=index<0?(event.shiftKey?targets.at(-1):targets[0]):targets[(index+step+targets.length)%targets.length];
   if(next){event.preventDefault();focusTarget(next);}
  };
  const unlock=()=>{
   if(!latest.current.settings.sounds)return;
   const Context=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Context)return;
   try{context.current??=new Context();if(context.current.state==='suspended')void context.current.resume().catch(()=>{});}catch{/* Sound is optional. */}
  };
  const sound=(kind:'focus'|'activate')=>{
   const preferences=latest.current.settings,audio=context.current;
   if(!audio||audio.state!=='running'||!preferences.sounds||!preferences.volume||!preferences.effectsVolume)return;
   const now=audio.currentTime,oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';
   oscillator.frequency.setValueAtTime(kind==='focus'?720:980,now);oscillator.frequency.exponentialRampToValueAtTime(kind==='focus'?520:1240,now+.035);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.045*preferences.volume*preferences.effectsVolume,now+.004);gain.gain.exponentialRampToValueAtTime(.0001,now+.045);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.05);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  };
  const hover=(event:Event)=>{
   const target=(event.target as HTMLElement).closest('button,a[href],[role=button]');if(!target||target.hasAttribute('disabled'))return;
   const related=(event as PointerEvent).relatedTarget;if(related instanceof Node&&target.contains(related))return;
   const now=performance.now();if(target===lastTarget&&now-lastTime<90)return;lastTarget=target;lastTime=now;sound('focus');
  };
  const activate=()=>sound('activate');
  const keyboard=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
   const target=event.target instanceof HTMLElement?event.target:null;
   const vertical=event.key==='ArrowUp'||event.key==='ArrowDown',field=target?.closest('input,select');
   if(target?.closest('textarea,[contenteditable]:not([contenteditable=false])')||field&&!vertical)return;
   const sidebar=document.querySelector<HTMLElement>('[data-sidebar-open=true]'),dialog=[...document.querySelectorAll<HTMLElement>('dialog[open],.video-settings')].at(-1);
   if(event.key==='Escape'||event.key==='Backspace'){
    if(sidebar||dialog||document.fullscreenElement)return;event.preventDefault();latest.current.onBack();return;
   }
   if(event.key==='/'||event.code==='Slash'){event.preventDefault();location.hash='/search';return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||dialog&&!vertical)return;
   if(field&&vertical)event.preventDefault();
   if(latest.current.watching&&!sidebar&&['ArrowLeft','ArrowRight'].includes(event.key)&&!target?.closest('.video-toolbar button,.video-top-actions button,.native-auto-action button'))return;
   const scope=dialog||sidebar||document.getElementById('app')||document.getElementById('main');if(!scope)return;
   let candidates=keyboardTargets(scope);
   const active=document.activeElement as HTMLElement;
   const main=sidebar||document.getElementById('main');
   const first=()=>candidates.find(node=>main?.contains(node)&&node.matches('[data-nav-primary],[data-gallery-link]'))||candidates.find(node=>main?.contains(node))||candidates[0];
   if(!candidates.includes(active)){const target=first();if(target){event.preventDefault();focusTarget(target);}return;}
   const menu=active.closest('.media-nav,.navigation-sidebar');
   if(menu&&!vertical){event.preventDefault();if(event.key==='ArrowRight'&&!sidebar){const target=first();if(target)focusTarget(target);}return;}
   if(menu&&['ArrowUp','ArrowDown'].includes(event.key)){
    const targets=candidates.filter(node=>menu.contains(node)),index=targets.indexOf(active),step=event.key==='ArrowUp'?-1:1;
    event.preventDefault();focusTarget(targets[Math.max(0,Math.min(targets.length-1,index+step))]);return;
   }
   const rect=active.getBoundingClientRect(),horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
   const next=candidates.filter(node=>node!==active).map(node=>{const box=node.getBoundingClientRect(),dx=box.x+box.width/2-rect.x-rect.width/2,dy=box.y+box.height/2-rect.y-rect.height/2;return{node,along:horizontal?dx:dy,across:horizontal?dy:dx,height:box.height};}).filter(item=>item.along*direction>2&&(!horizontal||Math.abs(item.across)<=Math.max(8,Math.min(rect.height,item.height)/2))).sort((a,b)=>Math.abs(a.along)+Math.abs(a.across)*4-Math.abs(b.along)-Math.abs(b.across)*4)[0];
   if(next){event.preventDefault();focusTarget(next.node);}
  };
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('wheel',pointerMode,{passive:true,capture:true});document.addEventListener('touchstart',pointerMode,{passive:true,capture:true});document.addEventListener('keydown',keyboardFocus,true);document.addEventListener('pointerover',hover);document.addEventListener('focusin',hover);document.addEventListener('focusin',reveal);document.addEventListener('click',activate);window.addEventListener('keydown',keyboard);window.addEventListener('resize',reveal);document.addEventListener('load',reveal,true);
  return()=>{cancelAnimationFrame(focusFrame);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('wheel',pointerMode,true);document.removeEventListener('touchstart',pointerMode,true);document.removeEventListener('keydown',keyboardFocus,true);document.removeEventListener('pointerover',hover);document.removeEventListener('focusin',hover);document.removeEventListener('focusin',reveal);document.removeEventListener('click',activate);window.removeEventListener('keydown',keyboard);window.removeEventListener('resize',reveal);document.removeEventListener('load',reveal,true);void context.current?.close().catch(()=>{});};
 },[]);
 return null;
}
