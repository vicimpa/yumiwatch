// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Player } from '../src/components/Player';
import { readLibrary } from '../src/lib/storage';
import { clearSession, saveSession } from '../src/lib/session';
import { anime, video } from './fixtures';
beforeEach(() => {
  clearSession();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: [video('1'), video('2'), video('1', 'AniDub'), video('2', 'AniDub')] }))));
});
afterEach(() => { cleanup(); clearSession(); vi.unstubAllGlobals(); });
describe('watch flow', () => {
  it('loads the iframe only on play, then records series and changes the episode', async () => {
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Смотреть серию 1' });
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Смотреть серию 1' }));
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniLibria/1/1'));
    expect(readLibrary().history[0].episode).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Следующая серия' }));
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniLibria/1/2'));
    expect(readLibrary().history[0].episode).toBe('2');
    expect((screen.getByRole('button', { name: 'Следующая серия' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('preserves the series when switching dubbing while playing', async () => {
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Серия 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Серия 2' }));
    const select = screen.getByRole('combobox');
    const option = Array.from((select as HTMLSelectElement).options).find(o => o.text.includes('AniDub'))!;
    fireEvent.change(select, { target: { value: option.value } });
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniDub/1/2'));
    expect(readLibrary().history[0]).toMatchObject({ episode: '2', videoId: video('2', 'AniDub').video_id });
  });
  it('handles an anime with no available players', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: [] }))));
    const { container } = render(<Player anime={anime}/>);
    await screen.findByText('Серии пока не появились');
    expect(container.querySelector('iframe')).toBeNull();
  });
  it('accepts progress only from the active iframe and its expected origin', async () => {
    saveSession({ token: 'test-user', user: { id: 42, nickname: 'Viewer' }, remember: false, verified: true, refreshedAt: Date.now() });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ response: [video('1')] }))).mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ response: true }))));
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Смотреть серию 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Смотреть серию 1' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const frame = container.querySelector('iframe')!;
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://attacker.example', data: { key: 'player_time_update', value: 999 } }));
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://player.example', data: { key: 'player_time_update', value: 999 } }));
    window.dispatchEvent(new Event('pagehide'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://player.example', data: { key: 'player_time_update', value: 333 } }));
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ time: 333 });
  });
});
