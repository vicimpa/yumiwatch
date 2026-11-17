// @vitest-environment jsdom
import { useDiscordPresence } from '~/hooks/useDiscordPresence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { AUTO_ACTION_DELAY_MS } from '~/components/AutoActionCountdown';
import { Player } from '~/components/Player';
import { resolveStream } from '~/lib/streams';
import { probeAudioPlayback } from '~/lib/autoplay';
import { readPlaybackRecovery } from '~/lib/playback-recovery';
import { savePlaybackSettings } from '~/lib/playback-settings';
import { clearSession, saveSession } from '~/lib/session';
import { getLibraryState, resetAccountLibrary } from '~/lib/library';
import { readLibrary } from '~/lib/storage';
import { anime, video } from './fixtures';
import { putCache } from '~/lib/cache-store';

vi.mock('~/hooks/useDiscordPresence', () => ({ useDiscordPresence: vi.fn() }));

vi.mock('~/lib/autoplay', () => ({ probeAudioPlayback: vi.fn().mockResolvedValue(false) }));
vi.mock('shaka-player', () => ({
  default: {
    polyfill: { installAll: () => {} },
    Player: class {
      static isBrowserSupported() {
        return false;
      }
    },
  },
}));

function mediaError(media: HTMLMediaElement) {
  Object.defineProperty(media, 'error', { value: { code: 2 }, configurable: true });
  fireEvent.error(media);
}

vi.mock('~/lib/streams', async original => ({
  ...(await original<typeof import('~/lib/streams')>()),
  resolveStream: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(probeAudioPlayback).mockReset().mockResolvedValue(false);
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  resetAccountLibrary();
  savePlaybackSettings({ mode: 'universal' });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ response: [video('1'), video('2'), video('1', 'AniDub')] }))
        )
      )
  );
  vi.mocked(resolveStream).mockResolvedValue({
    provider: 'Test',
    videoId: video('1').video_id,
    duration: 1400,
    streams: [
      { quality: 360, type: 'mp4', url: 'https://cdn.example/360.mp4' },
      { quality: 720, type: 'mp4', url: 'https://cdn.example/720.mp4' },
    ],
  });
});
afterEach(() => {
  cleanup();
  clearSession();
  resetAccountLibrary();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('our player mode', () => {
  it('tries the same Kodik video as MP4 before discarding its provider and keeps the saved position', async () => {
    const source = video('1');
    vi.mocked(resolveStream).mockClear();
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'Kodik',
      videoId: source.video_id,
      duration: 5971,
      streams: [
        {
          quality: 720,
          type: 'hls',
          url: 'https://cdn.example/video.m3u8',
          fallback: { type: 'mp4', url: 'https://cdn.example/video.mp4' },
        },
      ],
    });
    const ready = vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
    const { container } = render(
      <Player
        anime={anime}
        history={{
          anime,
          videoId: source.video_id,
          episode: '1',
          group: '',
          position: 2110,
          duration: 5971,
          updatedAt: Date.now(),
        }}
      />
    );

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toBe(
        'https://cdn.example/video.mp4'
      )
    );
    const media = container.querySelector('video')!;
    Object.defineProperty(media, 'duration', { value: 5971, configurable: true });
    ready.mockReturnValue(4);
    fireEvent.loadedMetadata(media);
    fireEvent.loadedData(media);
    expect(media.currentTime).toBe(2110);
    expect(media.getAttribute('crossorigin')).toBeNull();
    expect(resolveStream).toHaveBeenCalledOnce();
    expect(container.querySelector('.playback-loader.is-error')).toBeNull();

    // A failed MP4 must still leave the player recoverable rather than hang
    // behind the old HLS failure flag or repeat the format switch forever.
    mediaError(media);
    await screen.findByRole('button', { name: 'Повторить загрузку' }, { timeout: 3000 });
    expect(resolveStream).toHaveBeenCalledOnce();
  });
  it('does not rewind on repeated decoder metadata during accelerated playback', async () => {
    const { container } = render(
      <Player
        anime={anime}
        history={{
          anime,
          episode: '1',
          videoId: video('1').video_id,
          group: '',
          updatedAt: Date.now(),
          position: 120,
          duration: 1400,
        }}
      />
    );

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    const media = container.querySelector('video')!;

    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(120);
    media.playbackRate = 2;
    media.currentTime = 180;
    fireEvent.timeUpdate(media);
    // Metadata can repeat between timeupdate events; neither layer may restore
    // an old history position or even the previous timeupdate's position.
    media.currentTime = 184;
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(184);
    media.currentTime = 188;
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(188);
  });

  it('updates cached episodes in the background without resetting the chosen episode or decoder', async () => {
    putCache('data', `/anime/${anime.anime_id}/videos?`, [video('1'), video('2')]);

    let finish!: (response: Response) => void;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>(resolve => {
          finish = resolve;
        })
      )
    );
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'Test',
      videoId: video('2').video_id,
      duration: 1400,
      streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/episode-2.mp4' }],
    });

    const { container } = render(
      <Player anime={anime} preferredEpisode="2" preferredVoice="AniLibria" />
    );

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('episode-2')
    );

    const media = container.querySelector('video')!;

    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    fireEvent.loadedMetadata(media);
    media.currentTime = 123;
    fireEvent.timeUpdate(media);
    finish(new Response(JSON.stringify({ response: [video('1'), video('2'), video('3')] })));
    fireEvent.click(screen.getByRole('button', { name: 'Серии' }));
    await screen.findByRole('button', { name: 'Серия 3' });
    expect(container.querySelector('video')).toBe(media);
    expect(media.currentTime).toBe(123);
    expect(container.querySelector('.video-heading strong')?.textContent).toContain('серия 2');
  });
  it('loads native video without an iframe or an extra Play button, and keeps playback when returning to source mode', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toBe(
        'https://cdn.example/360.mp4'
      )
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: /Смотреть серию/ })).toBeNull();
    expect(readLibrary().history).toEqual([]);

    const media = container.querySelector('video')!;

    Object.defineProperty(media, 'paused', { value: false, configurable: true });
    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    fireEvent.loadedMetadata(media);
    media.currentTime = 123;
    fireEvent.play(media);
    fireEvent.timeUpdate(media);
    fireEvent.click(screen.getByRole('button', { name: 'Плеер: Наш плеер' }));
    fireEvent.click(screen.getByRole('button', { name: /Player 1/ }));
    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
    expect(readLibrary().history[0].position).toBe(123);
    await waitFor(() =>
      expect(container.querySelector('.resume-notice')?.textContent).toContain('02:03')
    );
  });
  it('lists our player first alongside providers and keeps quality inside its controls', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Плеер: Наш плеер' }));

    const options = within(screen.getByRole('dialog'))
      .getAllByRole('button')
      .filter(button => button.classList.contains('source-option'));

    expect(options.map(button => button.querySelector('strong')?.textContent)).toEqual([
      'Наш плеер',
      'Player 1',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('combobox', { name: 'Качество видео' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Настройки плеера' })).getByRole('combobox', {
        name: 'Качество видео',
      })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть настройки' }));
    fireEvent.click(screen.getByRole('button', { name: /Озвучка:/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /AniDub/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('keeps only quality, speed and playback toggles in settings', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));

    const dialog = screen.getByRole('dialog', { name: 'Настройки плеера' });

    expect(
      within(dialog)
        .getAllByRole('combobox')
        .map(element => element.getAttribute('aria-label'))
    ).toEqual(['Качество видео', 'Скорость воспроизведения']);
    expect(dialog.querySelector('.video-settings-selects')?.children).toHaveLength(2);
    expect(
      within(dialog).queryByRole('checkbox', { name: 'Следующая серия автоматически' })
    ).toBeNull();
    expect(screen.getAllByRole('checkbox', { name: 'Следующая серия автоматически' })).toHaveLength(
      1
    );
  });
  it('preserves the episode and exact position through a stream error, new URL and page reload', async () => {
    const first = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(first.container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    let media = first.container.querySelector('video')!;

    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    Object.defineProperty(media, 'paused', { value: false, configurable: true });
    fireEvent.loadedMetadata(media);
    fireEvent.playing(media);
    media.currentTime = 321;
    fireEvent.timeUpdate(media);
    // Some media engines reset currentTime before notifying about a broken stream.
    media.currentTime = 0;
    mediaError(media);
    expect(readPlaybackRecovery(anime.anime_id)?.position).toBe(321);
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'Test',
      videoId: video('1').video_id,
      duration: 1400,
      streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/refreshed.mp4' }],
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Повторить загрузку' }, { timeout: 3000 })
    );
    await waitFor(() =>
      expect(first.container.querySelector('video')?.getAttribute('src')).toContain('refreshed.mp4')
    );
    media = first.container.querySelector('video')!;
    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(321);
    first.unmount();

    const second = render(<Player anime={anime} />);

    await waitFor(() => expect(second.container.querySelector('video')).not.toBeNull());
    media = second.container.querySelector('video')!;
    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(321);
  });
  it('checkpoints locally as soon as the network or stream stalls', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());

    const media = container.querySelector('video')!;

    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    Object.defineProperty(media, 'paused', { value: false, configurable: true });
    fireEvent.loadedMetadata(media);
    fireEvent.playing(media);
    media.currentTime = 222;
    fireEvent.timeUpdate(media);
    window.dispatchEvent(new Event('offline'));
    expect(readPlaybackRecovery(anime.anime_id)?.position).toBe(222);
    media.currentTime = 233;
    fireEvent.timeUpdate(media);
    fireEvent.stalled(media);
    expect(readPlaybackRecovery(anime.anime_id)?.position).toBe(233);
  });
  it('switches to the chosen provider and back without recording an unplayed episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ response: [video('2'), video('2', 'AniLibria', 4)] }))
          )
        )
    );

    const { container } = render(<Player anime={anime} />);

    await screen.findByRole('button', { name: 'Плеер: Наш плеер' });
    fireEvent.click(screen.getByRole('button', { name: 'Плеер: Наш плеер' }));
    fireEvent.click(screen.getByRole('button', { name: /Player 4/ }));
    await waitFor(() => expect(container.querySelector('iframe')?.src).toContain('/4/2'));
    expect(screen.queryByRole('checkbox', { name: 'Автопропуск опенинга' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Плеер' }), {
      target: { value: 'universal' },
    });
    await waitFor(() =>
      expect(container.querySelector('.watch-now')?.textContent).toContain('Серия 2')
    );
    expect(readLibrary().history).toEqual([]);
  });
  it.each([true, false])(
    'restores playing state only after a successful audio permission probe (%s)',
    async allowed => {
      vi.mocked(probeAudioPlayback).mockResolvedValue(allowed);

      const { container } = render(
        <Player
          anime={anime}
          history={{
            anime,
            episode: '1',
            videoId: video('1').video_id,
            group: '',
            updatedAt: Date.now(),
            position: 300,
            duration: 1400,
            playing: true,
          }}
        />
      );

      await waitFor(() =>
        expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
      );

      const media = container.querySelector('video')!;

      Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
      fireEvent.loadedMetadata(media);
      expect(media.currentTime).toBe(300);
      expect(probeAudioPlayback).toHaveBeenCalled();
      if (allowed) expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
      else expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    }
  );
  it('does not probe or autoplay a deliberately paused video after reload', async () => {
    const { container } = render(
      <Player
        anime={anime}
        history={{
          anime,
          episode: '1',
          videoId: video('1').video_id,
          group: '',
          updatedAt: Date.now(),
          position: 300,
          duration: 1400,
          playing: false,
        }}
      />
    );

    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    fireEvent.loadedMetadata(container.querySelector('video')!);
    expect(probeAudioPlayback).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it('keeps playing the original quality until the replacement is ready and retains the open settings', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    const live = container.querySelector('video')!;

    Object.defineProperty(live, 'duration', { value: 1400, configurable: true });
    Object.defineProperty(live, 'paused', { value: false, configurable: true });
    fireEvent.loadedMetadata(live);
    fireEvent.playing(live);
    fireEvent.canPlay(live);
    live.currentTime = 123;
    fireEvent.timeUpdate(live);

    const pause = vi.fn();

    live.pause = pause;
    live.volume = 0.4;
    live.muted = true;
    live.playbackRate = 1.5;
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Качество видео' }), {
      target: { value: '720' },
    });
    await waitFor(() =>
      expect(
        container.querySelector<HTMLVideoElement>('video[data-active=false]')?.getAttribute('src')
      ).toContain('720')
    );
    expect(pause).not.toHaveBeenCalled();
    expect(live.getAttribute('src')).toContain('360');
    expect(container.querySelector('.playback-loader')).toBeNull();

    const next = container.querySelector<HTMLVideoElement>('video[data-active=false]')!;

    Object.defineProperty(next, 'duration', { value: 1400, configurable: true });

    let paused = true;

    Object.defineProperty(next, 'paused', { get: () => paused, configurable: true });
    vi.spyOn(next, 'play').mockImplementation(async () => {
      paused = false;
    });
    fireEvent.loadedMetadata(next);
    fireEvent.canPlay(next);
    await waitFor(() =>
      expect(container.querySelector<HTMLVideoElement>('video[data-active=true]')).toBe(next)
    );
    expect(next.currentTime).toBeCloseTo(123, 0);
    expect(next.volume).toBe(0.4);
    expect(next.muted).toBe(true);
    expect(next.playbackRate).toBe(1.5);
    expect(screen.getByRole('dialog', { name: 'Настройки плеера' })).toBeTruthy();
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(container.querySelector('.playback-loader')).toBeNull();
  });
  it('keeps the original quality if the replacement fails or is cancelled', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    const live = container.querySelector('video')!;

    fireEvent.loadedMetadata(live);
    fireEvent.canPlay(live);

    const pause = vi.fn();

    live.pause = pause;
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));

    const quality = screen.getByRole('combobox', { name: 'Качество видео' });

    fireEvent.change(quality, { target: { value: '720' } });
    await waitFor(() =>
      expect(container.querySelector<HTMLVideoElement>('video[data-active=false]')).not.toBeNull()
    );
    mediaError(container.querySelector<HTMLVideoElement>('video[data-active=false]')!);
    await waitFor(() => expect((quality as HTMLSelectElement).value).toBe('360'));
    expect(container.querySelector<HTMLVideoElement>('video[data-active=true]')).toBe(live);
    expect(container.querySelector('.playback-loader.is-error')).toBeNull();
    expect(pause).not.toHaveBeenCalled();
    fireEvent.change(quality, { target: { value: '720' } });
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));

    const obsolete = container.querySelector<HTMLVideoElement>('video[data-active=false]')!;

    fireEvent.change(quality, { target: { value: '360' } });
    fireEvent.canPlay(obsolete);
    expect(container.querySelector<HTMLVideoElement>('video[data-active=true]')).toBe(live);
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });
  it('prepares a new decoder even when different qualities share one master playlist', async () => {
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'CVH',
      videoId: video('1').video_id,
      duration: 1400,
      streams: [360, 720].map(quality => ({
        quality,
        type: 'mp4',
        url: 'https://cdn.example/master.mp4',
      })),
    });

    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('master')
    );

    const live = container.querySelector('video');

    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Качество видео' }), {
      target: { value: '720' },
    });
    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
    expect(container.querySelector('video[data-active=true]')).toBe(live);
  });
  it('abandons a quality that never becomes ready while preserving the live layer', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    const live = container.querySelector('video');

    try {
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Качество видео' }), {
        target: { value: '720' },
      });
      await act(async () => {});
      expect(container.querySelectorAll('video')).toHaveLength(2);
      await act(async () => {
        vi.advanceTimersByTime(20001);
      });
      expect(container.querySelectorAll('video')).toHaveLength(1);
      expect(container.querySelector('video')).toBe(live);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('shows a failure without silently mounting an advertising iframe', async () => {
    vi.mocked(resolveStream).mockRejectedValue(new Error('Нет доступного потока'));

    const { container } = render(<Player anime={anime} />);

    await screen.findByText('Нет доступного потока', {}, { timeout: 3000 });
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });
  it('waits for the remaining source and a grace period before showing its final error', async () => {
    const sources = [video('1'), video('1', 'AniLibria', 4)];
    let reject!: (error: Error) => void;

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ response: sources })))
        )
    );
    vi.mocked(resolveStream)
      .mockReset()
      .mockResolvedValueOnce({
        provider: 'CVH',
        videoId: 1001,
        duration: 1400,
        streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/first.mp4' }],
      })
      .mockImplementation(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          })
      );

    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('first.mp4')
    );
    mediaError(container.querySelector('video')!);
    await waitFor(() => expect(typeof reject).toBe('function'));
    await new Promise(resolve => setTimeout(resolve, 1600));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => reject(new Error('Последний источник недоступен')));
    expect(screen.queryByRole('alert')).toBeNull();
    await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(
      within(screen.getByRole('alert')).getByText(/Последний источник недоступен/)
    ).toBeTruthy();
  });
  it('restarts a failed media request even if resolving again returns the same URL', async () => {
    const { container } = render(<Player anime={anime} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
    );

    const calls = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;

    mediaError(container.querySelector('video')!);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Повторить загрузку' }, { timeout: 3000 })
    );
    await waitFor(() =>
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(calls)
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('.playback-loader.is-error')).toBeNull();
  });
  it.each([true, false])(
    'tries another provider for the same episode and voice, preserving position and playback intent (%s)',
    async playing => {
      const sources = [video('1'), video('1', 'AniLibria', 4), video('2'), video('1', 'AniDub')];

      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ response: sources })))
          )
      );
      vi.mocked(resolveStream)
        .mockClear()
        .mockImplementation(async candidates => ({
          provider: candidates[0].data.player,
          videoId: candidates[0].video_id,
          duration: 1400,
          streams: [
            { quality: 360, type: 'mp4', url: `https://cdn.example/${candidates[0].video_id}.mp4` },
          ],
        }));

      const { container } = render(<Player anime={anime} />);

      await waitFor(() =>
        expect(container.querySelector('video')?.getAttribute('src')).toContain('1001.mp4')
      );

      const first = container.querySelector('video')!;

      Object.defineProperty(first, 'duration', { value: 1400, configurable: true });
      Object.defineProperty(first, 'paused', { value: !playing, configurable: true });
      fireEvent.loadedMetadata(first);
      if (playing) fireEvent.playing(first);
      first.currentTime = 321;
      first.muted = true;
      first.volume = 0.25;
      first.playbackRate = 1.5;
      fireEvent.timeUpdate(first);
      vi.mocked(HTMLMediaElement.prototype.play).mockClear();
      mediaError(first);
      await waitFor(() =>
        expect(container.querySelector('video')?.getAttribute('src')).toContain('4001.mp4')
      );

      const replacement = container.querySelector('video')!;

      Object.defineProperty(replacement, 'duration', { value: 1400, configurable: true });
      fireEvent.loadedMetadata(replacement);
      expect(replacement.currentTime).toBe(321);
      expect(replacement.muted).toBe(true);
      expect(replacement.volume).toBe(0.25);
      expect(replacement.playbackRate).toBe(1.5);
      expect(
        vi
          .mocked(resolveStream)
          .mock.calls.map(([candidates]) => candidates.map(value => value.video_id))
      ).toEqual([[1001, 4001], [4001]]);
      expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length > 0).toBe(playing);
      expect(container.querySelector('iframe')).toBeNull();
    }
  );
  it('stops after exhausting providers and lets an explicit retry start again', async () => {
    const sources = [video('1'), video('1', 'AniLibria', 4), video('1', 'AniLibria', 6)];

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ response: sources })))
        )
    );
    vi.mocked(resolveStream)
      .mockClear()
      .mockImplementation(async candidates => ({
        provider: candidates[0].data.player,
        videoId: candidates[0].video_id,
        duration: 1400,
        streams: [
          { quality: 360, type: 'mp4', url: `https://cdn.example/${candidates[0].video_id}.mp4` },
        ],
      }));

    const back = vi.fn();
    const { container } = render(<Player anime={anime} presentation="immersive" onBack={back} />);

    for (const id of [1001, 4001, 6001]) {
      await waitFor(() =>
        expect(container.querySelector('video')?.getAttribute('src')).toContain(`${id}.mp4`)
      );
      mediaError(container.querySelector('video')!);
    }
    await screen.findByRole('button', { name: 'Повторить загрузку' }, { timeout: 3000 });
    expect(resolveStream).toHaveBeenCalledTimes(3);
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к аниме' }));
    expect(back).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('1001.mp4')
    );
    expect(resolveStream).toHaveBeenCalledTimes(4);
  });
  it('does not discard providers when the device itself is offline', async () => {
    const sources = [video('1'), video('1', 'AniLibria', 4)];

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ response: sources })))
        )
    );
    vi.mocked(resolveStream).mockClear();

    const { container } = render(<Player anime={anime} />);

    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mediaError(container.querySelector('video')!);
    await screen.findByRole('button', { name: 'Повторить загрузку' }, { timeout: 3000 });
    expect(resolveStream).toHaveBeenCalledTimes(1);
  });
  it('allows leaving while the resolver is still pending or has failed', async () => {
    let reject!: (error: Error) => void;

    vi.mocked(resolveStream).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );

    const back = vi.fn();

    render(<Player anime={anime} presentation="immersive" onBack={back} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Об аниме' }));
    expect(back).toHaveBeenCalledOnce();
    await waitFor(() => expect(typeof reject).toBe('function'));
    const loader = screen.getByText('Подбираем видеопоток…').closest('.playback-loader');
    reject(new Error('Нет доступного потока'));
    await screen.findByText('Нет доступного потока', {}, { timeout: 3000 });
    expect(screen.getByRole('alert')).toBe(loader);
    expect(loader?.querySelector('.playback-spinner')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Об аниме' }));
    expect(back).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Подбираем видеопоток…').closest('.playback-loader')).toBe(loader);
  });
  it('syncs the resolved provider rather than the representative episode, including automatic skips', async () => {
    saveSession({
      token: 'test-account',
      user: { id: 42, nickname: 'Test' },
      verified: true,
      remember: false,
      refreshedAt: Date.now(),
    });

    const actual = {
      ...video('1', 'AniLibria', 4),
      skips: { opening: { time: 10, length: 90 }, ending: { time: 1200, length: 90 } },
    };
    const representative = { ...video('1'), skips: { opening: { time: 0, length: 50 } } };
    const fetcher = vi
      .fn()
      .mockImplementation((_url, init) =>
        Promise.resolve(
          new Response(
            JSON.stringify({ response: init?.method === 'PUT' ? true : [actual, representative] })
          )
        )
      );

    vi.stubGlobal('fetch', fetcher);
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'Alloha',
      videoId: actual.video_id,
      duration: 1400,
      skips: { opening: { time: 15, length: 90 }, ending: { time: 1200, length: 90 } },
      streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/actual.mp4' }],
    });

    const onPlayback = vi.fn();
    const { container } = render(<Player anime={anime} onPlayback={onPlayback} />);

    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain('actual.mp4')
    );

    const media = container.querySelector('video')!;

    Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
    Object.defineProperty(media, 'paused', { value: true, configurable: true });
    fireEvent.loadedMetadata(media);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    media.currentTime = 20;
    fireEvent.timeUpdate(media);
    expect(await screen.findByRole('button', { name: 'Пропустить опенинг' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Автопропуск опенинга' }));
    fireEvent.timeUpdate(media);
    expect(media.currentTime).toBe(20); // A paused player never jumps.
    vi.useFakeTimers();
    Object.defineProperty(media, 'paused', { value: false, configurable: true });
    fireEvent.playing(media);
    expect(media.currentTime).toBe(20);
    act(() => {
      vi.advanceTimersByTime(AUTO_ACTION_DELAY_MS);
    });
    expect(media.currentTime).toBe(105);
    vi.useRealTimers();
    fireEvent.seeked(media);
    await waitFor(() => expect(getLibraryState().history[0]?.position).toBe(105));

    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT');

    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(([url]) => new URL(url).pathname === `/video/${actual.video_id}`)).toBe(
      true
    );
    expect(onPlayback.mock.calls.find(([event]) => event.reason === 'skip')?.[0]).toMatchObject({
      playback: { videoId: actual.video_id, provider: 'Alloha', position: 105 },
      skip: { kind: 'opening', from: 20, to: 105, automatic: true },
    });
    media.currentTime = 20;
    fireEvent.timeUpdate(media);
    expect(media.currentTime).toBe(20); // Rewind does not trigger a loop.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Автопропуск титров' }));
    vi.useFakeTimers();
    media.currentTime = 1210;
    fireEvent.timeUpdate(media);
    act(() => {
      vi.advanceTimersByTime(AUTO_ACTION_DELAY_MS);
    });
    expect(media.currentTime).toBe(1290);
    vi.useRealTimers();
    fireEvent.seeked(media);
    Object.defineProperty(media, 'paused', { value: true, configurable: true });
    fireEvent.pause(media);
    await waitFor(() => expect(getLibraryState().history[0]?.position).toBe(1290));
    expect(media.currentTime).toBeLessThan(media.duration);
    expect(container.querySelector('.video-stream-meta')?.textContent).toContain('Alloha');
    expect(container.querySelector('.playback-status')).toBeNull();
  });
});

it('passes playback speed, pauses and completion from the universal player to Discord', async () => {
  const { container } = render(<Player anime={anime} />);

  await waitFor(() =>
    expect(container.querySelector('video')?.getAttribute('src')).toContain('360')
  );

  const media = container.querySelector('video')!;

  Object.defineProperty(media, 'duration', { value: 1400, configurable: true });
  vi.spyOn(media, 'paused', 'get').mockReturnValue(false);

  fireEvent.loadedMetadata(media);
  fireEvent.playing(media);
  media.playbackRate = 2;
  fireEvent(media, new Event('ratechange'));
  await waitFor(() =>
    expect(useDiscordPresence).toHaveBeenLastCalledWith(
      anime,
      expect.objectContaining({ number: '1' }),
      expect.objectContaining({ playing: true, playbackRate: 2, reason: 'ratechange' })
    )
  );

  vi.spyOn(media, 'paused', 'get').mockReturnValue(true);
  fireEvent.pause(media);
  await waitFor(() =>
    expect(useDiscordPresence).toHaveBeenLastCalledWith(
      anime,
      expect.objectContaining({ number: '1' }),
      expect.objectContaining({ playing: false, reason: 'pause' })
    )
  );

  fireEvent.ended(media);
  await waitFor(() =>
    expect(useDiscordPresence).toHaveBeenLastCalledWith(
      anime,
      expect.objectContaining({ number: '1' }),
      expect.objectContaining({ playing: false, reason: 'ended' })
    )
  );
});
