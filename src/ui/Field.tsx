import {
  cloneElement,
  type ComponentChildren,
  type FunctionalComponent as FC,
  type JSX,
  type VNode,
} from 'preact';
import { useId } from 'preact/hooks';

import { FormError } from './Form';

type TControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: JSX.AriaAttributes['aria-invalid'];
};

export type TFieldProps = Omit<JSX.LabelHTMLAttributes<HTMLLabelElement>, 'children'> & {
  label: ComponentChildren;
  children: VNode<TControlProps>;
  hint?: string;
  error?: string;
};

export const Field: FC<TFieldProps> = ({ label, children, hint, error, ...props }) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [children.props['aria-describedby'], hint && hintId, error && errorId]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <label {...props}>
        {label}
        {hint || error
          ? cloneElement(children, {
              'aria-describedby': describedBy,
              'aria-invalid': error ? true : children.props['aria-invalid'],
            })
          : children}
      </label>
      {hint && (
        <small id={hintId} class="fine-print">
          {hint}
        </small>
      )}
      {error && (
        <FormError id={errorId} class="sheet-validation">
          {error}
        </FormError>
      )}
    </>
  );
};
