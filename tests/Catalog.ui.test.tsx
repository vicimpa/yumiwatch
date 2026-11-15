// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Catalog } from '../src/components/Catalog';
import { animeList } from '../src/lib/api';
import { catalogParams, parseCatalogQuery } from '../src/lib/filters';
import { clearSession } from '../src/lib/session';
import { anime } from './fixtures';
const data = (offset: number, prefix = 'Аниме') => Array.from({ length: 24 }, (_, index) => ({ ...anime, anime_id: offset + index + 1, title: `${prefix} ${offset + index}` }));
const reply = (value: unknown) => new Response(JSON.stringify({ response: value }));
beforeEach(() => { clearSession(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('catalog background refresh', () => {
  it('shows cached pages immediately, refreshes them in place, and keeps later loading independent', async () => {
    const params = catalogParams(parseCatalogQuery(''));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((raw: string) => Promise.resolve(reply(data(Number(new URL(raw).searchParams.get('offset') || 0))))));
    await animeList(params); await animeList({ ...params, offset: 24 });
    const finish: Record<number, (value: Response) => void> = {};
    const fetcher = vi.fn().mockImplementation((raw: string) => new Promise<Response>(resolve => { finish[Number(new URL(raw).searchParams.get('offset') || 0)] = resolve; })); vi.stubGlobal('fetch', fetcher);
    const {container}=render(<Catalog query=""/>);
    await screen.findByRole('link', { name: 'Аниме 0' });
    expect(screen.getByText('Обновляем каталог в фоне…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
    await screen.findByRole('link', { name: 'Аниме 47' });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
    expect(screen.getByRole('status',{name:'Загрузка аниме'})).toBeTruthy();
    finish[24](reply(data(24, 'Обновлено')));
    await screen.findByRole('link', { name: 'Обновлено 47' });
    expect(screen.getByRole('status',{name:'Загрузка аниме'})).toBeTruthy();
    finish[0](reply(data(0, 'Свежее')));
    await screen.findByRole('link', { name: 'Свежее 0' });
    expect(screen.getByRole('link', { name: 'Обновлено 47' })).toBeTruthy();
    finish[48](reply(data(48)));
    await waitFor(()=>expect(container.querySelector('[data-total-items]')?.getAttribute('data-total-items')).toBe('72'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  });
});
