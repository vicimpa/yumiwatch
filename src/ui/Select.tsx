import type { FunctionalComponent as FC, JSX } from 'preact';
import { forwardRef } from 'preact/compat';

import { Icon } from './Icon';

export type TSelectProps = JSX.SelectHTMLAttributes<HTMLSelectElement>;

export const Select: FC<TSelectProps> = forwardRef<HTMLSelectElement, TSelectProps>(
  (props, ref) => (
    <span class="select-control">
      <select {...props} ref={ref} />
      <Icon name="chevron" size={16} />
    </span>
  )
);
