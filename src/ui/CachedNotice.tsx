import type { FunctionalComponent as FC } from 'preact';

import { Icon } from './Icon';

export type TCachedNoticeProps = {
  savedAt: number;
  refreshing?: boolean;
};

export const CachedNotice: FC<TCachedNoticeProps> = ({ savedAt, refreshing = false }) => (
  <p class="cached-notice">
    <Icon name="wifi" size={16} />
    Сохранённая версия от{' '}
    {new Date(savedAt).toLocaleString('ru', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}
    . {refreshing ? 'Проверяем обновления…' : 'Показываем сохранённые данные.'}
  </p>
);
