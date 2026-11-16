import type { FunctionalComponent as FC } from 'preact';

import { WindowChrome } from './WindowChrome';
import { Button } from '~/ui';

type TStartupErrorProps = { title: string; message: string; action: string; icon?: boolean };

const reload = () => location.reload();

export const StartupError: FC<TStartupErrorProps> = ({ title, message, action, icon }) => (
  <>
    <WindowChrome />
    <div class="fatal-error">
      {icon && (
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="64" height="64" alt="" />
      )}
      <h1>{title}</h1>
      <p>{message}</p>
      <Button variant="primary" onClick={reload}>
        {action}
      </Button>
    </div>
  </>
);
