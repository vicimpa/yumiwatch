import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { installMiddleMouseScroll, type ScrollAnchor } from '~/lib/middle-mouse-scroll';
import './MiddleMouseScroll.css';

export function MiddleMouseScroll() {
  const [anchor, setAnchor] = useState<ScrollAnchor | null>(null);
  useEffect(() => installMiddleMouseScroll(setAnchor), []);
  return anchor
    ? createPortal(
        <div
          class={`middle-scroll-anchor ${anchor.horizontal ? 'has-horizontal' : ''} ${anchor.vertical ? 'has-vertical' : ''}`}
          style={{ left: anchor.x, top: anchor.y }}
          aria-hidden="true"
        >
          <span />
        </div>,
        document.fullscreenElement || document.body
      )
    : null;
}
