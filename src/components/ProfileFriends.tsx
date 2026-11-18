import { AppLink } from '~/ui/AppLink';
import type { FunctionalComponent as FC } from 'preact';
import { useState } from 'preact/hooks';
import { useLiveUsers } from '~/hooks/useYummyRealtime';

import { yummyFetch } from '~/lib/api';
import { useResource, useSession } from '~/lib/hooks';
import {
  loadProfileFriends,
  peekProfileFriends,
  profileHref,
  type UserProfile,
} from '~/lib/profile';
import { Avatar, Button, Empty, ErrorState, Icon, Input, SEARCH_INPUT_PROPS, Skeleton } from '~/ui';

export const ProfileFriends: FC<{ id?: number }> = ({ id }) => {
  const session = useSession();
  const [discover, setDiscover] = useState(!id);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = discover ? 24 : 100;
  const resource = useResource(
    async signal => {
      if (!discover && id) return loadProfileFriends(id, offset, signal);
      const data = await yummyFetch<UserProfile[]>('/users', {
        params: { nickname: query, limit, offset, order_by: 'lastonline_desc' },
        token: session?.verified ? session.token : undefined,
        signal,
      });
      if (!Array.isArray(data)) throw new Error('Не удалось загрузить пользователей.');
      return { data, cached: false, savedAt: Date.now() };
    },
    [id, discover, query, offset, session?.token, session?.verified],
    () => (!discover && id ? peekProfileFriends(id, offset) : undefined)
  );
  const users = useLiveUsers(resource.value?.data || []);

  return (
    <section class="profile-panel">
      <div class="profile-section-top">
        <div>
          <h2>{discover ? 'Найти своих' : 'Друзья по интересам'}</h2>
          <p class="profile-muted">Открой профиль, загляни в коллекцию, найди следующую историю.</p>
        </div>
        <div class="profile-segment" aria-label="Пользователи">
          {id && (
            <button
              aria-pressed={!discover}
              onClick={() => {
                setDiscover(false);
                setOffset(0);
              }}
            >
              Друзья
            </button>
          )}
          <button
            aria-pressed={discover}
            onClick={() => {
              setDiscover(true);
              setOffset(0);
            }}
          >
            Найти людей
          </button>
        </div>
      </div>
      {discover && (
        <form
          class="profile-people-search"
          onSubmit={event => {
            event.preventDefault();
            setQuery(input.trim());
            setOffset(0);
          }}
        >
          <div class="collection-search">
            <Icon name="search" size={18} />
            <Input
              type="search"
              {...SEARCH_INPUT_PROPS}
              aria-label="Никнейм пользователя"
              placeholder="Никнейм на YummyAnime"
              value={input}
              onInput={event => setInput(event.currentTarget.value)}
              maxLength={100}
            />
          </div>
          <Button type="submit">Найти</Button>
        </form>
      )}
      {resource.loading ? (
        <Skeleton count={4} />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : users.length ? (
        <div class="profile-people-grid">
          {users.map(user => (
            <AppLink href={profileHref(user.id)} class="profile-person" key={user.id}>
              <span class="profile-person-avatar">
                <Avatar url={user.avatars?.big || user.avatars?.small} name={user.nickname} />
              </span>
              <span>
                <strong>{user.nickname}</strong>
                <small>
                  {user.last_online && Date.now() / 1000 - user.last_online < 300
                    ? 'Недавно в сети'
                    : 'Открыть профиль'}
                </small>
              </span>
              <Icon name="chevron" size={17} />
            </AppLink>
          ))}
        </div>
      ) : (
        <Empty icon="search" title={discover ? 'Никого не нашли' : 'Здесь ещё тихо'}>
          {discover
            ? 'Попробуй начало никнейма или другой запрос.'
            : 'Друзья с YummyAnime появятся здесь. А пока можно найти людей с похожими вкусами.'}
        </Empty>
      )}
      {!resource.loading && !resource.error && (offset > 0 || users.length === limit) && (
        <div class="profile-pagination">
          <Button disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - limit))}>
            <Icon name="back" size={16} />
            Назад
          </Button>
          <span>Страница {Math.floor(offset / limit) + 1}</span>
          <Button disabled={users.length < limit} onClick={() => setOffset(value => value + limit)}>
            Дальше
            <Icon name="arrow" size={16} />
          </Button>
        </div>
      )}
    </section>
  );
};
