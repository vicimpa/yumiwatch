import type { ComponentChildren, FunctionalComponent as FC } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { useMediaQuery } from '~/lib/hooks';
import { interfaceSettings } from '~/lib/interface-settings';
import { focusTarget, keyboardTargets } from '~/lib/keyboard-navigation';
import { lockPageScroll } from '~/lib/page-scroll';

import { Button } from './Button';
import { Icon } from './Icon';

export type TSidebarProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  close: () => void;
  children: ComponentChildren;
  docked?: boolean;
  className?: string;
};

export const Sidebar: FC<TSidebarProps> = ({
  open,
  title,
  subtitle,
  close,
  children,
  docked = false,
  className = '',
}) => {
  const mobile = useMediaQuery('(max-width: 760px), (max-width: 1000px) and (pointer: coarse)'),
    id = useId();
  const element = useRef<HTMLElement>(null);
  const [present, setPresent] = useState(open);
  const callbacks = useRef({ close });

  callbacks.current = { close };

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);

      return;
    }

    const duration =
      interfaceSettings().animations &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 180
        : 0;

    if (!duration) {
      setPresent(false);

      return;
    }

    const timer = setTimeout(() => setPresent(false), duration);

    return () => clearTimeout(timer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !present) return;

    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const button = element.current?.querySelector<HTMLButtonElement>('.sidebar-close');

      if (button) focusTarget(button);
    });

    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open],.video-settings,[data-card-context-menu]')) return;
      if (event.key === 'Escape' && element.current?.querySelector('.app-update-popover')) return;
      if (
        event.key === 'Escape' &&
        event.target instanceof HTMLElement &&
        event.target.closest('.native-auto-action')
      )
        return;
      if (
        event.key === 'Escape' ||
        (event.key === 'Backspace' &&
          !(
            event.target instanceof HTMLElement &&
            event.target.closest('input,textarea,[contenteditable]')
          ))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.current.close();
      }
      if (event.key === 'Tab' && (mobile || !docked)) {
        const targets = keyboardTargets(element.current!);
        const first = targets[0],
          last = targets.at(-1);

        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          focusTarget(last);
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          focusTarget(first);
        }
      }
    };

    window.addEventListener('keydown', keyboard, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keyboard, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, present, mobile, docked]);

  useEffect(() => {
    if (open && (mobile || !docked)) return lockPageScroll();
  }, [open, mobile, docked]);

  if (!present) return null;

  const content = (
    <div
      class={`sidebar-presence ${docked ? 'is-docked' : 'is-overlay'} ${open ? 'is-open' : 'is-closing'} ${className}`}
    >
      {(!docked || mobile) && (
        <button
          class="sidebar-backdrop"
          tabIndex={-1}
          aria-label={`Закрыть ${title.toLowerCase()}`}
          onClick={close}
        />
      )}
      <aside
        ref={element}
        class="media-sidebar"
        role={mobile || !docked ? 'dialog' : 'complementary'}
        aria-modal={mobile || !docked ? true : undefined}
        aria-labelledby={id}
        aria-hidden={!open}
        inert={!open}
        data-sidebar-open={open}
      >
        <header class="sidebar-header">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <Button aria-label="Закрыть панель" onClick={close} variant="icon" class="sidebar-close">
            <Icon name="close" />
          </Button>
        </header>
        <div class="sidebar-scroll">{children}</div>
      </aside>
    </div>
  );

  return mobile || !docked
    ? createPortal(content, document.fullscreenElement || document.body)
    : content;
};
