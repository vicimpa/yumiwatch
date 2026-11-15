// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../src/App';
import { clearSession, saveSession } from '../src/lib/session';
import { resolveStream } from '../src/lib/streams';
import { savePlaybackSettings } from '../src/lib/playback-settings';
import { anime, video } from './fixtures';
vi.mock('../src/lib/streams',async original=>({...await original<typeof import('../src/lib/streams')>(),resolveStream:vi.fn()}));
beforeEach(() => {
  clearSession(); localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(window, 'scrollTo').mockImplementation(()=>{});
  vi.stubGlobal('fetch', vi.fn().mockImplementation((raw: string) => {
    const url = new URL(raw);
    if (url.pathname.endsWith('/genres')) return Promise.resolve(new Response(JSON.stringify({ response: { genres: [] } })));
    const offset = Number(url.searchParams.get('offset') || 0);
    return Promise.resolve(new Response(JSON.stringify({ response: Array.from({ length: 24 }, (_, i) => ({ ...anime, anime_id: 100 + offset + i, title: `Аниме ${offset + i}` })) })));
  }));
});
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('mobile navigation state', () => {
  it('replaces application navigation with the native player and restores it on return',async()=>{
    savePlaybackSettings({mode:'source'});history.replaceState(null,'','#/anime/10531?view=watch');
    vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
    vi.mocked(resolveStream).mockResolvedValue({provider:'Test',videoId:video('1').video_id,duration:1400,streams:[{quality:360,type:'mp4',url:'https://cdn.example/test.mp4'}]});
    vi.stubGlobal('fetch',vi.fn().mockImplementation((raw:string)=>Promise.resolve(new Response(JSON.stringify({response:new URL(raw).pathname.endsWith('/videos')?[video('1')]:anime})))));
    const {container}=render(<App/>);await screen.findByRole('button',{name:'Серии'});
    expect(container.querySelector('.topbar,.mobile-tabs,.site-footer,iframe')).toBeNull();expect(container.querySelector('video')).not.toBeNull();expect(container.querySelector('.media-nav')?.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Об аниме'}));await screen.findByRole('link',{name:/(Начать|Продолжить) просмотр/});
    expect(screen.getByRole('navigation',{name:'Разделы медиакаталога'})).toBeTruthy();expect(container.querySelector('video')).toBeNull();
  });
  it('shows the stored avatar while the account cannot yet be verified offline', async () => {
    saveSession({ token: 'offline-avatar-user', user: { id: 42, nickname: 'Viewer', avatar: '//static.yani.tv/users/small/42.webp?v=2' }, verified: false, remember: false, refreshedAt: Date.now() });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    history.replaceState(null, '', '#/account');
    render(<App/>);
    const entry = screen.getByRole('link', { name: 'Проверяем аккаунт Viewer' });
    expect(entry.querySelector('img')?.getAttribute('src')).toBe('https://static.yani.tv/users/small/42.webp?v=2');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Нет связи с Yani'));
    expect(entry.querySelector('img')).not.toBeNull();
    saveSession({ token: 'offline-avatar-user', user: { id: 42, nickname: 'Viewer', avatar: '//static.yani.tv/users/small/42.webp?v=3' }, verified: false, remember: false, refreshedAt: Date.now() });
    await waitFor(() => expect(entry.querySelector('img')?.getAttribute('src')).toContain('v=3'));
  });
  it('keeps loaded catalog pages and document position when returning from search', async () => {
    history.replaceState(null, '', '#/catalog');
    render(<App/>);
    await screen.findByRole('link', { name: /Аниме 0/ });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
    await screen.findByRole('link', { name: /Аниме 47/ });
    const scroll=document.getElementById('main')!;scroll.scrollTop=700;
    location.hash = '/search';
    await screen.findByRole('heading', { name: 'Найди своё аниме' });
    await waitFor(() => expect(scroll.scrollTop).toBe(0));
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Поиск аниме' }));
    location.hash = '/catalog';
    await screen.findByRole('link', { name: /Аниме 47/ });
    await waitFor(() => expect(scroll.scrollTop).toBe(700));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
  it('closes the filter screen when leaving a retained catalog', async () => {
    history.replaceState(null, '', '#/catalog');
    render(<App/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Фильтры' }));
    expect(document.body.style.overflow).toBe('hidden');
    location.hash = '/search';
    await screen.findByRole('heading', { name: 'Найди своё аниме' });
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
