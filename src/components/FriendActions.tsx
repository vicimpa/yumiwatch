import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ApiError } from '~/lib/api';
import { useResource, useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import { acknowledge, socialRequest } from '~/lib/social-api';
import { realtime } from '~/lib/social';
import { Button, FormError, Icon } from '~/ui';

export const FriendActions: FC<{ id: number }> = ({ id }) => {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resource = useResource(
    async signal => {
      let status = '';
      if (session?.verified && session.user.id !== id) {
        try {
          status =
            (
              await socialRequest<{ status?: string }>(`/users/${session.user.id}/friends/${id}`, {
                signal,
              })
            ).status || '';
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      }
      return { data: status, cached: false, savedAt: Date.now() };
    },
    [id, session?.token, session?.verified]
  );
  useEffect(
    () =>
      realtime.onEvent(event => {
        if (
          event.event === 'notification' &&
          (event.message as { type?: string })?.type === 'friend'
        )
          resource.retry();
      }),
    [resource.retry]
  );
  if (!session?.verified || session.user.id === id) return null;
  const status = resource.value?.data || '';
  const adding = !['friends', 'sent-requests', 'following'].includes(status);
  const label =
    status === 'friends'
      ? 'Удалить из друзей'
      : status === 'sent-requests'
        ? 'Отменить заявку'
        : status === 'followers' || status === 'requests'
          ? 'Принять заявку'
          : status === 'following'
            ? 'Отписаться'
            : 'Добавить в друзья';
  return (
    <>
      <Button
        disabled={busy || resource.loading || !!resource.error}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await acknowledge(`/users/${session.user.id}/friends/${id}`, adding ? 'PUT' : 'DELETE');
            resource.retry();
            notify(
              adding
                ? status === 'followers' || status === 'requests'
                  ? 'Заявка принята'
                  : 'Заявка в друзья отправлена'
                : 'Список друзей обновлён'
            );
            window.dispatchEvent(new Event('yumiwatch:friends'));
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="users" size={16} />
        {label}
      </Button>
      {(error || resource.error) && (
        <FormError>
          {error || resource.error}
          <Button variant="text" onClick={resource.retry}>
            Повторить
          </Button>
        </FormError>
      )}
    </>
  );
};
