import type { FunctionalComponent as FC, JSX } from 'preact';
import { forwardRef } from 'preact/compat';

export type TFormProps = JSX.FormHTMLAttributes<HTMLFormElement>;

export const Form: FC<TFormProps> = forwardRef<HTMLFormElement, TFormProps>((props, ref) => (
  <form {...props} ref={ref} />
));

export type TFormActionsProps = JSX.HTMLAttributes<HTMLDivElement>;

export const FormActions: FC<TFormActionsProps> = props => <div {...props} />;

export type TFormErrorProps = JSX.HTMLAttributes<HTMLParagraphElement | HTMLDivElement> & {
  as?: 'p' | 'div';
};

export const FormError: FC<TFormErrorProps> = ({ as: Element = 'p', ...props }) => (
  <Element {...props} role="alert" />
);
