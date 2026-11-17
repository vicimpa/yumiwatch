import type { ComponentChildren, FunctionalComponent as FC } from 'preact';

import { Button, ButtonLink } from './Button';
import { Icon } from './Icon';

export type TEmptyProps = {
  icon?: 'search' | 'heart' | 'calendar' | 'wifi' | 'clock' | 'bell' | 'user' | 'comment';
  title: string;
  children: ComponentChildren;
  action?: ComponentChildren;
};

export const Empty: FC<TEmptyProps> = ({ icon = 'search', title, children, action }) => (
  <div class="empty-state">
    <span class="empty-icon">
      <Icon name={icon} size={30} />
    </span>
    <h2>{title}</h2>
    <p>{children}</p>
    {action}
  </div>
);

export type TErrorStateProps = { error: string; retry: () => void };

export const ErrorState: FC<TErrorStateProps> = ({ error, retry }) => (
  <Empty icon="wifi" title="Не удалось загрузить">
    {error}
    <span class="error-actions">
      <Button onClick={retry}>
        <Icon name="refresh" size={17} />
        Попробовать снова
      </Button>
      <ButtonLink href="#/settings" variant="text">
        Настройки API
      </ButtonLink>
    </span>
  </Empty>
);
