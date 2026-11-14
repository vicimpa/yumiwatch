import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

let locks = 0;
let previousBody = '';
let previousRoot = '';
export function lockPageScroll() {
  if (locks++ === 0) {
    previousBody = document.body.style.overflow; previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) { document.body.style.overflow = previousBody; document.documentElement.style.overflow = previousRoot; }
  };
}
export function Sheet({ title, subtitle, close, children, footer, actions, navigation, className = '' }: { title: string; subtitle?: string; close: () => void; children: ComponentChildren; footer?: ComponentChildren; actions?: ComponentChildren; navigation?: ComponentChildren; className?: string }) {
  const id = useId(); const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!; const unlock = lockPageScroll();
    if (element.showModal) element.showModal(); else element.setAttribute('open', '');
    return () => { if (element.open && element.close) element.close(); unlock(); };
  }, []);
  return <dialog ref={dialog} class={`mobile-sheet ${className}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}><div class="mobile-sheet-layout"><header class="mobile-sheet-header"><button type="button" class="icon-button" onClick={close} aria-label="Закрыть"><Icon name="close"/></button><div><h2 id={id}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions && <div class="sheet-header-actions">{actions}</div>}</header>{navigation}<div class="modal-scroll">{children}</div>{footer && <footer class="mobile-sheet-footer">{footer}</footer>}</div></dialog>;
}
