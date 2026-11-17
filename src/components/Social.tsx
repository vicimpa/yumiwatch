import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import {
  activityNotice,
  dismissActivity,
  markNotificationRead,
  mergeNotifications,
  realtime,
  realtimeStatus,
  refreshSocial,
  saveSocialSettings,
  social,
  socialSettings,
  SOCIAL_SETTINGS_EVENT,
} from '~/lib/social';
import { fetchNotifications, notificationHref, socialText } from '~/lib/social-api';
import { Button, ButtonLink, Empty, FormError, Icon, SettingsCard, Skeleton, Toggle } from '~/ui';

export const UnreadBadge: FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <span class="social-badge" aria-label={`${count} непрочитанных`}>
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

export const RealtimeIndicator: FC = () => {
  const status = realtimeStatus.value;
  const connected = status === 'connected';
  return (
    <div class={`social-connection ${connected ? 'is-connected' : ''}`} role="status">
      <span class="social-status-dot" />
      <span>
        {connected
          ? 'Обновления в реальном времени'
          : status === 'offline'
            ? 'Нет сети'
            : status === 'denied'
              ? 'Не удалось подключить обновления'
              : 'Подключаем обновления…'}
      </span>
      {['denied', 'offline', 'reconnecting'].includes(status) && (
        <Button variant="text" onClick={() => realtime.reconnect()}>
          Повторить
        </Button>
      )}
    </div>
  );
};

export const SocialSignIn: FC<{ next: string }> = ({ next }) => (
  <Empty
    icon="user"
    title="Войди в YummyAnime"
    action={
      <ButtonLink href={`#/account?next=${encodeURIComponent(next)}`} variant="primary">
        Войти
      </ButtonLink>
    }
  >
    Сообщения и уведомления твоего аккаунта появятся здесь.
  </Empty>
);

export const ActivityNotice: FC = () => {
  const notice = activityNotice.value;
  if (!notice) return null;
  return (
    <aside class="activity-notice" aria-label="Новое событие">
      <a href={notice.href} onClick={dismissActivity}>
        <Icon name="bell" size={22} />
        <span role="status">
          <strong>{notice.title}</strong>
          <span>{notice.text}</span>
        </span>
      </a>
      <Button variant="icon" aria-label="Скрыть уведомление" onClick={dismissActivity}>
        <Icon name="close" size={16} />
      </Button>
    </aside>
  );
};

export const NotificationsPage: FC = () => {
  const session = useSession();
  return !session ? (
    <SocialSignIn next="/notifications" />
  ) : !session.verified ? (
    <Skeleton count={3} />
  ) : (
    <Notifications key={`${session.user.id}:${session.token}`} />
  );
};

const Notifications: FC = () => {
  const session = useSession()!;
  const state = social.value;
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(50);
  const [more, setMore] = useState(true);
  const owned = state.userId === session.user.id;
  const notifications = owned ? state.notifications : [];
  useEffect(() => {
    void refreshSocial();
  }, []);
  const read = async (id?: number) => {
    setBusy(true);
    setError('');
    try {
      await markNotificationRead(id);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="social-page">
      <header class="page-heading social-heading">
        <div>
          <p class="eyebrow">НА СВЯЗИ</p>
          <h1>Уведомления</h1>
          <p>Ответы, друзья и новые серии из YummyAnime.</p>
        </div>
        <Button variant="text" onClick={() => void refreshSocial()} disabled={state.loading}>
          <Icon name="refresh" size={18} />
          Обновить
        </Button>
      </header>
      <RealtimeIndicator />
      <div class="social-toolbar">
        <div class="profile-segment" aria-label="Тип уведомлений">
          {[
            ['all', 'Все'],
            ['friend', 'Друзья'],
            ['episodes', 'Новые серии'],
            ['comment', 'Ответы'],
          ].map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <Button
          disabled={busy || !state.notificationCount}
          onClick={() => void read()}
          variant="text"
        >
          Прочитать все
        </Button>
      </div>
      {(error || state.error) && (
        <FormError class="account-error">{error || state.error}</FormError>
      )}
      {state.loading && !notifications.length ? (
        <Skeleton count={4} />
      ) : (
        <div class="notification-list">
          {notifications
            .filter(
              n =>
                filter === 'all' ||
                (filter === 'episodes'
                  ? ['anime_episode', 'animeupdate'].includes(n.type)
                  : n.type === filter)
            )
            .map(n => {
              const href = notificationHref(n.click_uri);
              return (
                <article key={n.id} class={`notification-card ${!n.viewed ? 'is-unread' : ''}`}>
                  <span class="notification-symbol">
                    <Icon
                      name={
                        n.type === 'friend' ? 'users' : n.type === 'message' ? 'comment' : 'bell'
                      }
                      size={22}
                    />
                  </span>
                  <div>
                    <h2>{socialText(n.title_html) || 'Уведомление YummyAnime'}</h2>
                    <p>{socialText(n.text_html)}</p>
                    <div class="notification-meta">
                      {Number.isFinite(n.date) && Math.abs(n.date) <= 8.64e12 && (
                        <time dateTime={new Date(n.date * 1000).toISOString()}>
                          {new Date(n.date * 1000).toLocaleString('ru', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </time>
                      )}
                      {href && (
                        <a
                          href={href}
                          target={href.startsWith('https:') ? '_blank' : undefined}
                          rel="noreferrer"
                          onClick={() => {
                            if (!n.viewed)
                              void markNotificationRead(n.id).catch(error => notify(error.message));
                          }}
                        >
                          Открыть <Icon name="arrow" size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.viewed && (
                    <Button
                      variant="icon"
                      aria-label="Отметить прочитанным"
                      disabled={busy}
                      onClick={() => void read(n.id)}
                    >
                      <Icon name="check" size={18} />
                    </Button>
                  )}
                </article>
              );
            })}
          {!notifications.length && (
            <Empty icon="bell" title="Пока тихо">
              Новые события твоего аккаунта появятся здесь.
            </Empty>
          )}
          {notifications.length > 0 &&
            !notifications.some(
              n =>
                filter === 'all' ||
                (filter === 'episodes'
                  ? ['anime_episode', 'animeupdate'].includes(n.type)
                  : n.type === filter)
            ) && <p class="collection-note">В этой категории пока нет уведомлений.</p>}
        </div>
      )}
      {more && notifications.length >= 50 && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const page = await fetchNotifications(offset);
              social.value = {
                ...social.value,
                notifications: mergeNotifications(social.value.notifications, page),
              };
              setOffset(offset + 50);
              setMore(page.length === 50);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Загрузить ещё
        </Button>
      )}
    </div>
  );
};

export const NotificationSettingsCard: FC = () => {
  const [settings, setSettings] = useState(socialSettings);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setSettings(socialSettings());
    window.addEventListener(SOCIAL_SETTINGS_EVENT, update);
    return () => window.removeEventListener(SOCIAL_SETTINGS_EVENT, update);
  }, []);
  return (
    <SettingsCard
      title="Друзья и уведомления"
      icon={<Icon name="bell" size={25} />}
      description="События YummyAnime приходят, пока приложение работает."
    >
      <div class="social-settings">
        <Toggle
          checked={settings.popups}
          onChange={e => {
            try {
              saveSocialSettings({ popups: e.currentTarget.checked });
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          Показывать новые события в приложении
        </Toggle>
        <Toggle
          checked={settings.friends}
          onChange={e => {
            try {
              saveSocialSettings({ friends: e.currentTarget.checked });
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          Сообщать, когда друзья появляются в сети
        </Toggle>
        <Toggle
          checked={settings.system}
          disabled={busy}
          onChange={async e => {
            const enabled = e.currentTarget.checked;
            setBusy(true);
            setError('');
            try {
              if (enabled) {
                const { requestSystemNotifications } = await import('~/lib/system-notifications');
                if (!(await requestSystemNotifications()))
                  throw new Error('Разреши уведомления в настройках системы или браузера.');
              }
              saveSocialSettings({ system: enabled });
            } catch (error) {
              setError((error as Error).message);
              setSettings(socialSettings());
            } finally {
              setBusy(false);
            }
          }}
        >
          Системные уведомления, когда приложение свёрнуто
        </Toggle>
        {error && <FormError>{error}</FormError>}
      </div>
    </SettingsCard>
  );
};
