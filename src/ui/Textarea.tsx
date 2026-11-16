import type { FunctionalComponent as FC, JSX } from 'preact';
import { forwardRef } from 'preact/compat';

export type TTextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea: FC<TTextareaProps> = forwardRef<HTMLTextAreaElement, TTextareaProps>(
  (props, ref) => <textarea {...props} ref={ref} />
);
