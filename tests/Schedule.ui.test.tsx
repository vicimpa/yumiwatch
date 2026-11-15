// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Schedule } from '../src/components/Pages';
import { animeSchedule } from '../src/lib/api';
import { anime } from './fixtures';
const episodeTime=()=>{const date=new Date();date.setHours(12,0,0,0);return Math.floor(date.getTime()/1000);};
const item=(title:string)=>({...anime,title,episodes:{...anime.episodes,next_date:episodeTime()}});
const reply=(title:string)=>new Response(JSON.stringify({response:[item(title)]}));
beforeEach(()=>localStorage.clear());afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('saved schedule',()=>{
 it('shows a saved schedule without waiting for the network and replaces it with fresh data',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply('Сохранённая премьера')));await animeSchedule();
  let finish!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;})));
  render(<Schedule/>);await screen.findByRole('link',{name:/Сохранённая премьера/});expect(screen.getByText('Обновляем расписание в фоне…')).toBeTruthy();expect(screen.queryByLabelText('Загрузка аниме')).toBeNull();
  finish(reply('Новая премьера'));await screen.findByRole('link',{name:/Новая премьера/});expect(screen.queryByRole('link',{name:/Сохранённая премьера/})).toBeNull();
  expect(JSON.parse(localStorage.getItem('yumiwatch:api:v1')!)['/anime/schedule?'].data[0].title).toBe('Новая премьера');
 });
 it('keeps the schedule available offline and refreshes it on reconnection',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply('Офлайн-премьера')));await animeSchedule();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
  const {container}=render(<Schedule/>);await screen.findByRole('link',{name:/Офлайн-премьера/});await screen.findByText(/Сохранённое расписание от/);const status=container.querySelector('.schedule-status');expect(screen.queryByText('Не удалось загрузить')).toBeNull();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply('После подключения')));fireEvent(window,new Event('online'));await screen.findByRole('link',{name:/После подключения/});await waitFor(()=>expect(status?.textContent).toBe(''));expect(container.querySelector('.schedule-status')).toBe(status);
 });
});
