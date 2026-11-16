import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback } from 'preact/hooks';

import { Icon } from './Icon';
import { Input } from './Input';

// Search terms (titles, studios, episode numbers) must reach us unchanged.
export const SEARCH_INPUT_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellcheck: false,
  writingsuggestions: 'false',
} as const;

export type TSearchFieldProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'class' | 'onInput'
> & {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  class?: string;
};

export const SearchField: FC<TSearchFieldProps> = ({
  value,
  onValueChange,
  label,
  class: className,
  ...props
}) => {
  const change = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => onValueChange(event.currentTarget.value),
    [onValueChange]
  );

  return (
    <div class={['source-search', className].filter(Boolean).join(' ')}>
      <Icon name="search" size={18} />
      <Input
        {...SEARCH_INPUT_PROPS}
        {...props}
        type="search"
        aria-label={label}
        value={value}
        onInput={change}
      />
    </div>
  );
};
