import type { JSX } from 'preact';
import { Icon } from './Icon';

export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span class="select-control"><select {...props}/><Icon name="chevron" size={16}/></span>;
}
