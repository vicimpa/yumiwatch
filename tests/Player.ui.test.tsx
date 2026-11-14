// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Player } from '../src/components/Player';
import { readLibrary } from '../src/lib/storage';
import { clearSession, saveSession } from '../src/lib/session';
import { anime, video } from './fixtures';
const reply = (response: unknown) => new Response(JSON.stringify({ response }));
function message(frame: HTMLIFrameElement, data: unknown, origin = new URL(frame.src).origin, source: Window | null = frame.contentWindow) {
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
}
beforeEach(() => {
  clearSession(); localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply([video('1'), video('2'), video('1', 'AniDub'), video('2', 'AniDub')]))));
});
afterEach(() => { cleanup(); clearSession(); vi.unstubAllGlobals(); });
describe('mobile watch flow', () => {
  it('opens series and dubbing as separate mobile screens while preserving the episode', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<Player anime={anime}/>);
    fireEvent.click(await screen.findByRole('button', { name: /Все серии/ }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Серия 2' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniLibria/1/2'));
    fireEvent.click(screen.getByRole('button', { name: /Озвучка.*AniLibria/ }));
    expect(screen.queryByRole('button', { name: 'Серия 2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /AniDub.*2 серий/ }));
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniDub/1/2'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readLibrary().history).toEqual([]);
  });
  it('preloads the iframe without an extra Play screen and records only playback', async () => {
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Серия 1' });
    const frame = container.querySelector('iframe')!;
    expect(frame.src).toContain('/AniLibria/1/1');
    expect(screen.queryByRole('button', { name: 'Смотреть серию 1' })).toBeNull();
    expect(readLibrary().history).toEqual([]);
    message(frame, { key: 'player_play' });
    await waitFor(() => expect(readLibrary().history[0]?.episode).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Следующая серия' }));
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniLibria/1/2'));
    message(container.querySelector('iframe')!, { key: 'player_play' });
    await waitFor(() => expect(readLibrary().history[0]?.episode).toBe('2'));
    expect((screen.getByRole('button', { name: 'Следующая серия' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps the selected episode while changing dubbing with separate controls', async () => {
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Серия 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Серия 2' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Озвучка' }), { target: { value: 'AniDub' } });
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/AniDub/1/2'));
    expect(screen.getByRole('combobox', { name: 'Плеер' })).toBeTruthy();
  });
  it('shows actual episode screenshots with watched progress', async () => {
    render(<Player anime={{ ...anime, random_screenshots: [{ episode: '2', time: 200, sizes: { small: 'https://static.yani.tv/frame.webp', full: 'https://static.yani.tv/frame.avif' } }] }} history={{ anime, episode: '2', videoId: video('2').video_id, group: '', updatedAt: Date.now(), position: 120, duration: 1400 }}/>);
    const image = await screen.findByAltText('Кадр серии 2');
    expect(image.getAttribute('src')).toBe('https://static.yani.tv/frame.webp');
    expect(screen.getByText('Просмотрено 02:00')).toBeTruthy();
    expect(screen.getByText(/Остановились на/)).toBeTruthy();
  });
  it('handles an anime with no available players', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply([])));
    const { container } = render(<Player anime={anime}/>);
    await screen.findByText('Серии пока не появились'); expect(container.querySelector('iframe')).toBeNull();
  });
  it('accepts progress only from the active iframe and its expected origin', async () => {
    saveSession({ token: 'test-user', user: { id: 42, nickname: 'Viewer' }, remember: false, verified: true, refreshedAt: Date.now() });
    const fetcher = vi.fn().mockResolvedValueOnce(reply([video('1')])).mockImplementation(() => Promise.resolve(reply(true))); vi.stubGlobal('fetch', fetcher);
    const { container } = render(<Player anime={anime}/>);
    await screen.findByRole('button', { name: 'Серия 1' });
    const frame = container.querySelector('iframe')!;
    expect(fetcher).toHaveBeenCalledTimes(1);
    message(frame, { key: 'player_time_update', value: 999 }, 'https://attacker.example');
    message(frame, { key: 'player_time_update', value: 999 }, 'https://player.example', window);
    window.dispatchEvent(new Event('pagehide')); expect(fetcher).toHaveBeenCalledTimes(1);
    message(frame, { key: 'player_time_update', value: 333 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ time: 333 });
  });
  it('restores Aksor to the saved timestamp after duration becomes available', async () => {
    const current = { ...video('1'), iframe_url: 'https://player.aksor.tv/video/example' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply([current])));
    const { container } = render(<Player anime={anime} history={{ anime, episode: '1', videoId: current.video_id, group: '', updatedAt: Date.now(), position: 120, duration: 1400 }}/>);
    await screen.findByRole('button', { name: 'Серия 1' });
    const frame = container.querySelector('iframe')!;
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    message(frame, { key: 'kodik_player_duration_update', value: 1400 });
    expect(send).toHaveBeenCalledWith({ key: 'player_seek', value: 115 }, 'https://player.aksor.tv');
    message(frame, { key: 'kodik_player_time_update', value: 115 });
    expect(readLibrary().history).toHaveLength(0);
    await waitFor(() => expect(container.querySelector('.watch-clock')?.textContent).toContain('01:55'));
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд на 10 секунд' }));
    expect(send).toHaveBeenCalledWith({ key: 'player_seek', value: 125 }, 'https://player.aksor.tv');
  });
});
