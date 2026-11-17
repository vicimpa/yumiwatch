import type { FunctionalComponent as FC, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import './Dropdown.css';

type Props = {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  'aria-label': string;
  'aria-describedby'?: string;
  'aria-invalid'?: JSX.AriaAttributes['aria-invalid'];
  disabled?: boolean;
};

export const Dropdown: FC<Props> = ({ value, options, onChange, ...props }) => {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    options.findIndex(option => option.value === value)
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const [position, setPosition] = useState<JSX.CSSProperties>({});
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 220 && above > below;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: Math.min(rect.width, window.innerWidth - 16),
        maxHeight: Math.max(0, Math.min(280, upwards ? above : below)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const keydown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        setActive(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : selected);
        setOpen(true);
      } else if (event.key === 'Enter' || event.key === ' ') choose(active);
      else if (event.key === 'Home') setActive(0);
      else if (event.key === 'End') setActive(options.length - 1);
      else
        setActive(
          (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        );
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = options.findIndex(option =>
        option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())
      );
      if (match >= 0) {
        event.preventDefault();
        event.stopPropagation();
        setActive(match);
        setOpen(true);
      }
    }
  };

  return (
    <>
      <button
        {...props}
        type="button"
        class="settings-dropdown"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        ref={trigger}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        onBlur={event => {
          if (!menu.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={keydown}
      >
        <span>{options[selected]?.label}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={menu}
            role="listbox"
            aria-label={props['aria-label']}
            class="settings-dropdown-menu"
            style={position}
          >
            {options.map((option, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-${index}`}
                key={option.value}
                tabIndex={-1}
                aria-selected={option.value === value}
                class={active === index ? 'is-active' : ''}
                onPointerDown={event => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
