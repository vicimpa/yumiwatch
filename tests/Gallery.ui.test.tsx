// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { Gallery } from '../src/components/Gallery';
import { navigateGallery } from '../src/lib/gallery-navigation';
import { clearSession } from '../src/lib/session';
import { anime } from './fixtures';
beforeEach(()=>{clearSession();localStorage.clear();vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({response:[anime,{...anime,anime_id:10532,title:'Второе аниме'}]})))));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('catalog gallery',()=>{
 it('does not mistake a wrapped neighboring title for the row above',()=>{
  render(<section onKeyDown={navigateGallery}><div data-gallery-row>{['Коротко','Длинное название в две строки'].map(name=><article data-gallery-item key={name}><a data-gallery-link href={`#${name}`}>{name}</a></article>)}</div></section>);
  const links=screen.getAllByRole('link');links.forEach((link,index)=>{
   vi.spyOn(link,'getClientRects').mockReturnValue({length:1} as DOMRectList);
   vi.spyOn(link,'getBoundingClientRect').mockReturnValue({x:index*200,y:250,top:250,width:180,height:index?60:20} as DOMRect);
   vi.spyOn(link.closest('article')!,'getBoundingClientRect').mockReturnValue({x:index*200,y:0,top:0,width:180,height:320} as DOMRect);
  });
  links[1].focus();fireEvent.keyDown(links[1],{key:'ArrowUp'});expect(document.activeElement).toBe(links[1]);
 });
 it('opens poster cards as previews and updates the selected item without loading playback',async()=>{
  const {container}=render(<Gallery/>);const rail=await screen.findByRole('region',{name:'Лучшие аниме'});
  const link=await within(rail).findByRole('link',{name:'Второе аниме'});expect(link.getAttribute('href')).toBe('#/anime/10532?view=anime-about');
  fireEvent.focusIn(link);expect(within(screen.getByRole('region',{name:'Выбранное аниме'})).getByRole('heading',{name:'Второе аниме'})).toBeTruthy();
  expect(container.querySelector('iframe,video')).toBeNull();expect(screen.getByRole('navigation',{name:'Действия каталога'})).toBeTruthy();
 });
 it('closes its filters when the retained gallery becomes inactive',async()=>{
  const {rerender}=render(<Gallery/>);fireEvent.click(screen.getByRole('button',{name:'Фильтры'}));expect(screen.getByRole('dialog')).toBeTruthy();
  rerender(<Gallery active={false}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden');
  rerender(<Gallery/>);expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('moves by poster position and leaves ordinary actions to the browser',()=>{
  render(<section onKeyDown={navigateGallery}><div data-gallery-row>{['A','B','C','D'].map(name=><a key={name} data-gallery-link href={`#${name}`}>{name}</a>)}</div></section>);
  const links=screen.getAllByRole('link');links.forEach((link,index)=>{vi.spyOn(link,'getClientRects').mockReturnValue({length:1} as DOMRectList);vi.spyOn(link,'getBoundingClientRect').mockReturnValue({x:index%2*200,y:Math.floor(index/2)*300,width:180,height:30} as DOMRect);});
  links[0].focus();fireEvent.keyDown(links[0],{key:'ArrowRight'});expect(document.activeElement).toBe(links[1]);
  fireEvent.keyDown(links[1],{key:'ArrowDown'});expect(document.activeElement).toBe(links[3]);
  fireEvent.keyDown(links[3],{key:'ArrowLeft'});expect(document.activeElement).toBe(links[2]);
  fireEvent.keyDown(links[2],{key:'ArrowUp'});expect(document.activeElement).toBe(links[0]);
  fireEvent.keyDown(links[0],{key:'End'});expect(document.activeElement).toBe(links[3]);
  expect(fireEvent.keyDown(links[3],{key:'Enter'})).toBe(true);
 });
});
