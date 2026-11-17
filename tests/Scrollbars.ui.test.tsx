// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scrollbars } from '~/components/Scrollbars';

let target: HTMLElement;
beforeEach(() => {
  target = document.createElement('main');
  target.className = 'media-scroll';
  target.id = 'main';
  document.body.append(target);
  Object.defineProperty(target, 'scrollHeight', { value: 1000 });
  Object.defineProperty(target, 'clientHeight', { value: 200 });
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 200,
    left: 0,
    right: 800,
    width: 800,
    height: 200,
  } as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => {
  cleanup();
  target.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('overlay scrollbars', () => {
  it('lives outside the content flow, appears on scroll and disappears after idle', async () => {
    const view = render(<Scrollbars />);
    const thumb = await screen.findByRole('scrollbar', { name: 'Прокрутка страницы' });
    const bar = thumb.parentElement!;
    expect(target.contains(bar)).toBe(false);
    expect(bar.classList.contains('is-visible')).toBe(false);
    target.scrollTop = 100;
    fireEvent.scroll(target);
    expect(bar.classList.contains('is-visible')).toBe(true);
    await waitFor(() => expect(bar.classList.contains('is-visible')).toBe(false), {
      timeout: 1500,
    });
    view.unmount();
    expect(document.querySelector('.overlay-scrollbar')).toBeNull();
  });

  it('supports thumb dragging and keyboard scrolling without moving focus to the page', async () => {
    render(<Scrollbars />);
    const thumb = await screen.findByRole('scrollbar', { name: 'Прокрутка страницы' });
    thumb.setPointerCapture = vi.fn();
    fireEvent.pointerDown(thumb, { button: 0, clientY: 40 });
    fireEvent.pointerMove(thumb, { clientY: 60 });
    expect(target.scrollTop).toBeGreaterThan(100);
    expect(thumb.parentElement!.classList.contains('is-dragging')).toBe(true);
    fireEvent.pointerUp(thumb);
    expect(thumb.parentElement!.classList.contains('is-dragging')).toBe(false);
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(target.scrollTop).toBe(800);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(target.scrollTop).toBe(0);
  });
});
