import { signal } from '@preact/signals';

import { YummyRealtime } from '~/core/YummyRealtime';
import { fetchFriends } from './profile';
import { getSession, SESSION_EVENT } from './session';
import { readJSON, writeJSON } from './storage';
import { cacheChatMessage, cacheChatRead, readDialogCache, saveDialogCache } from './chat-cache';
import {
  acknowledge,
  fetchDialogs,
  fetchNotifications,
  isMessage,
  isNotification,
  notificationHref,
  socialRequest,
  socialText,
  type Dialog,
  type Message,
  type YummyNotification,
} from './social-api';

type SocialState = {
  userId?: number;
  notifications: YummyNotification[];
  dialogs: Dialog[];
  notificationCount: number;
  messageCount: number;
  loading: boolean;
  error: string;
};
const empty = (): SocialState => ({
  notifications: [],
  dialogs: [],
  notificationCount: 0,
  messageCount: 0,
  loading: false,
  error: '',
});
export const social = signal<SocialState>(empty());
export const realtimeStatus = signal<import('~/core/YummyRealtime').RealtimeStatus>('idle');
export const realtime = new YummyRealtime(status => {
  realtimeStatus.value = status;
});
export const activityNotice = signal<{ title: string; text: string; href: string } | undefined>();
export const SOCIAL_SETTINGS_EVENT = 'yumiwatch:social-settings';
export const SUBSCRIPTIONS_EVENT = 'yumiwatch:subscriptions';
type SocialSettings = { popups: boolean; friends: boolean; system: boolean };
export function socialSettings(): SocialSettings {
  const saved = readJSON<Partial<SocialSettings>>('yumiwatch:social-settings', {});
  return {
    popups: saved.popups !== false,
    friends: saved.friends !== false,
    system: saved.system === true,
  };
}
export function saveSocialSettings(patch: Partial<SocialSettings>) {
  if (!writeJSON('yumiwatch:social-settings', { ...socialSettings(), ...patch }))
    throw new Error('Не удалось сохранить настройки уведомлений.');
  window.dispatchEvent(new Event(SOCIAL_SETTINGS_EVENT));
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function dismissActivity() {
  clearTimeout(noticeTimer);
  activityNotice.value = undefined;
}
function announce(title: string, text: string, href: string) {
  const settings = socialSettings();
  if (settings.popups) {
    activityNotice.value = { title, text, href };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(dismissActivity, 8000);
  }
  if (settings.system && document.visibilityState !== 'visible') {
    const owner = social.value.userId;
    const token = getSession()?.token;
    void import('./system-notifications')
      .then(async ({ showSystemNotification }) => {
        const current = () =>
          !!owner && social.value.userId === owner && getSession()?.token === token;
        if (current()) await showSystemNotification(title, text, current);
      })
      .catch(() => {});
  }
}

export function mergeNotifications(...pages: YummyNotification[][]) {
  return [...new Map(pages.flat().map(n => [n.id, n])).values()].sort((a, b) => b.id - a.id);
}
export function mergeDialogs(...pages: Dialog[][]) {
  return [...new Map(pages.flat().map(d => [d.user_id, d])).values()].sort(
    (a, b) => (b.date || 0) - (a.date || 0)
  );
}

let refreshCurrent: (() => Promise<void>) | undefined;
export const refreshSocial = () => refreshCurrent?.() || Promise.resolve();

export async function markNotificationRead(id?: number) {
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))
    throw new Error('Некорректное уведомление.');
  const owner = social.value.userId;
  const before = social.value;
  const loaded = new Set(before.notifications.map(n => n.id));
  await acknowledge(id ? `/profile/notifications/${id}/read` : '/profile/notifications/read');
  if (social.value.userId !== owner) return;
  const current = social.value;
  const target = current.notifications.find(n => n.id === id);
  social.value = {
    ...current,
    notifications: current.notifications.map(n =>
      (id ? n.id === id : loaded.has(n.id)) ? { ...n, viewed: true } : n
    ),
    notificationCount: Math.max(
      0,
      current.notificationCount -
        (id ? (target && !target.viewed ? 1 : 0) : before.notificationCount)
    ),
  };
  void refreshSocial();
}

export async function markDialogRead(id: number) {
  const owner = social.value.userId;
  const result = await socialRequest<{ ok: boolean }>(`/dialogs/${id}/messages/read`, {
    method: 'POST',
  });
  // A repeated read returns {ok:false} even with HTTP 200. Confirm the
  // authoritative unread counter instead of treating a no-op as a failure.
  const alreadyRead =
    result?.ok === false &&
    (await fetchDialogs(0, undefined, id)).find(dialog => dialog.user_id === id)?.unread_count ===
      0;
  if (result?.ok !== true && !alreadyRead)
    throw new Error('Не удалось отметить сообщения прочитанными. Попробуй ещё раз.');
  if (social.value.userId !== owner) return;
  cacheChatRead(id, id);
  const current = social.value;
  const unread = current.dialogs.find(d => d.user_id === id)?.unread_count || 0;
  social.value = {
    ...current,
    messageCount: Math.max(0, current.messageCount - unread),
    dialogs: current.dialogs.map(d => (d.user_id === id ? { ...d, unread_count: 0 } : d)),
  };
}

export function receiveMessage(message: Message, notify = false) {
  const state = social.value;
  const id = state.userId;
  if (!id || (message.from_id !== id && message.to_id !== id) || message.to_id === 0) return;
  cacheChatMessage(id, message);
  const other = message.from_id === id ? message.to_id : message.from_id;
  const previous = state.dialogs.find(d => d.user_id === other);
  const incoming = message.from_id !== id;
  const dialog: Dialog = {
    ...previous,
    user_id: other,
    nickname: previous?.nickname || (incoming ? message.nickname : `Пользователь ${other}`),
    last_message: message.deleted ? 'Сообщение удалено' : message.text,
    date: message.date,
    unread_count: (previous?.unread_count || 0) + (notify && incoming && !message.read ? 1 : 0),
  };
  social.value = {
    ...state,
    dialogs: mergeDialogs(state.dialogs, [dialog]),
    messageCount: state.messageCount + (notify && incoming && !message.read ? 1 : 0),
  };
  if (notify && incoming && location.hash !== `#/messages?user=${other}`)
    announce(dialog.nickname, socialText(message.text), `#/messages?user=${other}`);
}

/** Synchronous account event handling prevents old socket/HTTP replies leaking into a new account. */
export function startSocial() {
  let stopAccount = () => {};
  let identity: string | undefined;
  let initialized = false;
  const update = () => {
    const session = getSession();
    const token = session?.verified ? session.token : undefined;
    const accountKey = token ? `${session!.user.id}:${token}` : undefined;
    if (initialized && accountKey === identity) return;
    initialized = true;
    identity = accountKey;
    stopAccount();
    stopAccount = () => {};
    dismissActivity();
    const cached = token ? readDialogCache() : undefined;
    social.value = {
      ...empty(),
      userId: token ? session!.user.id : undefined,
      loading: !!token,
      dialogs: cached?.dialogs || [],
      messageCount: cached?.messageCount || 0,
    };
    realtime.start(token);
    if (!token || !session) return;

    const controller = new AbortController();
    const current = () =>
      !controller.signal.aborted &&
      getSession()?.token === token &&
      getSession()?.user.id === session.user.id &&
      getSession()?.verified;
    const cleanups: (() => void)[] = [];
    let pending = false,
      again = false,
      revision = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let counterTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCounterRequest = 0;
    let connectedAt = Date.now();
    let lastOnline = 0;
    const seen = new Set<string>();
    const friends = new Map<number, { nickname: string; lastOnline: number; lastNotice: number }>();
    const friendSubscriptions: (() => void)[] = [];
    let loadingFriends = false;
    let device = readJSON<string>('yumiwatch:device-id', '');
    if (typeof device !== 'string' || !device) {
      device =
        globalThis.crypto?.randomUUID?.() ||
        `yw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeJSON('yumiwatch:device-id', device);
    }
    const updateOnline = () => {
      if (!current() || document.visibilityState !== 'visible' || Date.now() - lastOnline < 240_000)
        return;
      lastOnline = Date.now();
      void socialRequest('/profile/online', {
        method: 'POST',
        body: { hash: device },
        signal: controller.signal,
      }).catch(() => {});
    };
    // Profile deltas and notifications can arrive in either order. Reconcile the counters once
    // the burst settles instead of allowing an optimistic increment to double an authoritative count.
    const reconcileCounts = () => {
      clearTimeout(counterTimer);
      counterTimer = setTimeout(
        () => {
          if (!current()) return;
          const captured = revision;
          lastCounterRequest = Date.now();
          void socialRequest<{
            notifications?: { count?: number };
            messages?: { unread_count?: number };
          }>('/profile', { signal: controller.signal })
            .then(profile => {
              if (!current()) return;
              if (revision !== captured) {
                reconcileCounts();
                return;
              }
              social.value = {
                ...social.value,
                notificationCount: profile.notifications?.count ?? social.value.notificationCount,
                messageCount: profile.messages?.unread_count ?? social.value.messageCount,
              };
            })
            .catch(() => {});
        },
        Math.max(1000, lastCounterRequest + 5000 - Date.now())
      );
    };

    const refresh = async () => {
      if (!current()) return;
      if (pending) {
        again = true;
        return;
      }
      pending = true;
      const captured = revision;
      const results = await Promise.allSettled([
        fetchNotifications(0, controller.signal),
        fetchDialogs(0, controller.signal),
        socialRequest<{ notifications?: { count?: number }; messages?: { unread_count?: number } }>(
          '/profile',
          { signal: controller.signal }
        ),
      ]);
      if (!current()) return;
      const [notifications, dialogs, profile] = results;
      const state = social.value;
      if (captured === revision) {
        social.value = {
          ...state,
          loading: false,
          notifications:
            notifications.status === 'fulfilled'
              ? mergeNotifications(state.notifications, notifications.value)
              : state.notifications,
          dialogs:
            dialogs.status === 'fulfilled'
              ? mergeDialogs(state.dialogs, dialogs.value)
              : state.dialogs,
          notificationCount:
            profile.status === 'fulfilled'
              ? (profile.value.notifications?.count ?? state.notificationCount)
              : state.notificationCount,
          messageCount:
            profile.status === 'fulfilled'
              ? (profile.value.messages?.unread_count ?? state.messageCount)
              : state.messageCount,
          error: results.some(r => r.status === 'rejected')
            ? 'Не всё удалось обновить. Повтори загрузку.'
            : '',
        };
        social.value.notifications.forEach(n => seen.add(`n:${n.id}`));
      } else {
        social.value = { ...state, loading: false };
        again = true;
      }
      pending = false;
      if (again) {
        again = false;
        refreshTimer = setTimeout(() => void refresh(), 1000);
      }
    };
    refreshCurrent = refresh;

    const loadFriends = async () => {
      if (loadingFriends) return;
      loadingFriends = true;
      try {
        const found = new Map<number, Awaited<ReturnType<typeof fetchFriends>>[number]>();
        for (let offset = 0; current(); offset += 100) {
          const page = await fetchFriends(session.user.id, offset, controller.signal);
          if (!current()) return;
          const size = found.size;
          page.forEach(user => found.set(user.id, user));
          if (page.length < 100 || found.size === size) break;
        }
        if (!current()) return;
        friendSubscriptions.splice(0).forEach(unsubscribe => unsubscribe());
        for (const id of friends.keys()) if (!found.has(id)) friends.delete(id);
        found.forEach(user => {
          const old = friends.get(user.id);
          friends.set(user.id, {
            nickname: user.nickname,
            lastOnline: user.last_online || 0,
            lastNotice: old?.lastNotice || 0,
          });
          friendSubscriptions.push(
            realtime.subscribe('user', user.id, event => {
              if (!current()) return;
              const data = event.data as { last_online?: number; nickname?: string } | undefined;
              if (
                !data ||
                typeof data.last_online !== 'number' ||
                !Number.isFinite(data.last_online)
              )
                return;
              const previous = friends.get(user.id)!;
              const now = Date.now() / 1000;
              if (
                socialSettings().friends &&
                Date.now() - connectedAt > 5000 &&
                previous.lastOnline > 0 &&
                now - previous.lastOnline > 300 &&
                now - data.last_online < 60 &&
                now - previous.lastNotice > 300
              ) {
                announce(previous.nickname, 'Теперь в сети', `#/users/id${user.id}`);
                previous.lastNotice = now;
              }
              previous.lastOnline = data.last_online;
            })
          );
        });
      } catch {
        /* Presence is optional; REST friends remain usable. */
      } finally {
        loadingFriends = false;
      }
    };

    cleanups.push(
      realtime.onEvent(event => {
        if (!current()) return;
        if (event.event === 'connect') {
          connectedAt = Date.now();
          void refresh();
          return;
        }
        if (event.event === 'notification' && isNotification(event.message)) {
          const n = event.message;
          const key = `n:${n.id}`;
          if (seen.has(key)) return;
          seen.add(key);
          revision++;
          const state = social.value;
          social.value = {
            ...state,
            notifications: mergeNotifications(state.notifications, [n]),
            notificationCount: state.notificationCount + (n.viewed ? 0 : 1),
          };
          if (!n.viewed)
            announce(
              socialText(n.title_html) || 'Уведомление YummyAnime',
              socialText(n.text_html),
              notificationHref(n.click_uri) || '#/notifications'
            );
          if (n.type === 'friend') void loadFriends();
          reconcileCounts();
        } else if (event.event === 'new-message' && isMessage(event.message)) {
          const key = `m:${event.message.id}`;
          if (seen.has(key)) return;
          seen.add(key);
          revision++;
          receiveMessage(event.message, true);
          reconcileCounts();
        } else if (['message-read', 'message-deleted', 'message-edited'].includes(event.event)) {
          if (isMessage(event.message))
            cacheChatMessage(session.user.id, {
              ...event.message,
              deleted: event.event === 'message-deleted' || event.message.deleted,
            });
          if (event.event === 'message-read' && typeof event.user_id === 'number')
            cacheChatRead(event.user_id, session.user.id);
          revision++;
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(), 500);
        }
        if (seen.size > 2000) seen.delete(seen.values().next().value!);
      })
    );
    cleanups.push(
      realtime.subscribe('profile', session.user.id, event => {
        if (!current()) return;
        const data = event.data as
          { notifications?: { count?: number }; messages?: { unread_count?: number } } | undefined;
        if (!data) return;
        revision++;
        social.value = {
          ...social.value,
          notificationCount: data.notifications?.count ?? social.value.notificationCount,
          messageCount: data.messages?.unread_count ?? social.value.messageCount,
        };
      })
    );
    void refresh();
    void loadFriends();
    updateOnline();
    const presenceTimer = setInterval(updateOnline, 240_000);
    document.addEventListener('visibilitychange', updateOnline);
    const friendsChanged = () => void loadFriends();
    window.addEventListener('yumiwatch:friends', friendsChanged);
    const fallback = setInterval(() => {
      if (realtime.status !== 'connected') void refresh();
    }, 60_000);
    stopAccount = () => {
      controller.abort();
      refreshCurrent = undefined;
      clearTimeout(refreshTimer);
      clearTimeout(counterTimer);
      clearInterval(fallback);
      clearInterval(presenceTimer);
      document.removeEventListener('visibilitychange', updateOnline);
      window.removeEventListener('yumiwatch:friends', friendsChanged);
      cleanups.forEach(cleanup => cleanup());
      friendSubscriptions.forEach(cleanup => cleanup());
    };
  };
  const online = () => realtime.reconnect();
  const offline = () => realtime.offline();
  const resume = () => {
    if (document.visibilityState === 'visible') {
      if (realtime.status !== 'connected') realtime.reconnect();
      void refreshSocial();
    }
  };
  window.addEventListener(SESSION_EVENT, update);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', offline);
  window.addEventListener('pageshow', online);
  document.addEventListener('visibilitychange', resume);
  update();
  let cachedDialogs: Dialog[] | undefined;
  let cachedCount = -1;
  const persistDialogs = social.subscribe(state => {
    if (state.userId && (cachedDialogs !== state.dialogs || cachedCount !== state.messageCount)) {
      saveDialogCache(state.userId, state.dialogs, state.messageCount);
      cachedDialogs = state.dialogs;
      cachedCount = state.messageCount;
    }
  });
  return () => {
    persistDialogs();
    window.removeEventListener(SESSION_EVENT, update);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    window.removeEventListener('pagehide', offline);
    window.removeEventListener('pageshow', online);
    document.removeEventListener('visibilitychange', resume);
    stopAccount();
    realtime.stop();
    dismissActivity();
    social.value = empty();
  };
}
