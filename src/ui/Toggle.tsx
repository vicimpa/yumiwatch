import type { ComponentChildren, FunctionalComponent as FC, JSX } from 'preact';

import { Input } from './Input';

export type TToggleProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'class' | 'children'
> & {
  children: ComponentChildren;
  class?: string;
};

export const Toggle: FC<TToggleProps> = ({ children, class: className, ...props }) => (
  <label class={['watch-toggle', className].filter(Boolean).join(' ')}>
    <Input {...props} type="checkbox" />
    {children}
  </label>
);
