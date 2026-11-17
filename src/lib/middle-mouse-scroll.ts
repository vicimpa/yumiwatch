export type ScrollAnchor = { x: number; y: number; horizontal: boolean; vertical: boolean };

/** Match Windows middle-click panning, including links inside scrollable cards. */
export function installMiddleMouseScroll(changed: (anchor: ScrollAnchor | null) => void) {
  const windows = () =>
    document.documentElement.dataset.desktop === 'windows' ||
    (!document.documentElement.dataset.desktop && navigator.platform.startsWith('Win'));
  let active:
    | {
        anchor: ScrollAnchor;
        horizontal?: HTMLElement;
        vertical?: HTMLElement;
        x: number;
        y: number;
        moved: boolean;
      }
    | undefined;
  let frame = 0;
  let previous = 0;
  let swallowClick = false;
  const stop = () => {
    active = undefined;
    cancelAnimationFrame(frame);
    delete document.documentElement.dataset.middleScroll;
    changed(null);
  };
  const speed = (distance: number) =>
    Math.sign(distance) * Math.min(3, Math.pow(Math.max(0, Math.abs(distance) - 10) / 80, 1.4));
  const tick = (time: number) => {
    if (!active) return;
    if (!active.horizontal?.isConnected && !active.vertical?.isConnected) {
      stop();
      return;
    }
    const elapsed = previous ? Math.min(32, time - previous) : 16;
    previous = time;
    if (active.horizontal?.isConnected)
      active.horizontal.scrollLeft += speed(active.x - active.anchor.x) * elapsed;
    if (active.vertical?.isConnected)
      active.vertical.scrollTop += speed(active.y - active.anchor.y) * elapsed;
    frame = requestAnimationFrame(tick);
  };
  const down = (event: MouseEvent) => {
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      swallowClick = event.button === 0;
      stop();
      return;
    }
    if (event.button !== 1 || !(event.target instanceof Element)) return;
    if (
      !windows() ||
      event.target.closest(
        'input,textarea,select,[contenteditable=true],[role=menu],[role=listbox]'
      )
    )
      return;
    if (
      !event.target.closest(
        '.media-scroll,.sidebar-scroll,.modal-scroll,.conversation-scroll,.dialog-scroll'
      )
    )
      return;
    let horizontal: HTMLElement | undefined, vertical: HTMLElement | undefined;
    for (
      let element = event.target.closest<HTMLElement>('*');
      element && element !== document.body;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);
      if (
        !horizontal &&
        /auto|scroll/.test(style.overflowX) &&
        element.scrollWidth > element.clientWidth + 1
      )
        horizontal = element;
      if (
        !vertical &&
        /auto|scroll/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 1
      )
        vertical = element;
    }
    if (!horizontal && !vertical) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const anchor = {
      x: event.clientX,
      y: event.clientY,
      horizontal: !!horizontal,
      vertical: !!vertical,
    };
    active = { anchor, horizontal, vertical, x: event.clientX, y: event.clientY, moved: false };
    previous = 0;
    document.documentElement.dataset.middleScroll =
      horizontal && vertical ? 'xy' : horizontal ? 'x' : 'y';
    changed(anchor);
    frame = requestAnimationFrame(tick);
  };
  const move = (event: MouseEvent) => {
    if (!active) return;
    active.x = event.clientX;
    active.y = event.clientY;
    if (Math.hypot(event.clientX - active.anchor.x, event.clientY - active.anchor.y) > 10)
      active.moved = true;
  };
  const up = (event: MouseEvent) => {
    if (event.button === 1 && active?.moved) stop();
  };
  const aux = (event: MouseEvent) => {
    if (
      event.button === 1 &&
      windows() &&
      event.target instanceof Element &&
      event.target.closest(
        '.media-scroll,.sidebar-scroll,.modal-scroll,.conversation-scroll,.dialog-scroll'
      )
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const click = (event: MouseEvent) => {
    if (swallowClick) {
      swallowClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const key = (event: KeyboardEvent) => {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
    }
  };
  document.addEventListener('mousedown', down, true);
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
  document.addEventListener('auxclick', aux, true);
  document.addEventListener('click', click, true);
  window.addEventListener('keydown', key, true);
  window.addEventListener('blur', stop);
  window.addEventListener('hashchange', stop);
  window.addEventListener('wheel', stop, { passive: true });
  return () => {
    stop();
    document.removeEventListener('mousedown', down, true);
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    document.removeEventListener('auxclick', aux, true);
    document.removeEventListener('click', click, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', stop);
    window.removeEventListener('hashchange', stop);
    window.removeEventListener('wheel', stop);
  };
}
