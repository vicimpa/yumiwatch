import { interfaceSettings } from './interface-settings';

export function keyboardTargets(scope: ParentNode): HTMLElement[] {
  return [
    ...scope.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,summary,[tabindex]'
    ),
  ].filter(
    node =>
      node.tabIndex >= 0 &&
      !node.matches(':disabled,input[type=hidden]') &&
      !node.closest('[hidden],[inert],[aria-hidden=true],.video-hit-area') &&
      node.getClientRects().length > 0 &&
      !['hidden', 'collapse'].includes(getComputedStyle(node).visibility)
  );
}

/** Reveal the whole poster card and its focus ring, scrolling only its own rails/panels. */
export function revealFocus(node: HTMLElement) {
  if (!node.isConnected || node.closest('[hidden],[inert],[aria-hidden=true]')) return;

  const inset =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-inset')) || 0;
  const card = node.closest<HTMLElement>('[data-gallery-item]');
  const bounds =
    card && card.getBoundingClientRect().height < innerHeight - inset - 24 ? card : node;
  const rect = bounds.getBoundingClientRect();
  let { left, right, top, bottom } = rect;
  const behavior =
    interfaceSettings().animations &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'smooth'
      : 'instant';

  const delta = (start: number, end: number, min: number, max: number) =>
    start < min ? start - min : end > max ? Math.min(end - max, start - min) : 0;

  for (
    let parent = bounds.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      box = parent.getBoundingClientRect();
    const scrollX =
      /auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1;
    const scrollY =
      /auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1;

    if (!scrollX && !scrollY) continue;

    const x = box.left + parent.clientLeft,
      y = box.top + parent.clientTop;
    const ceiling = parent.matches('.media-scroll,.media-nav') ? inset : 0;
    const dx = scrollX ? delta(left, right, x + 8, x + parent.clientWidth - 8) : 0;
    const dy = scrollY ? delta(top, bottom, y + ceiling + 12, y + parent.clientHeight - 12) : 0;
    const nextX = Math.max(
      0,
      Math.min(parent.scrollWidth - parent.clientWidth, parent.scrollLeft + dx)
    );
    const nextY = Math.max(
      0,
      Math.min(parent.scrollHeight - parent.clientHeight, parent.scrollTop + dy)
    );

    left -= nextX - parent.scrollLeft;
    right -= nextX - parent.scrollLeft;
    top -= nextY - parent.scrollTop;
    bottom -= nextY - parent.scrollTop;
    if (Math.abs(nextX - parent.scrollLeft) > 1 || Math.abs(nextY - parent.scrollTop) > 1)
      parent.scrollTo?.({ left: nextX, top: nextY, behavior });
  }
}

export function focusTarget(node: HTMLElement) {
  node.focus({ preventScroll: true });
  if (document.activeElement === node) revealFocus(node);
}
