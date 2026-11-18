import type { FunctionalComponent as FC } from 'preact';
import { flushSync } from 'preact/compat';
import { useLayoutEffect, useState } from 'preact/hooks';

export type TChoiceTabsProps = {
  value: string;
  choices: readonly (readonly [value: string, title: string])[];
  onChange: (value: string) => void;
  label: string;
  active?: boolean;
  class?: string;
};

/** Confirm a choice before the parent updates its route or starts expensive work. */
export const ChoiceTabs: FC<TChoiceTabsProps> = ({
  value,
  choices,
  onChange,
  label,
  active = true,
  class: className,
}) => {
  const [selected, setSelected] = useState(value);

  // Confirmations and external navigation, including Back/Forward, stay authoritative.
  useLayoutEffect(() => setSelected(value), [value, active]);

  const choose = (next: string) => {
    if (next === selected) return;
    flushSync(() => setSelected(next));
    try {
      onChange(next);
    } catch (error) {
      flushSync(() => setSelected(value));
      throw error;
    }
  };

  return (
    <div class={['home-tabs', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {choices.map(([option, title]) => (
        <button
          type="button"
          class={selected === option ? 'active' : undefined}
          aria-pressed={selected === option}
          key={option}
          onClick={() => choose(option)}
        >
          {title}
        </button>
      ))}
    </div>
  );
};
