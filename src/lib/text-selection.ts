const editable =
  'textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=hidden]),[contenteditable]:not([contenteditable=false])';

// Each selection must stay inside one piece of copyable content. WebKit's
// native Select All can bypass keydown and select a player/container directly.
const copyable = [
  '.card-title',
  '.card-caption p',
  '.gallery-feature-copy h2',
  '.gallery-feature-description',
  '.gallery-continue h3',
  '.result-copy',
  '.history-copy',
  '.schedule-card h3',
  '.subscription-card h3',
  '.poster-fallback span',
  '.watch-title h1',
  '.detail-meta',
  '.full-synopsis',
  '.anime-facts dd',
  '.viewing-order strong',
  '.voice-tile strong',
  '.sidebar-header p',
  '.comment-text',
  '.comment-author',
  '.comment-author-name',
  '.card-title-tooltip',
  '[data-selectable]',
  editable,
].join(',');

/** Keep native Select All inside editors; never turn the application window into a selection. */
export function installSelectionPolicy() {
  const element = (node: EventTarget | Node | null) =>
    node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  const keydown = (event: KeyboardEvent) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.code === 'KeyA' || event.key.toLowerCase() === 'a') &&
      !element(event.target)?.closest(editable)
    ) {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    }
  };
  const selectstart = (event: Event) => {
    const target = element(event.target);
    if (!target || target.closest(editable)) return;
    const style = getComputedStyle(target);
    if (style.userSelect !== 'text' && style.getPropertyValue('-webkit-user-select') !== 'text')
      event.preventDefault();
  };
  const selectionchange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const ancestor = element(selection.getRangeAt(0).commonAncestorContainer);
    if (!ancestor?.closest(copyable)) selection.removeAllRanges();
  };
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('selectstart', selectstart);
  document.addEventListener('selectionchange', selectionchange);
  return () => {
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('selectstart', selectstart);
    document.removeEventListener('selectionchange', selectionchange);
  };
}
