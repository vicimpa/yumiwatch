import type { FunctionalComponent as FC } from 'preact';

import { toastMessage } from '~/lib/notifications';

import { Icon } from './Icon';

export const Toast: FC = () => {
  const message = toastMessage.value;

  return (
    <div class={`toast ${message ? 'visible' : ''}`} role="status">
      {message && (
        <>
          <Icon name="check" size={18} />
          {message}
        </>
      )}
    </div>
  );
};
