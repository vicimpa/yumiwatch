// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageScrollKey, rememberPageScroll, restorePageScroll } from '~/lib/page-scroll';

let resize: () => void;
const disconnect = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }

      observe() {}

      disconnect = disconnect;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function frame() {
  const { container } = render(
    <main id="main" class="media-scroll">
      <div class="media-scroll-content" />
    </main>
  );

  return container.querySelector('main')!;
}

describe('per-screen scrolling', () => {
  it('preserves one scroll position across profile tabs and list filters, separately for each person', () => {
    const element = frame();
    element.scrollTop = 420;
    rememberPageScroll('/profile?tab=overview');
    element.scrollTop = 0;
    restorePageScroll('/profile?tab=collection&list=watched');
    expect(element.scrollTop).toBe(420);
    element.scrollTop = 170;
    rememberPageScroll('/users/id8?tab=stats');
    element.scrollTop = 0;
    restorePageScroll('/users/id8?tab=friends');
    expect(element.scrollTop).toBe(170);
    restorePageScroll('/profile?tab=stats');
    expect(element.scrollTop).toBe(420);
  });
  it('restores independent positions and normalizes the anime description route', () => {
    const element = frame();

    element.scrollTop = 730;
    rememberPageScroll('/anime/10531?view=anime-about');
    element.scrollTop = 250;
    rememberPageScroll('/catalog?sort=top');
    element.scrollTop = 0;
    restorePageScroll('/anime/10531');
    expect(element.scrollTop).toBe(730);
    restorePageScroll('/catalog?sort=top');
    expect(element.scrollTop).toBe(250);
    expect(pageScrollKey('/anime/10531?panel=comments')).toBe(
      pageScrollKey('/anime/10531?view=anime-about')
    );
    expect(pageScrollKey('/anime/10531?view=watch')).not.toBe(pageScrollKey('/anime/10531'));
  });
  it('waits for asynchronous content to grow before restoring a long page', () => {
    const element = frame();
    let height = 2000,
      position = 600;

    Object.defineProperty(element, 'scrollTop', {
      get: () => position,
      set: value => {
        position = Math.min(Number(value), Math.max(0, height - 500));
      },
    });
    rememberPageScroll('/anime/10532');
    height = 400;
    position = 0;

    const stop = restorePageScroll('/anime/10532');

    expect(position).toBe(0);
    height = 2200;
    resize();
    expect(position).toBe(600);
    expect(disconnect).toHaveBeenCalledOnce();
    stop();
  });
  it('does not override user scrolling or a newer route during delayed restoration', () => {
    const element = frame();
    let height = 2000,
      position = 900;

    Object.defineProperty(element, 'scrollTop', {
      get: () => position,
      set: value => {
        position = Math.min(Number(value), Math.max(0, height - 500));
      },
    });
    rememberPageScroll('/catalog?q=scroll');
    height = 700;
    position = 0;
    restorePageScroll('/catalog?q=scroll');
    fireEvent.wheel(element);
    position = 40;
    height = 2200;
    resize();
    expect(position).toBe(40);
    height = 700;

    const cancel = restorePageScroll('/catalog?q=scroll');

    cancel();
    height = 2200;
    position = 10;
    resize();
    expect(position).toBe(10);
  });
});
