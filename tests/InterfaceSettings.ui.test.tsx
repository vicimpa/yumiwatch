// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { InterfaceEffects } from '~/components/InterfaceEffects';
import { InterfaceSettingsCard } from '~/components/InterfaceSettings';
import { interfaceSettings, saveInterfaceSettings } from '~/lib/interface-settings';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.interfaceStyle;
});
describe('media center preferences and sound', () => {
  it('persists master volume, effects volume, animation and appearance and applies master volume to video', () => {
    render(
      <>
        <InterfaceEffects onBack={() => {}} watching={false} />
        <video />
        <InterfaceSettingsCard />
      </>
    );
    fireEvent.input(screen.getByRole('slider', { name: 'Общая громкость' }), {
      target: { value: '.25' },
    });
    fireEvent.input(screen.getByRole('slider', { name: 'Громкость интерфейса' }), {
      target: { value: '.5' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Анимации переходов и боковых панелей' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Стиль интерфейса' }));
    fireEvent.click(screen.getByRole('option', { name: 'Контрастный' }));
    expect(interfaceSettings()).toMatchObject({
      volume: 0.25,
      effectsVolume: 0.5,
      animations: false,
      style: 'contrast',
    });
    expect(document.querySelector('video')!.volume).toBe(0.25);
    expect(document.documentElement.dataset.motion).toBe('off');
    expect(document.documentElement.dataset.interfaceStyle).toBe('contrast');
  });
  it('plays a short focus sound after a gesture and respects the sound toggle and zero master volume', () => {
    const start = vi.fn(),
      close = vi.fn().mockResolvedValue(undefined);

    const parameter = () => ({
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });

    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        close = close;
        resume = vi.fn().mockResolvedValue(undefined);

        createOscillator() {
          return {
            type: 'sine',
            frequency: parameter(),
            connect: vi.fn(),
            start,
            stop: vi.fn(),
            disconnect: vi.fn(),
          };
        }

        createGain() {
          return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
        }
      }
    );
    render(
      <>
        <InterfaceEffects onBack={() => {}} watching={false} />
        <button>Первый</button>
        <button>Второй</button>
      </>
    );

    const first = screen.getByRole('button', { name: 'Первый' }),
      second = screen.getByRole('button', { name: 'Второй' });

    fireEvent.pointerOver(first);
    expect(start).not.toHaveBeenCalled();
    fireEvent.pointerDown(first);
    fireEvent.pointerOver(second);
    expect(start).toHaveBeenCalledOnce();
    act(() => {
      saveInterfaceSettings({ sounds: false });
    });
    fireEvent.pointerOver(first);
    expect(start).toHaveBeenCalledOnce();
    act(() => {
      saveInterfaceSettings({ sounds: true, volume: 0 });
    });
    fireEvent.pointerOver(second);
    expect(start).toHaveBeenCalledOnce();
    cleanup();
    expect(close).toHaveBeenCalledOnce();
  });
  it('uses Escape for back only when no panel or field consumes it', () => {
    const back = vi.fn();

    render(
      <>
        <InterfaceEffects onBack={back} watching={false} />
        <input aria-label="Поле" />
        <aside data-sidebar-open="true">
          <button>Закрыть</button>
        </aside>
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(back).not.toHaveBeenCalled();
    document.querySelector('aside')!.remove();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Поле' }), { key: 'Escape' });
    expect(back).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(back).toHaveBeenCalledOnce();
  });
  it.each([
    ['fullscreenElement', 'exitFullscreen'],
    ['webkitFullscreenElement', 'webkitExitFullscreen'],
  ])('exits browser fullscreen before navigating back (%s)', (elementKey, exitKey) => {
    let fullscreen: Element | null = document.body;
    const exit = vi.fn(() => {
      fullscreen = null;
    });
    const back = vi.fn();
    Object.defineProperty(document, elementKey, { configurable: true, get: () => fullscreen });
    Object.defineProperty(document, exitKey, { configurable: true, value: exit });
    try {
      render(<InterfaceEffects onBack={back} watching />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(exit).toHaveBeenCalledOnce();
      expect(back).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: 'Escape', repeat: true });
      expect(back).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(back).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(document, elementKey);
      Reflect.deleteProperty(document, exitKey);
    }
  });
  it('keeps the video surface silent while retaining sounds on player buttons', () => {
    const start = vi.fn();

    const parameter = () => ({
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });

    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        close = vi.fn().mockResolvedValue(undefined);

        createOscillator() {
          return {
            frequency: parameter(),
            connect: vi.fn(),
            start,
            stop: vi.fn(),
            disconnect: vi.fn(),
          };
        }

        createGain() {
          return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
        }
      }
    );
    render(
      <>
        <InterfaceEffects onBack={() => {}} watching />
        <div class="video-controls">
          <button class="video-hit-area" aria-label="Поверхность видео" />
          <div class="video-toolbar">
            <button>Пауза</button>
          </div>
        </div>
      </>
    );

    const surface = screen.getByRole('button', { name: 'Поверхность видео' }),
      control = screen.getByRole('button', { name: 'Пауза' });

    fireEvent.pointerDown(document.body);
    fireEvent.pointerOver(surface);
    fireEvent.focusIn(surface);
    fireEvent.click(surface);
    expect(start).not.toHaveBeenCalled();
    fireEvent.pointerOver(control);
    expect(start).toHaveBeenCalledOnce();
    fireEvent.pointerOver(surface, { relatedTarget: control });
    expect(start).toHaveBeenCalledOnce();
    fireEvent.click(control);
    expect(start).toHaveBeenCalledTimes(2);
  });
  it('validates stored values instead of passing invalid volume to media elements', () => {
    localStorage.setItem(
      'yumiwatch:interface-settings',
      JSON.stringify({ volume: 3, effectsVolume: -1, style: 'unknown' })
    );
    expect(interfaceSettings()).toMatchObject({ volume: 1, effectsVolume: 0, style: 'classic' });
  });
});
