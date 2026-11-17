// @vitest-environment jsdom
import { fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiddleMouseScroll } from '~/lib/middle-mouse-scroll';

let dispose: (() => void) | undefined;
let frame: FrameRequestCallback;
beforeEach(() => {
  document.documentElement.dataset.desktop = 'windows';
  document.body.innerHTML =
    '<div class="media-scroll" style="overflow-y:auto"><a href="#/anime/1">Карточка</a><input /></div>';
  const scroll = document.querySelector('.media-scroll')!;
  Object.defineProperties(scroll, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.desktop;
  delete document.documentElement.dataset.middleScroll;
  vi.unstubAllGlobals();
});

it('starts middle-click panning over a linked card without following its link', () => {
  const changed = vi.fn();
  dispose = installMiddleMouseScroll(changed);
  const link = document.querySelector('a')!;
  const down = new MouseEvent('mousedown', {
    button: 1,
    clientX: 100,
    clientY: 100,
    bubbles: true,
    cancelable: true,
  });
  link.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  fireEvent.mouseUp(link, { button: 1 });
  expect(document.documentElement.dataset.middleScroll).toBe('y');
  fireEvent.mouseMove(document, { clientX: 100, clientY: 220 });
  frame(16);
  expect(document.querySelector('.media-scroll')!.scrollTop).toBeGreaterThan(0);
  const aux = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
  link.dispatchEvent(aux);
  expect(aux.defaultPrevented).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.documentElement.dataset.middleScroll).toBeUndefined();
  expect(changed).toHaveBeenLastCalledWith(null);
});

it('ends drag panning on release and click panning on the next click', () => {
  dispose = installMiddleMouseScroll(vi.fn());
  const link = document.querySelector('a')!;
  fireEvent.mouseDown(link, { button: 1, clientY: 100 });
  fireEvent.mouseMove(document, { clientY: 200 });
  fireEvent.mouseUp(link, { button: 1 });
  expect(document.documentElement.dataset.middleScroll).toBeUndefined();
  fireEvent.mouseDown(link, { button: 1, clientY: 100 });
  fireEvent.mouseUp(link, { button: 1 });
  fireEvent.mouseDown(link, { button: 0 });
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(document.documentElement.dataset.middleScroll).toBeUndefined();
});

it('leaves editors and macOS middle clicks alone', () => {
  const changed = vi.fn();
  dispose = installMiddleMouseScroll(changed);
  fireEvent.mouseDown(document.querySelector('input')!, { button: 1 });
  expect(changed).not.toHaveBeenCalled();
  document.documentElement.dataset.desktop = 'macos';
  fireEvent.mouseDown(document.querySelector('a')!, { button: 1 });
  expect(changed).not.toHaveBeenCalled();
});
