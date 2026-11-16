import type { ComponentChildren, FunctionalComponent as FC, JSX } from 'preact';

import { Icon } from './Icon';

export type TOptionButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'class'
> & {
  class?: string;
  label: string;
  description?: ComponentChildren;
  selected?: boolean;
};

export const OptionButton: FC<TOptionButtonProps> = ({
  label,
  description,
  selected,
  class: className,
  ...props
}) => (
  <button
    type="button"
    {...props}
    class={['source-option', selected && 'selected', className].filter(Boolean).join(' ')}
  >
    <span>
      <strong>{label}</strong>
      {description && <small>{description}</small>}
    </span>
    {selected && <Icon name="check" size={20} />}
  </button>
);
