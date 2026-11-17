import type { FunctionalComponent as FC } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';

const SELECTOR =
  '.media-scroll,.media-nav,.sidebar-scroll,.modal-scroll,.video-settings,.discussion-content';
const IDLE_DELAY = 850;

type Geometry = {
  top: number;
  right: number;
  height: number;
  thumb: number;
  offset: number;
  max: number;
  value: number;
};
const EMPTY: Geometry = { top: 0, right: 0, height: 0, thumb: 0, offset: 0, max: 0, value: 0 };

const Scrollbar: FC<{ target: HTMLElement }> = ({ target }) => {
  const [geometry, setGeometry] = useState(EMPTY);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const drag = useRef<{ y: number; scroll: number }>();
  const latest = useRef(geometry);
  const hide = useRef<ReturnType<typeof setTimeout>>();
  latest.current = geometry;

  const show = () => {
    clearTimeout(hide.current);
    setVisible(true);
    hide.current = setTimeout(() => {
      if (!drag.current) setVisible(false);
    }, IDLE_DELAY);
  };

  useLayoutEffect(() => {
    const originalId = target.id;
    if (!originalId) target.id = `scroll-region-${id}`;
    let frame = 0;
    const measure = () => {
      const rect = target.getBoundingClientRect();
      const max = target.scrollHeight - target.clientHeight;
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(0, rect.top) - 12);
      const thumb = Math.min(
        height,
        Math.max(32, (height * target.clientHeight) / Math.max(1, target.scrollHeight))
      );
      const next =
        max > 1 && rect.width > 0 && height > 20
          ? {
              top: Math.max(0, rect.top) + 6,
              right: Math.max(0, innerWidth - rect.right) + 3,
              height,
              thumb,
              max,
              value: target.scrollTop,
              offset: Math.max(0, Math.min(1, target.scrollTop / max)) * (height - thumb),
            }
          : EMPTY;
      setGeometry(previous =>
        Object.keys(next).every(
          key => Math.abs(previous[key as keyof Geometry] - next[key as keyof Geometry]) < 0.5
        )
          ? previous
          : next
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const scroll = () => {
      show();
      schedule();
    };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
    const observe = () => {
      resize?.disconnect();
      resize?.observe(target);
      for (const child of target.children) resize?.observe(child);
      schedule();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(target, { childList: true, subtree: true, characterData: true });
    observe();
    measure();
    target.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('animationend', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hide.current);
      mutations.disconnect();
      resize?.disconnect();
      target.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      if (!originalId && target.id === `scroll-region-${id}`) target.removeAttribute('id');
    };
  }, [target, id]);

  if (!geometry.max) return null;
  const endDrag = () => {
    drag.current = undefined;
    setDragging(false);
    show();
  };
  const label = target.matches('.media-scroll') ? 'Прокрутка страницы' : 'Прокрутка панели';

  return createPortal(
    <div
      class={`overlay-scrollbar ${visible ? 'is-visible' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ top: geometry.top, right: geometry.right, height: geometry.height }}
    >
      <button
        type="button"
        class="overlay-scrollbar-thumb"
        role="scrollbar"
        aria-label={label}
        aria-controls={target.id || `scroll-region-${id}`}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.round(geometry.max)}
        aria-valuenow={Math.round(geometry.value)}
        style={{ height: geometry.thumb, transform: `translateY(${geometry.offset}px)` }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, scroll: target.scrollTop };
          setDragging(true);
          show();
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const value = latest.current;
          target.scrollTop =
            drag.current.scroll +
            ((event.clientY - drag.current.y) * value.max) /
              Math.max(1, value.height - value.thumb);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          if (drag.current) endDrag();
        }}
        onKeyDown={event => {
          const step =
            event.key === 'ArrowDown'
              ? 48
              : event.key === 'ArrowUp'
                ? -48
                : event.key === 'PageDown'
                  ? target.clientHeight * 0.9
                  : event.key === 'PageUp'
                    ? -target.clientHeight * 0.9
                    : 0;
          if (!step && !['Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          target.scrollTop =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? latest.current.max
                : target.scrollTop + step;
          show();
        }}
      />
    </div>,
    target.closest('dialog') || document.body
  );
};

export const Scrollbars: FC = () => {
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const keys = useRef(new WeakMap<HTMLElement, number>());
  const sequence = useRef(0);
  useEffect(() => {
    let frame = 0;
    const scan = () => {
      const next = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
      for (const target of next)
        if (!keys.current.has(target)) keys.current.set(target, ++sequence.current);
      setTargets(previous =>
        previous.length === next.length && previous.every((value, index) => value === next[index])
          ? previous
          : next
      );
    };
    const observer = new MutationObserver(records => {
      if (
        records.every(
          record => record.target instanceof Element && record.target.closest('.overlay-scrollbar')
        )
      )
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      {targets.map(target => (
        <Scrollbar key={keys.current.get(target)} target={target} />
      ))}
    </>
  );
};
