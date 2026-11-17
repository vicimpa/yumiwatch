import type { FunctionalComponent as FC, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export const CardTitleTooltip: FC = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null),
    tip = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    if (!anchor?.isConnected || !tip.current) return;

    const rect = anchor.getBoundingClientRect(),
      element = tip.current;
    const inset =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-inset')) ||
      0;
    const left = Math.max(12, Math.min(innerWidth - element.offsetWidth - 12, rect.left));
    const below = rect.bottom + 8,
      above = rect.top - element.offsetHeight - 8;

    element.style.left = `${left}px`;
    element.style.top = `${Math.max(inset + 8, Math.min(innerHeight - element.offsetHeight - 12, below + element.offsetHeight < innerHeight - 12 ? below : above))}px`;
  }, [anchor]);

  useLayoutEffect(position, [anchor]);

  const wheel = useCallback(
    (event: JSX.TargetedWheelEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const scroller = anchor?.closest<HTMLElement>('.media-scroll,.sidebar-scroll,.modal-scroll');
      if (!scroller) return;
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? scroller.clientHeight : 1;
      const dy = event.deltaY * unit,
        dx = event.deltaX * unit;
      // Fixed tooltips do not reliably participate in their ancestor's native
      // wheel chain. Let a long title scroll internally, then pass its edge on.
      const canScrollY =
        dy < 0
          ? element.scrollTop > 0
          : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      const canScrollX =
        dx < 0
          ? element.scrollLeft > 0
          : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      if (Math.abs(dy) >= Math.abs(dx) ? canScrollY : canScrollX) return;
      event.preventDefault();
      scroller.scrollTop += dy;
      scroller.scrollLeft += dx;
    },
    [anchor]
  );

  useEffect(() => {
    const find = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest('[data-gallery-item]')?.querySelector<HTMLElement>('.card-title')
        : null;

    const show = (target: EventTarget | null) => {
      if (target instanceof Element && target.closest('.card-title-tooltip')) return;

      const title = find(target);

      setAnchor(
        title &&
          (title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1)
          ? title
          : null
      );
    };

    const pointer = (event: Event) => show(event.target),
      focus = (event: Event) => show(event.target);

    const leave = (event: FocusEvent) => {
      if (!find(event.relatedTarget)) setAnchor(null);
    };

    const hide = () => setAnchor(null);

    document.addEventListener('pointerover', pointer);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', leave);
    window.addEventListener('hashchange', hide);

    return () => {
      document.removeEventListener('pointerover', pointer);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', leave);
      window.removeEventListener('hashchange', hide);
    };
  }, []);

  useEffect(() => {
    if (!anchor) return;

    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = anchor.getBoundingClientRect();

        if (
          !anchor.isConnected ||
          !anchor.getClientRects().length ||
          rect.bottom < 0 ||
          rect.top > innerHeight
        )
          setAnchor(null);
        else position();
      });
    };

    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  return anchor
    ? createPortal(
        <div ref={tip} class="card-title-tooltip" role="tooltip" data-selectable onWheel={wheel}>
          {anchor.textContent}
        </div>,
        anchor.closest('.media-scroll,.sidebar-scroll,.modal-scroll') ||
          document.fullscreenElement ||
          document.body
      )
    : null;
};
