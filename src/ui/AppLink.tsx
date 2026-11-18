import type { FunctionalComponent as FC, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { publicAppUrl } from '~/lib/content-links';
import { SELECTABLE_CONTENT } from '~/lib/text-selection';

type Props = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { publicHref?: string };

/** A portable website address with ordinary clicks routed inside the app. */
export const AppLink: FC<Props> = ({ href, publicHref, onClick, draggable, ...props }) => {
  const route = typeof href === 'string' && href.startsWith('#/') ? href : undefined;
  const canDrag =
    draggable ??
    (props.role !== 'menuitem' &&
      !!(route?.startsWith('#/anime/') || route?.startsWith('#/users/')));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const restoreHref = useRef<() => void>();
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      restoreHref.current?.();
    },
    [route]
  );

  return (
    <a
      {...props}
      href={route ? publicHref || publicAppUrl(route) : href}
      data-app-href={route}
      draggable={draggable ?? (canDrag ? undefined : false)}
      onMouseDown={event => {
        restoreHref.current?.();
        // WebKit will not select a word in an active hyperlink. Release the
        // second press for native selection; first-press dragging keeps its URL.
        if (
          event.detail > 1 &&
          event.target instanceof Element &&
          event.target.closest(SELECTABLE_CONTENT)
        ) {
          const link = event.currentTarget;
          const address = link.getAttribute('href');
          if (address) {
            link.removeAttribute('href');
            const restore = () => {
              if (!link.hasAttribute('href')) link.setAttribute('href', address);
              document.removeEventListener('mouseup', restore);
              restoreHref.current = undefined;
            };
            restoreHref.current = restore;
            document.addEventListener('mouseup', restore, { once: true });
          }
        }
        props.onMouseDown?.(event);
      }}
      onClick={event => {
        if (event.defaultPrevented) return;
        if (
          !route ||
          (props.target && props.target !== '_self') ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          onClick?.(event);
          return;
        }
        const link = event.currentTarget;
        const selected = () => {
          const selection = window.getSelection();
          return (
            !!selection &&
            !selection.isCollapsed &&
            (link.contains(selection.anchorNode) || link.contains(selection.focusNode))
          );
        };
        // Keep the native word/paragraph selection before following a text link.
        const text = event.target instanceof Element && event.target.closest(SELECTABLE_CONTENT);
        clearTimeout(timer.current);
        if ((event.detail > 0 && selected()) || (text && event.detail > 1)) {
          event.preventDefault();
          return;
        }
        if (text && event.detail === 1) {
          event.preventDefault();
          const from = location.hash;
          timer.current = setTimeout(() => {
            if (link.isConnected && location.hash === from && !selected()) link.click();
          }, 400);
          return;
        }
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          location.hash = route.slice(1);
        }
      }}
    />
  );
};
