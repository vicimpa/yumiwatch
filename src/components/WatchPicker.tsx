import type { FunctionalComponent as FC } from 'preact';

import { Icon } from '~/ui';

export type TWatchPickerProps = {
  label: string;
  value: string;
  onClick: () => void;
};

export const WatchPicker: FC<TWatchPickerProps> = ({ label, value, onClick }) => (
  <button aria-haspopup="dialog" aria-label={`${label}: ${value}`} onClick={onClick}>
    <span>
      <small>{label}</small>
      <strong>{value.replace(/^(Озвучка|Плеер) /, '')}</strong>
    </span>
    <Icon name="chevron" size={17} />
  </button>
);
