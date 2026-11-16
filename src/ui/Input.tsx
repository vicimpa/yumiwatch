import type { FunctionalComponent as FC, JSX } from 'preact';
import { forwardRef } from 'preact/compat';

export type TInputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

export const Input: FC<TInputProps> = forwardRef<HTMLInputElement, TInputProps>((props, ref) => (
  <input {...props} ref={ref} />
));
