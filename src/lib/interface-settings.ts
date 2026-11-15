import { useEffect, useState } from 'preact/hooks';
import { readJSON, writeJSON } from './storage';
export const INTERFACE_EVENT='yumiwatch:interface-settings';
export interface InterfaceSettings { volume:number; effectsVolume:number; sounds:boolean; animations:boolean; style:'classic'|'cinema'|'contrast' }
const clamp=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
export function interfaceSettings():InterfaceSettings {
  const raw=readJSON<Partial<InterfaceSettings>>('yumiwatch:interface-settings',{});
  return {volume:clamp(raw.volume,1),effectsVolume:clamp(raw.effectsVolume,.35),sounds:raw.sounds!==false,animations:raw.animations!==false,style:['classic','cinema','contrast'].includes(raw.style||'')?raw.style!:'classic'};
}
export function saveInterfaceSettings(patch:Partial<InterfaceSettings>) {
  if(!writeJSON('yumiwatch:interface-settings',{...interfaceSettings(),...patch}))throw new Error('Не удалось сохранить настройки интерфейса.');
  window.dispatchEvent(new Event(INTERFACE_EVENT));
}
export function useInterfaceSettings(){const [settings,setSettings]=useState(interfaceSettings);useEffect(()=>{const update=()=>setSettings(interfaceSettings());window.addEventListener(INTERFACE_EVENT,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(INTERFACE_EVENT,update);window.removeEventListener('storage',update);};},[]);return settings;}
