// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installSelectionPolicy } from '~/lib/text-selection';
let release = () => {};
afterEach(() => {
  release();
  document.body.innerHTML = '';
});
describe('application text selection', () => {
  it('blocks Select All on application chrome while leaving input selection native', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<main id="main"><button>Кнопка</button><textarea>Сообщение</textarea><input type="range"></main>';
    const button = document.querySelector('button')!;
    const root = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(root);
    expect(root.defaultPrevented).toBe(true);
    const field = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('textarea')!.dispatchEvent(field);
    expect(field.defaultPrevented).toBe(false);
    const range = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('input')!.dispatchEvent(range);
    expect(range.defaultPrevented).toBe(true);
  });
  it('clears a document-wide selection without interfering with copying message text', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<main id="main"><p class="comment-text">Первое</p><p class="comment-text">Второе</p></main>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('main')!);
    const selection = getSelection()!;
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(selection.isCollapsed).toBe(true);
    range.selectNodeContents(document.querySelector('p')!);
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(selection.toString()).toBe('Первое');
  });
  it('clears native Select All inside player containers and across separate copyable blocks', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<div class="video-controls"><div class="video-heading"><strong>Название</strong><p>Kodik · 720p</p></div></div><div class="comment-text">Первое</div><div class="comment-text">Второе</div><input>';
    const selection = getSelection()!;
    for (const target of ['.video-controls', '.video-heading', '.video-heading strong', 'body']) {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(target)!);
      selection.addRange(range);
      document.querySelector('input')!.focus();
      document.dispatchEvent(new Event('selectionchange'));
      expect(selection.isCollapsed).toBe(true);
    }
    selection.removeAllRanges();
    const text = document.querySelector('.comment-text')!;
    const range = document.createRange();
    range.selectNodeContents(text);
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(selection.toString()).toBe('Первое');
  });
  it('blocks Select All on the Russian keyboard layout too', () => {
    release = installSelectionPolicy();
    const event = new KeyboardEvent('keydown', {
      key: 'ф',
      code: 'KeyA',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
