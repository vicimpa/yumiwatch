// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { InterfaceEffects } from '../src/components/InterfaceEffects';
import { InterfaceSettingsCard } from '../src/components/InterfaceSettings';
import { interfaceSettings, saveInterfaceSettings } from '../src/lib/interface-settings';
beforeEach(()=>{localStorage.clear();});afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();delete document.documentElement.dataset.motion;delete document.documentElement.dataset.interfaceStyle;});
describe('media center preferences and sound',()=>{
 it('persists master volume, effects volume, animation and appearance and applies master volume to video',()=>{
  render(<><InterfaceEffects onBack={()=>{}} watching={false}/><video/><InterfaceSettingsCard/></>);
  fireEvent.input(screen.getByRole('slider',{name:'Общая громкость'}),{target:{value:'.25'}});
  fireEvent.input(screen.getByRole('slider',{name:'Громкость интерфейса'}),{target:{value:'.5'}});
  fireEvent.click(screen.getByRole('checkbox',{name:'Анимации переходов и боковых панелей'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Стиль интерфейса'}),{target:{value:'contrast'}});
  expect(interfaceSettings()).toMatchObject({volume:.25,effectsVolume:.5,animations:false,style:'contrast'});
  expect(document.querySelector('video')!.volume).toBe(.25);expect(document.documentElement.dataset.motion).toBe('off');expect(document.documentElement.dataset.interfaceStyle).toBe('contrast');
 });
 it('plays a short focus sound after a gesture and respects the sound toggle and zero master volume',()=>{
  const start=vi.fn(),close=vi.fn().mockResolvedValue(undefined);
  const parameter=()=>({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
  vi.stubGlobal('AudioContext',class{state='running';currentTime=0;destination={};close=close;resume=vi.fn().mockResolvedValue(undefined);createOscillator(){return{type:'sine',frequency:parameter(),connect:vi.fn(),start,stop:vi.fn(),disconnect:vi.fn()};}createGain(){return{gain:parameter(),connect:vi.fn(),disconnect:vi.fn()};}});
  render(<><InterfaceEffects onBack={()=>{}} watching={false}/><button>Первый</button><button>Второй</button></>);
  const first=screen.getByRole('button',{name:'Первый'}),second=screen.getByRole('button',{name:'Второй'});
  fireEvent.pointerOver(first);expect(start).not.toHaveBeenCalled();fireEvent.pointerDown(first);fireEvent.pointerOver(second);expect(start).toHaveBeenCalledOnce();
  act(()=>{saveInterfaceSettings({sounds:false});});fireEvent.pointerOver(first);expect(start).toHaveBeenCalledOnce();
  act(()=>{saveInterfaceSettings({sounds:true,volume:0});});fireEvent.pointerOver(second);expect(start).toHaveBeenCalledOnce();
  cleanup();expect(close).toHaveBeenCalledOnce();
 });
 it('uses Escape for back only when no panel, field or fullscreen is active',()=>{
  const back=vi.fn();render(<><InterfaceEffects onBack={back} watching={false}/><input aria-label="Поле"/><aside data-sidebar-open="true"><button>Закрыть</button></aside></>);
  fireEvent.keyDown(document.body,{key:'Escape'});expect(back).not.toHaveBeenCalled();document.querySelector('aside')!.remove();
  fireEvent.keyDown(screen.getByRole('textbox',{name:'Поле'}),{key:'Escape'});expect(back).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body,{key:'Escape'});expect(back).toHaveBeenCalledOnce();
 });
 it('validates stored values instead of passing invalid volume to media elements',()=>{
  localStorage.setItem('yumiwatch:interface-settings',JSON.stringify({volume:3,effectsVolume:-1,style:'unknown'}));
  expect(interfaceSettings()).toMatchObject({volume:1,effectsVolume:0,style:'classic'});
 });
});
