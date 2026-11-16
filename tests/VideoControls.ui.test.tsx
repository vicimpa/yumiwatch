// @vitest-environment jsdom
import { useRef } from 'preact/hooks';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROLS_IDLE_MS, VideoControls } from '~/components/VideoControls';

function Harness({ failed = false }: { failed?: boolean }) {
  const media = useRef<HTMLVideoElement>(null),
    frame = useRef<HTMLDivElement>(null);

  return (
    <div ref={frame} data-testid="stage">
      <video ref={media} />
      <VideoControls
        media={media}
        frame={frame}
        title="Серия 1"
        position={42}
        loading={false}
        failed={failed}
        settings={
          <label>
            Качество
            <select aria-label="Качество">
              <option>720p</option>
            </select>
          </label>
        }
        onVisibility={() => {}}
      />
    </div>
  );
}

function setup() {
  const result = render(<Harness />);
  const video = result.container.querySelector('video')!;

  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'duration', { value: 1400, configurable: true });
  video.currentTime = 42;

  const playing = (paused: boolean) => {
    Object.defineProperty(video, 'paused', { value: paused, configurable: true });
    fireEvent(video, new Event(paused ? 'pause' : 'playing'));
    fireEvent(video, new Event(paused ? 'pause' : 'play'));
  };

  return {
    ...result,
    video,
    playing,
    controls: result.container.querySelector('.video-controls')!,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const idle = () =>
  act(() => {
    vi.advanceTimersByTime(CONTROLS_IDLE_MS + 1);
  });

describe('custom playback controls', () => {
  it('keeps 2x selected during the decoder buffering and rate transitions', () => {
    const { video } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));

    const speed = screen.getByRole('combobox', {
      name: 'Скорость воспроизведения',
    }) as HTMLSelectElement;

    fireEvent.change(speed, { target: { value: '2' } });
    expect(video.playbackRate).toBe(2);
    expect(video.defaultPlaybackRate).toBe(2);
    for (const rate of [0, 1, 2]) {
      video.playbackRate = rate;
      fireEvent.rateChange(video);
      fireEvent.timeUpdate(video);
      expect(speed.value).toBe('2');
    }
  });

  it('waits for a single mouse click and cancels pending clicks when the player unmounts', () => {
    const { playing, unmount } = setup();

    playing(false);

    const surface = document.querySelector('.video-hit-area')!;

    fireEvent.click(surface, { detail: 1 });
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    fireEvent.click(surface, { detail: 1 });
    unmount();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  });
  it('preserves playback even when a slower double click outlasts the single-click delay', async () => {
    const { video, playing } = setup();

    playing(false);

    const request = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(screen.getByTestId('stage'), 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(() => {
      playing(true);
    });
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(async () => {
      playing(false);
    });

    const surface = document.querySelector('.video-hit-area')!;

    fireEvent.click(surface, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(video.paused).toBe(true);
    await act(async () => {
      fireEvent.click(surface, { detail: 2 });
      fireEvent.dblClick(surface);
    });
    expect(video.paused).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });
  it('wakes the player when the mouse moves over the window chrome', () => {
    const { controls, playing } = setup();

    playing(false);
    idle();
    expect(controls.classList.contains('is-hidden')).toBe(true);

    const chrome = document.createElement('div');

    chrome.className = 'window-chrome';
    document.body.append(chrome);
    fireEvent.pointerMove(chrome);
    expect(controls.classList.contains('is-visible')).toBe(true);
    chrome.remove();
  });
  it('removes stale buffering when decoded time advances without another playing event', () => {
    const { video, playing } = setup();

    playing(false);
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    fireEvent.waiting(video);
    expect(screen.getByText('Буферизация…')).toBeTruthy();
    fireEvent.timeUpdate(video);
    video.currentTime = 43;
    fireEvent.timeUpdate(video);
    expect(screen.queryByText('Буферизация…')).toBeNull();
  });
  it('hides after inactivity, resets on movement, and keeps controls on pause or buffering', () => {
    const { controls, video, playing } = setup();

    playing(false);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerMove(controls);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(controls.classList.contains('is-visible')).toBe(true);
    idle();
    expect(controls.classList.contains('is-hidden')).toBe(true);
    fireEvent.pointerMove(controls);
    expect(controls.classList.contains('is-visible')).toBe(true);
    playing(true);
    idle();
    expect(controls.classList.contains('is-visible')).toBe(true);
    playing(false);
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    fireEvent.waiting(video);
    idle();
    expect(controls.classList.contains('is-visible')).toBe(true);
    fireEvent.playing(video);
    idle();
    expect(controls.classList.contains('is-hidden')).toBe(true);
  });
  it('shows controls on the first tap without pausing playback', () => {
    const { controls, playing } = setup();

    playing(false);
    idle();

    const surface = screen.getByRole('button', { name: 'Показать управление' });

    fireEvent.pointerDown(surface);
    fireEvent.click(surface);
    expect(controls.classList.contains('is-visible')).toBe(true);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Приостановить видео' }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  });
  it('keeps settings and keyboard-focused controls visible', () => {
    const { controls, playing } = setup();

    playing(false);
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    idle();
    expect(screen.getByRole('dialog', { name: 'Настройки плеера' })).toBeTruthy();
    expect(controls.classList.contains('is-visible')).toBe(true);
    fireEvent.keyDown(controls, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(controls, { key: 'Tab' });
    idle();
    expect(controls.classList.contains('is-visible')).toBe(true);
  });
  it('dismisses settings on outside clicks and consumes clicks on the player', () => {
    const { playing } = setup();

    playing(false);
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));

    const surface = screen.getByRole('button', { name: 'Приостановить видео' });

    expect(fireEvent.click(surface)).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    fireEvent.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows buffering only when playback actually lacks frames, including while offline', () => {
    const { video, playing } = setup();

    playing(false);
    fireEvent.stalled(video);
    expect(screen.queryByText('Буферизация…')).toBeNull();
    window.dispatchEvent(new Event('offline'));
    expect(screen.queryByText('Соединение потеряно')).toBeNull();
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    fireEvent.waiting(video);
    expect(screen.getByText('Соединение потеряно')).toBeTruthy();
    expect(document.querySelector('.playback-spinner')).toBeTruthy();
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    fireEvent.timeUpdate(video);
    expect(screen.queryByText('Соединение потеряно')).toBeNull();
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    fireEvent.waiting(video);
    playing(true);
    expect(screen.queryByText('Соединение потеряно')).toBeNull();
    window.dispatchEvent(new Event('online'));
  });
  it('fullscreens the container with its interface and exits on the next click', async () => {
    setup();

    const stage = screen.getByTestId('stage');
    const request = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const exit = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    Object.defineProperty(stage, 'requestFullscreen', { value: request, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Полный экран' }));
    });
    expect(request).toHaveBeenCalledOnce();
    expect(
      document.fullscreenElement?.contains(screen.getByRole('button', { name: 'Настройки плеера' }))
    ).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Выйти из полного экрана' }));
    });
    expect(exit).toHaveBeenCalledOnce();
  });
  it('opens controls with Enter and leaves directional navigation on toolbar buttons to the interface', () => {
    const { controls, video, playing } = setup();

    playing(false);
    idle();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(controls.classList.contains('is-visible')).toBe(true);

    const play = screen.getByRole('button', { name: 'Пауза' });

    fireEvent.keyDown(play, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(42);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(47);
  });
  it('closes settings and disables controls behind a media error', () => {
    const { container, rerender } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    const media = container.querySelector('video')!;

    media.currentTime = 42;
    rerender(<Harness failed />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.video-controls')?.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(document.body, { key: 'l' });
    expect(media.currentTime).toBe(42);
  });
  it('handles global shortcuts without seeking while editing settings', () => {
    const { video } = setup();

    fireEvent.keyDown(document.body, { key: 'д', code: 'KeyL' });
    expect(video.currentTime).toBe(52);
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(video.currentTime).toBe(42);
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(video.muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Настройки плеера' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Качество' }), { key: 'l' });
    expect(video.currentTime).toBe(42);
  });
});
