// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, saveSession } from '~/lib/session';
import {
  activityNotice,
  markDialogRead,
  markNotificationRead,
  social,
  startSocial,
} from '~/lib/social';
import { notificationHref, sendMessage, socialRequest, socialText } from '~/lib/social-api';
import { FakeSocket } from './realtime-fixture';

const reply = (response: unknown) => new Response(JSON.stringify({ response }));
const signIn = (token = 'test-token', id = 42) =>
  saveSession({
    token,
    user: { id, nickname: 'Viewer' },
    remember: false,
    refreshedAt: Date.now(),
    verified: true,
  });
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
let stop = () => {};
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      reply(
        url.includes('/friends')
          ? []
          : url.includes('/dialogs')
            ? { dialogs: [] }
            : url.includes('/notifications')
              ? []
              : { notifications: { count: 0 }, messages: { unread_count: 0 } }
      )
    )
  );
});
afterEach(() => {
  stop();
  stop = () => {};
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('personal realtime data', () => {
  it('adds incoming notifications once, with safe text and a local destination', async () => {
    signIn();
    stop = startSocial();
    await tick();
    const socket = FakeSocket.instances[0];
    socket.open();
    await tick();
    const event = {
      event: 'notification',
      message: {
        id: 123,
        date: 1,
        type: 'friend',
        viewed: false,
        title_html: '<b>Друг</b>',
        text_html: '<img src=x onerror=alert(1)>Привет',
        click_uri: '/users/id8',
      },
    };
    socket.message(event);
    socket.message(event);
    expect(social.value.notificationCount).toBe(1);
    expect(social.value.notifications).toHaveLength(1);
    expect(activityNotice.value).toEqual({ title: 'Друг', text: 'Привет', href: '#/users/id8' });
  });

  it('clears private state synchronously at logout and rejects late socket events', async () => {
    signIn();
    stop = startSocial();
    await tick();
    const old = FakeSocket.instances[0];
    old.open();
    await tick();
    old.message({ event: 'notification', message: { id: 1, type: 'friend', viewed: false } });
    clearSession();
    expect(social.value.userId).toBeUndefined();
    expect(social.value.notifications).toHaveLength(0);
    expect(activityNotice.value).toBeUndefined();
    old.message({ event: 'notification', message: { id: 2, type: 'friend' } });
    expect(social.value.notifications).toHaveLength(0);
  });

  it('does not let a response for one account overwrite another account', async () => {
    signIn();
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(r => {
            resolve = r;
          })
      )
    );
    const pending = socialRequest('/dialogs');
    signIn('different', 7);
    resolve(reply({ dialogs: [{ user_id: 8 }] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('accepts the documented object confirmation when marking a dialog read', async () => {
    signIn();
    social.value = {
      userId: 42,
      notifications: [],
      notificationCount: 0,
      dialogs: [{ user_id: 8, nickname: 'Друг', unread_count: 3 }],
      messageCount: 3,
      loading: false,
      error: '',
    };
    const fetcher = vi.fn().mockResolvedValue(reply({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    await markDialogRead(8);
    expect(fetcher.mock.calls[0][0]).toContain('/dialogs/8/messages/read');
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
    expect(social.value.dialogs[0].unread_count).toBe(0);
    expect(social.value.messageCount).toBe(0);
  });

  it.each([false, null, true, { ok: 1 }, { ok: 'true' }])(
    'does not clear unread counts on an invalid read confirmation: %j',
    async response => {
      signIn();
      social.value = {
        userId: 42,
        notifications: [],
        notificationCount: 0,
        dialogs: [{ user_id: 8, nickname: 'Друг', unread_count: 3 }],
        messageCount: 3,
        loading: false,
        error: '',
      };
      const before = social.value;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(response)));
      await expect(markDialogRead(8)).rejects.toThrow('отметить сообщения прочитанными');
      expect(social.value).toBe(before);
    }
  );

  it.each([0, 3, undefined])('checks the server counter after a no-op read: %s', async unread => {
    signIn();
    social.value = {
      userId: 42,
      notifications: [],
      notificationCount: 0,
      dialogs: [{ user_id: 8, nickname: 'Друг', unread_count: 3 }],
      messageCount: 3,
      loading: false,
      error: '',
    };
    const before = social.value;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) =>
      reply(
        options.method === 'POST'
          ? { ok: false }
          : {
              dialogs:
                unread === undefined
                  ? []
                  : [{ user_id: 8, nickname: 'Друг', unread_count: unread }],
            }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    if (unread === 0) {
      await markDialogRead(8);
      expect(social.value.dialogs[0].unread_count).toBe(0);
      expect(social.value.messageCount).toBe(0);
    } else {
      await expect(markDialogRead(8)).rejects.toThrow('отметить сообщения прочитанными');
      expect(social.value).toBe(before);
    }
    expect(fetcher.mock.calls[1][0]).toContain('need_uid=8');
  });

  it('does not mark an event arriving during read-all as already read', async () => {
    signIn();
    social.value = {
      userId: 42,
      notifications: [{ id: 1, type: 'friend', date: 1, viewed: false }],
      dialogs: [],
      notificationCount: 1,
      messageCount: 0,
      loading: false,
      error: '',
    };
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(r => {
            resolve = r;
          })
      )
    );
    const read = markNotificationRead();
    social.value = {
      ...social.value,
      notifications: [
        ...social.value.notifications,
        { id: 2, type: 'friend', date: 2, viewed: false },
      ],
      notificationCount: 2,
    };
    resolve(reply(true));
    await read;
    expect(social.value.notificationCount).toBe(1);
    expect(social.value.notifications.find(n => n.id === 2)?.viewed).toBe(false);
  });

  it('keeps message counts private, ignores public chat, and deduplicates delivery', async () => {
    signIn();
    stop = startSocial();
    await tick();
    const socket = FakeSocket.instances[0];
    socket.open();
    await tick();
    const message = {
      id: 99,
      from_id: 8,
      to_id: 42,
      nickname: 'Друг',
      text: 'Привет',
      date: 1,
      read: false,
    };
    socket.message({ event: 'new-message', message: { ...message, id: 98, to_id: 0 } });
    socket.message({ event: 'new-message', message });
    socket.message({ event: 'new-message', message });
    expect(social.value.messageCount).toBe(1);
    expect(social.value.dialogs).toHaveLength(1);
    expect(activityNotice.value?.href).toBe('#/messages?user=8');
  });

  it('sends only a user-submitted trimmed message and requires server confirmation', async () => {
    signIn();
    const fetcher = vi.fn(async () => reply({ id: 1, from_id: 42, to_id: 8, text: 'Привет' }));
    vi.stubGlobal('fetch', fetcher);
    await sendMessage(8, ' Привет ');
    expect(fetcher.mock.calls[0]).toBeTruthy();
    await expect(sendMessage(8, '   ')).rejects.toThrow('Напиши сообщение');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('notification content', () => {
  it('keeps HTML inert and permits only official HTTPS destinations', () => {
    expect(socialText('<script>alert(1)</script><b>Новое</b><br>Серия &amp; друзья')).toBe(
      'Новое\nСерия & друзья'
    );
    expect(notificationHref('javascript:alert(1)')).toBeUndefined();
    expect(notificationHref('https://ru.yummyani.me.evil.test/users/id8')).toBeUndefined();
    expect(notificationHref('//evil.test')).toBeUndefined();
    expect(notificationHref('https://ru.yummyani.me/catalog/item/anime-alias')).toBe(
      '#/anime/anime-alias'
    );
    expect(notificationHref('/dialogs?id=8')).toBe('#/messages?user=8');
  });
});
