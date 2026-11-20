import { useEffect, useId, useRef, useState } from 'preact/hooks';

import type { AppRelease } from '~/lib/releases';
import { Button, ButtonLink, Icon } from '~/ui';

import './AppUpdateNotice.css';

type Props =
  | { apply: () => void; release?: never; dismiss?: never }
  | { apply?: never; release: AppRelease; dismiss: () => void };

export function AppUpdateNotice({ apply, release, dismiss }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHovered(false);
      setPinned(false);
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      if (root.current?.contains(document.activeElement)) trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={root}
      class="app-update"
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusOut={event => {
        if (!root.current?.contains(event.relatedTarget as Node)) setPinned(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        class="app-update-trigger"
        aria-label="Доступно обновление YummyWatch"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (pinned) setHovered(false);
          setPinned(!pinned);
        }}
      >
        <Icon name="spark" size={18} />
      </button>
      {open && (
        <div class="app-update-popover" id={id} role="group" aria-label="Обновление YummyWatch">
          <div class="app-update-panel">
            <div class="app-update-heading">
              <strong>
                {release ? `Доступна версия ${release.version}` : 'Готова новая версия'}
              </strong>
              {dismiss && (
                <button
                  type="button"
                  class="app-update-dismiss"
                  aria-label="Скрыть уведомление до следующего запуска"
                  onClick={dismiss}
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
            {release ? (
              <ButtonLink href={release.url} target="_blank" rel="noreferrer" variant="text">
                Что нового и скачать <Icon name="external" size={13} />
              </ButtonLink>
            ) : (
              <Button type="button" onClick={apply} variant="text">
                Обновить
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
