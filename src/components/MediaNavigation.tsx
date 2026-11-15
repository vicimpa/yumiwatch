import { useEffect, useRef, useState } from 'preact/hooks';
import { useMediaQuery, useSession } from '../lib/hooks';
import { Avatar } from './UI';
import { Sidebar } from './Sidebar';
import { Icon, type IconName } from './Icon';
import { focusTarget, keyboardTargets } from '../lib/keyboard-navigation';
const sections:{href:string;icon:IconName;title:string}[]=[{href:'/',icon:'home',title:'Каталог'},{href:'/catalog',icon:'grid',title:'Все аниме'},{href:'/search',icon:'search',title:'Поиск'},{href:'/library',icon:'bookmark',title:'Моя коллекция'},{href:'/schedule',icon:'calendar',title:'Расписание'}];
const phoneSections = sections.filter(section => section.href !== '/catalog');
export function MediaNavigation({path,selected,watching=false}:{path:string;selected:string;watching?:boolean}){
 const mobile=useMediaQuery('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)'),session=useSession(),[open,setOpen]=useState(false);const root=useRef<HTMLElement>(null);
 useEffect(()=>setOpen(false),[path]);
 useEffect(()=>{const menu=()=>{if(mobile)setOpen(true);else if(root.current){const targets=keyboardTargets(root.current),target=targets.find(node=>node.matches('[aria-current=page],.active'))||targets[0];if(target)focusTarget(target);}};window.addEventListener('yumiwatch:menu',menu);return()=>window.removeEventListener('yumiwatch:menu',menu);},[mobile]);
 const content=<><a class="media-brand" tabIndex={-1} href="#/" aria-label="YummyWatch — каталог"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="38" height="38"/><span>Yummy<span>Watch</span><small>АНИМЕ ПОД РУКОЙ</small></span></a><nav class="media-navigation" aria-label="Разделы медиакаталога">{sections.map(section=><a key={section.href} href={`#${section.href}`} class={selected===section.href?'active':''} aria-current={selected===section.href?'page':undefined}><Icon name={section.icon} size={22}/><span>{section.title}</span></a>)}</nav><div class="media-system-links"><a class={path.startsWith('/settings')?'active':''} href="#/settings"><Icon name="settings" size={22}/><span>Настройки</span></a><a class="media-account" href="#/account" aria-label={session?`${session.verified?'Аккаунт':'Проверяем аккаунт'} ${session.user.nickname}`:'Войти в аккаунт'}><span class="media-account-avatar">{session?<Avatar url={session.user.avatar} name={session.user.nickname}/>:<Icon name="heart" size={20}/>}</span><span>{session?.user.nickname||'Войти'}</span></a></div></>;
 return mobile?<>
  <header class="phone-header" hidden={watching}>
   <a href="#/" class="phone-brand" aria-label="YummyWatch — каталог"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="30" height="30" alt=""/>Yummy<span>Watch</span></a>
   <a class="icon-button phone-account" href="#/account" aria-label={session?`Аккаунт ${session.user.nickname}`:'Войти в аккаунт'}>{session?<Avatar url={session.user.avatar} name={session.user.nickname}/>:<Icon name="heart" size={22}/>}</a>
  </header>
  <nav class="phone-nav" aria-label="Основные разделы" hidden={watching}>
   {phoneSections.map(section=>{const active=selected===section.href||section.href==='/'&&selected==='/catalog';return <a key={section.href} href={`#${section.href}`} class={active?'active':''} aria-current={active?'page':undefined}><Icon name={section.icon} size={22}/><span>{section.href==='/library'?'Коллекция':section.title}</span></a>;})}
   <button class={`media-menu-trigger ${path.startsWith('/settings')||path.startsWith('/account')?'active':''}`} aria-label="Открыть меню" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="list" size={22}/><span>Ещё</span></button>
  </nav>
  <Sidebar open={open&&!watching} title="Меню" close={()=>setOpen(false)} className="navigation-sidebar">{content}</Sidebar>
 </>:<aside ref={root} class={`media-nav ${watching?'is-away':''}`} aria-hidden={watching} inert={watching} aria-label="Навигация медиакаталога">{content}</aside>;
}
