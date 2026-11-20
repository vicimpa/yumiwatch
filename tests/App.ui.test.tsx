// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '~/App';
import { clearSession, saveSession } from '~/lib/session';
import { resolveStream } from '~/lib/streams';
import { RETURN_TO_PLAYER_EVENT } from '~/lib/native-playback';
import { readPlaybackRecovery } from '~/lib/playback-recovery';
import { savePlaybackSettings } from '~/lib/playback-settings';
import { anime, video } from './fixtures';

vi.mock('~/lib/streams', async original => ({
  ...(await original<typeof import('~/lib/streams')>()),
  resolveStream: vi.fn(),
}));
beforeEach(() => {
  clearSession();
  localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((raw: string) => {
      const url = new URL(raw);

      if (url.pathname.endsWith('/genres'))
        return Promise.resolve(new Response(JSON.stringify({ response: { genres: [] } })));

      const offset = Number(url.searchParams.get('offset') || 0);

      return Promise.resolve(
        new Response(
          JSON.stringify({
            response: Array.from({ length: 24 }, (_, i) => ({
              ...anime,
              anime_id: 100 + offset + i,
              title: `Аниме ${offset + i}`,
            })),
          })
        )
      );
    })
  );
});
afterEach(() => {
  cleanup();
  clearSession();
  delete document.documentElement.dataset.desktop;
  delete document.documentElement.dataset.desktopFullscreen;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('macOS picture in picture navigation', () => {
  it.each([
    { mode: 'manual', playing: true, retainsPlayer: true },
    { mode: 'automatic', playing: true, retainsPlayer: true },
    { mode: 'disabled', playing: true, retainsPlayer: false },
    { mode: 'automatic', playing: false, retainsPlayer: false },
  ])(
    'retains the decoder with $mode and playing=$playing only when eligible',
    async ({ mode, playing, retainsPlayer }) => {
      const animeId =
        anime.anime_id + (mode === 'manual' ? 1 : mode === 'disabled' ? 2 : playing ? 3 : 4);
      const watchPath = `/anime/${animeId}?view=watch&episode=1`;
      history.replaceState(null, '', '#' + watchPath);
      let paused = true;
      let pictureInPicture = false;
      let position = 9;
      let holdPosition = false;
      let finishPositionRead: (() => void) | undefined;
      let savedOnClose: number | undefined;
      const requests: { action: string; id: number; enabled?: boolean }[] = [];
      const invoke = vi.fn(async (command, args) => {
        if (command === 'yummy_request') {
          const path: string = args.request.path;
          const response = path.includes('/videos')
            ? [video('1')]
            : { ...anime, anime_id: animeId };
          return { status: 200, body: JSON.stringify({ response }) };
        }
        if (command === 'window_close_saved')
          savedOnClose = readPlaybackRecovery(animeId)?.position;
        if (command !== 'native_video') return false;
        const request = args.request;
        requests.push(request);
        if (request.action === 'pictureInPicture') pictureInPicture = request.enabled;
        if (request.controls?.pause !== undefined) paused = request.controls.pause;
        const snapshot = {
          ready: true,
          seeking: false,
          buffering: false,
          ended: false,
          failure: false,
          paused,
          position,
          duration: 90,
          buffered: 30,
          pictureInPicture,
        };
        if (request.action === 'poll' && holdPosition)
          await new Promise<void>(resolve => {
            finishPositionRead = resolve;
          });
        return snapshot;
      });
      vi.stubGlobal('isTauri', true);
      vi.stubGlobal('__TAURI_INTERNALS__', {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        invoke,
      });
      vi.stubGlobal('__TAURI_EVENT_PLUGIN_INTERNALS__', { unregisterListener: vi.fn() });
      document.documentElement.dataset.desktop = 'macos';
      vi.mocked(resolveStream).mockResolvedValue({
        provider: 'Test',
        videoId: video('1').video_id,
        duration: 90,
        streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/pip.mp4' }],
      });
      const { container } = render(<App />);
      const pip = await screen.findByRole<HTMLButtonElement>('button', {
        name: 'Картинка в картинке',
      });
      await waitFor(() => expect(pip.disabled).toBe(false));
      if (mode === 'automatic') {
        fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
        fireEvent.click(
          screen.getByRole('checkbox', { name: 'Картинка в картинке при выходе из плеера' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Закрыть настройки' }));
      }
      if (playing) {
        fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
        await waitFor(() => expect(paused).toBe(false));
      }
      if (mode === 'manual') {
        fireEvent.click(pip);
        await waitFor(() => expect(pip.getAttribute('aria-pressed')).toBe('true'));
      }

      fireEvent.click(screen.getByRole('button', { name: 'Об аниме' }));
      await screen.findByRole('link', { name: /(Начать|Продолжить) просмотр/ });
      if (!retainsPlayer) {
        expect(container.querySelector('.native-stream-layer')).toBeNull();
        await waitFor(() =>
          expect(
            invoke.mock.calls.some(
              ([command, args]) => command === 'native_video_frame' && args.close
            ) || requests.some(request => request.action === 'close')
          ).toBe(true)
        );
        expect(pictureInPicture).toBe(false);
        return;
      }

      await waitFor(() => expect(pictureInPicture).toBe(true));
      expect(container.querySelector('.native-stream-layer')?.closest('[hidden]')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Пауза' })).toBeNull();
      location.hash = '/settings';
      await screen.findByRole('checkbox', { name: 'Картинка в картинке при выходе из плеера' });
      expect(pictureInPicture).toBe(true);
      expect(paused).toBe(false);

      position = 28;
      pictureInPicture = false;
      window.dispatchEvent(new Event(RETURN_TO_PLAYER_EVENT));
      const timeline = await screen.findByRole<HTMLInputElement>('slider', {
        name: 'Позиция воспроизведения',
      });
      await waitFor(() => expect(timeline.value).toBe('28'));
      expect(location.hash).toBe('#' + watchPath);
      expect(requests.filter(request => request.action === 'open')).toHaveLength(1);
      expect(requests.some(request => request.action === 'close')).toBe(false);

      if (mode === 'manual') {
        const toggle = screen.getByRole('button', { name: 'Картинка в картинке' });
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));
        location.hash = '/settings';
        await screen.findByRole('checkbox', { name: 'Картинка в картинке при выходе из плеера' });
      }

      holdPosition = true;
      await waitFor(() => expect(finishPositionRead).toBeDefined());
      const playerId = requests.find(request => request.action === 'open')!.id;
      window.dispatchEvent(
        new CustomEvent('yumiwatch:window-close-requested', {
          detail: { [playerId]: 36 },
        })
      );
      await waitFor(() => expect(savedOnClose).toBe(36));
      finishPositionRead?.();
      await Promise.resolve();
      window.dispatchEvent(new Event('pagehide'));
      expect(readPlaybackRecovery(animeId)).toMatchObject({ position: 36, playing: true });
    }
  );
});

describe('mobile navigation state', () => {
  it('replaces application navigation with the native player and restores it on return', async () => {
    savePlaybackSettings({ mode: 'source' });
    history.replaceState(null, '', '#/anime/10531?view=watch');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.mocked(resolveStream).mockResolvedValue({
      provider: 'Test',
      videoId: video('1').video_id,
      duration: 1400,
      streams: [{ quality: 360, type: 'mp4', url: 'https://cdn.example/test.mp4' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((raw: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              response: new URL(raw).pathname.endsWith('/videos') ? [video('1')] : anime,
            })
          )
        )
      )
    );

    const { container } = render(<App />);

    await screen.findByRole('button', { name: 'Серии' });
    expect(container.querySelector('.topbar,.mobile-tabs,.site-footer,iframe')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('.media-nav')?.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Об аниме' }));
    await screen.findByRole('link', { name: /(Начать|Продолжить) просмотр/ });
    expect(screen.getByRole('navigation', { name: 'Разделы медиакаталога' })).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
  });
  it('shows the stored avatar while the account cannot yet be verified offline', async () => {
    saveSession({
      token: 'offline-avatar-user',
      user: { id: 42, nickname: 'Viewer', avatar: '//static.yani.tv/users/small/42.webp?v=2' },
      verified: false,
      remember: false,
      refreshedAt: Date.now(),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    history.replaceState(null, '', '#/account');
    render(<App />);

    const entry = screen.getByRole('link', { name: 'Проверяем аккаунт Viewer' });

    expect(entry.querySelector('img')?.getAttribute('src')).toBe(
      'https://static.yani.tv/users/small/42.webp?v=2'
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Нет связи с Yummy')
    );
    expect(entry.querySelector('img')).not.toBeNull();
    saveSession({
      token: 'offline-avatar-user',
      user: { id: 42, nickname: 'Viewer', avatar: '//static.yani.tv/users/small/42.webp?v=3' },
      verified: false,
      remember: false,
      refreshedAt: Date.now(),
    });
    await waitFor(() => expect(entry.querySelector('img')?.getAttribute('src')).toContain('v=3'));
  });
  it('keeps loaded catalog pages and document position when returning from search', async () => {
    history.replaceState(null, '', '#/catalog');
    render(<App />);
    await screen.findByRole('link', { name: /Аниме 0/ });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
    await screen.findByRole('link', { name: /Аниме 47/ });

    const scroll = document.getElementById('main')!;

    scroll.scrollTop = 700;
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
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Фильтры' }));
    expect(document.body.style.overflow).toBe('hidden');
    location.hash = '/search';
    await screen.findByRole('heading', { name: 'Найди своё аниме' });
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
