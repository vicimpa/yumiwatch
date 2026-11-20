// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installSelectionPolicy } from '~/lib/text-selection';
let release = () => {};
afterEach(() => {
  release();
  getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});
describe('application text selection', () => {
  it('selects the current content block with Cmd+A, including on a Russian layout', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<main id="main"><h2 data-selectable>Название аниме</h2><button>Кнопка</button></main>';
    const title = document.querySelector('h2')!;
    const range = document.createRange();
    range.setStart(title.firstChild!, 0);
    range.setEnd(title.firstChild!, 8);
    getSelection()!.addRange(range);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ф',
        code: 'KeyA',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    document.dispatchEvent(new Event('selectionchange'));
    expect(getSelection()!.toString()).toBe('Название аниме');
  });
  it('selects main content when there is no current selection and blocks chrome dragging', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<nav><a draggable="false">Каталог</a></nav><main id="main"><p data-selectable>Описание</p><a href="https://ru.yummyani.me/catalog/item/42">Аниме</a></main>';
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })
    );
    document.dispatchEvent(new Event('selectionchange'));
    expect(getSelection()!.toString()).toContain('Описание');
    expect(getSelection()!.toString()).not.toContain('Каталог');
    getSelection()!.removeAllRanges();
    for (const [selector, prevented] of [
      ['nav a', true],
      ['main a', false],
    ] as const) {
      const drag = new Event('dragstart', { bubbles: true, cancelable: true });
      document.querySelector(selector)!.dispatchEvent(drag);
      expect(drag.defaultPrevented).toBe(prevented);
    }
  });
  it('selects an open sidebar even when main content comes first in the document', () => {
    release = installSelectionPolicy();
    document.body.innerHTML =
      '<main id="main"><p data-selectable>Основной текст</p></main><aside data-sidebar-open="true"><div class="sidebar-scroll"><p class="comment-text">Текст панели</p></div></aside>';
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    document.dispatchEvent(new Event('selectionchange'));
    expect(getSelection()!.toString()).toBe('Текст панели');
  });
  it('blocks Select All on application chrome and selects editable text explicitly', () => {
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
    const textarea = document.querySelector('textarea')!;

    textarea.dispatchEvent(field);
    expect(field.defaultPrevented).toBe(true);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe('Сообщение'.length);
    const range = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('input')!.dispatchEvent(range);
    expect(range.defaultPrevented).toBe(true);
  });
  it('selects a search field with Cmd+A, including on a Russian layout', () => {
    release = installSelectionPolicy();
    document.body.innerHTML = '<input type="search" value="Безжалостная леди">';
    const input = document.querySelector('input')!;

    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ф',
      code: 'KeyA',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
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
