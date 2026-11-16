import type { FunctionalComponent as FC, JSX } from 'preact';

export type TButtonVariant = 'primary' | 'secondary' | 'text' | 'icon';

export type TButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'> & {
  variant?: TButtonVariant;
  class?: string;
};

export type TButtonLinkProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'class'> & {
  variant?: TButtonVariant;
  class?: string;
};

const variants: Record<TButtonVariant, string> = {
  primary: 'button primary',
  secondary: 'button secondary',
  text: 'text-link',
  icon: 'icon-button',
};

function actionClass(variant: TButtonVariant, extra?: string) {
  return [variants[variant], extra].filter(Boolean).join(' ');
}

export const Button: FC<TButtonProps> = ({ variant = 'secondary', class: className, ...props }) => (
  <button {...props} class={actionClass(variant, className)} />
);

export const ButtonLink: FC<TButtonLinkProps> = ({
  variant = 'secondary',
  class: className,
  ...props
}) => <a {...props} class={actionClass(variant, className)} />;
