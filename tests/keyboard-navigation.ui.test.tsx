// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { InterfaceEffects } from '../src/components/InterfaceEffects';
import { focusTarget, keyboardTargets } from '../src/lib/keyboard-navigation';

function layout() {
  for (const node of document.querySelectorAll<HTMLElement>('a,button,input,select,main,aside,article,div')) {
    vi.spyOn(node,'getClientRects').mockImplementation(()=>({length:node.closest('[hidden]')?0:1} as DOMRectList));
  }
}
beforeEach(()=>{localStorage.clear();});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('keyboard focus and scroll visibility',()=>{
  it('moves vertically out of form fields without changing values and keeps Right in the same row',()=>{
    render(<div id="app"><InterfaceEffects onBack={()=>{}} watching={false}/><main id="main"><input aria-label="Число" type="number" value="7"/><select aria-label="Вариант"><option>A</option><option>B</option></select><button>Ниже</button></main></div>);layout();
    const number=screen.getByRole('spinbutton') as HTMLInputElement,select=screen.getByRole('combobox') as HTMLSelectElement,button=screen.getByRole('button');
    [number,select,button].forEach((node,index)=>vi.spyOn(node,'getBoundingClientRect').mockReturnValue({x:0,y:index*80,width:200,height:40} as DOMRect));
    number.focus();expect(fireEvent.keyDown(number,{key:'ArrowDown'})).toBe(false);expect(document.activeElement).toBe(select);expect(number.value).toBe('7');
    expect(fireEvent.keyDown(select,{key:'ArrowDown'})).toBe(false);expect(document.activeElement).toBe(button);expect(select.value).toBe('A');
    button.focus();fireEvent.keyDown(button,{key:'ArrowRight'});expect(document.activeElement).toBe(button);
  });
  it('starts on the visible route instead of a retained hidden gallery or a poster marked tabindex=-1',()=>{
    render(<div id="app"><InterfaceEffects onBack={()=>{}} watching={false}/><main id="main" tabIndex={-1}>
      <div hidden><a data-gallery-link href="#old">Старая карточка</a></div>
      <a href="#image" tabIndex={-1} aria-hidden="true">Постер</a>
      <a data-gallery-link href="#new">Новая карточка</a>
    </main></div>);layout();document.getElementById('main')!.focus();
    fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});
    expect(document.activeElement).toBe(screen.getByRole('link',{name:'Новая карточка'}));
    expect(keyboardTargets(document.getElementById('main')!)).toHaveLength(1);
  });
  it('moves up and down through menu links and leaves the menu with Right',()=>{
    render(<div id="app"><InterfaceEffects onBack={()=>{}} watching={false}/><aside class="media-nav">
      <a href="#catalog">Каталог</a><a href="#search">Поиск</a><a href="#settings">Настройки</a>
    </aside><main id="main"><button data-nav-primary>Открыть карточку</button></main></div>);layout();
    screen.getByRole('link',{name:'Каталог'}).focus();fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});
    expect(document.activeElement).toBe(screen.getByRole('link',{name:'Поиск'}));
    fireEvent.keyDown(document.activeElement!,{key:'ArrowUp'});expect(document.activeElement).toBe(screen.getByRole('link',{name:'Каталог'}));
    fireEvent.keyDown(document.activeElement!,{key:'ArrowRight'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Открыть карточку'}));
  });
  it('keeps Tab inside the active dialog and leaves Enter to native link/button activation',()=>{
    render(<div id="app"><InterfaceEffects onBack={()=>{}} watching={false}/><button>Фон</button>
      <dialog open><button>Старый диалог</button></dialog>
      <dialog open><button>Первый</button><input aria-label="Текст"/><button>Последний</button></dialog>
    </div>);layout();screen.getByRole('button',{name:'Последний'}).focus();
    fireEvent.keyDown(document.activeElement!,{key:'Tab'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Первый'}));
    fireEvent.keyDown(document.activeElement!,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Последний'}));
    expect(fireEvent.keyDown(document.activeElement!,{key:'Enter'})).toBe(true);
  });
  it.each([false,true])('reveals a whole card in its own scroll panel (reduced motion: %s)',reduced=>{
    vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:reduced}));
    const {container}=render(<main class="media-scroll" style={{overflowY:'auto'}}><article data-gallery-item><a href="#anime">Название</a></article></main>);
    const panel=container.querySelector('main')!,card=container.querySelector('article')!,link=container.querySelector('a')!;
    const box=(x:number,y:number,width:number,height:number)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height} as DOMRect);
    vi.spyOn(panel,'getBoundingClientRect').mockReturnValue(box(200,0,800,500));
    vi.spyOn(card,'getBoundingClientRect').mockReturnValue(box(240,700,180,300));
    vi.spyOn(link,'getBoundingClientRect').mockReturnValue(box(240,970,180,30));
    Object.defineProperties(panel,{clientHeight:{value:500},scrollHeight:{value:2000},clientWidth:{value:800},scrollWidth:{value:800},scrollTo:{value:vi.fn()}});
    focusTarget(link);
    expect(document.activeElement).toBe(link);
    expect(panel.scrollTo).toHaveBeenCalledWith({left:0,top:512,behavior:reduced?'instant':'smooth'});
    expect(document.documentElement.scrollTop).toBe(0);
  });
});
