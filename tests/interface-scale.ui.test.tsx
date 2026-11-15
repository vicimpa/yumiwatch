// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { InterfaceSettingsCard } from '../src/components/InterfaceSettings';
import { interfaceSettings, saveInterfaceSettings } from '../src/lib/interface-settings';
import { applyInterfaceScale } from '../src/lib/interface-scale';
const native=vi.hoisted(()=>({enabled:true,invoke:vi.fn().mockResolvedValue(1)}));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>native.enabled,invoke:native.invoke}));
beforeEach(()=>{localStorage.clear();native.enabled=true;native.invoke.mockClear();delete document.documentElement.dataset.mobile;document.documentElement.dataset.desktop='linux';});
afterEach(()=>{cleanup();delete document.documentElement.dataset.desktop;});
describe('Linux interface scale',()=>{
 it('uses system DPI by default and persists a manual override and reset',async()=>{
  render(<InterfaceSettingsCard/>);const scale=screen.getByRole('combobox',{name:'Масштаб интерфейса'}) as HTMLSelectElement;
  expect(scale.value).toBe('system');await applyInterfaceScale();expect(native.invoke).toHaveBeenLastCalledWith('set_interface_scale',{scale:null});
  fireEvent.change(scale,{target:{value:'1.5'}});expect(interfaceSettings().scale).toBe(1.5);
  await applyInterfaceScale();expect(native.invoke).toHaveBeenLastCalledWith('set_interface_scale',{scale:1.5});
  fireEvent.change(scale,{target:{value:'system'}});await applyInterfaceScale();expect(native.invoke).toHaveBeenLastCalledWith('set_interface_scale',{scale:null});
 });
 it('ignores malformed stored scales and does not zoom mobile or non-Linux views',async()=>{
  for(const scale of [0,-1,100,'1.5',null]){saveInterfaceSettings({scale:scale as number});expect(interfaceSettings().scale).toBe('system');}
  for(const platform of ['macos','windows','android','ios']){document.documentElement.dataset.desktop=platform;await applyInterfaceScale();}
  native.enabled=false;document.documentElement.dataset.desktop='linux';await applyInterfaceScale();expect(native.invoke).not.toHaveBeenCalled();
 });
});
