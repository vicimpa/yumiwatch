import { plainText, yummyFetch } from './api';
import { getSession } from './session';

export type YummyNotification = {
  id: number;
  date: number;
  title_html?: string;
  text_html?: string;
  click_uri?: string;
  type: string;
  sub_type?: string;
  viewed: boolean;
};
export type Dialog = {
  user_id: number;
  nickname: string;
  avatars?: { small?: string; big?: string };
  last_message?: string;
  unread_count: number;
  date?: number;
  last_online?: number;
};
export type Message = {
  id: number;
  from_id: number;
  to_id: number;
  nickname: string;
  text: string;
  date: number;
  read: boolean;
  deleted?: boolean;
  edited?: boolean;
};

export async function socialRequest<T>(
  path: string,
  options: Parameters<typeof yummyFetch>[1] = {}
): Promise<T> {
  const session = getSession();
  if (!session?.verified) throw new Error('Войди в аккаунт YummyAnime.');
  const result = await yummyFetch<T>(path, { ...options, token: session.token });
  if (
    getSession()?.token !== session.token ||
    getSession()?.user.id !== session.user.id ||
    !getSession()?.verified
  )
    throw new DOMException('Сессия изменилась.', 'AbortError');
  return result;
}

export const isNotification = (value: unknown): value is YummyNotification => {
  const n = value as YummyNotification | null;
  return !!n && Number.isSafeInteger(n.id) && n.id > 0 && typeof n.type === 'string';
};
export const isMessage = (value: unknown): value is Message => {
  const m = value as Message | null;
  return (
    !!m &&
    Number.isSafeInteger(m.id) &&
    m.id > 0 &&
    Number.isSafeInteger(m.from_id) &&
    Number.isSafeInteger(m.to_id) &&
    typeof m.text === 'string'
  );
};

export async function fetchNotifications(offset = 0, signal?: AbortSignal) {
  const values = await socialRequest<YummyNotification[]>('/profile/notifications', {
    params: { limit: 50, offset },
    signal,
  });
  if (!Array.isArray(values)) throw new Error('Не удалось прочитать уведомления.');
  return values.filter(isNotification);
}

export async function fetchDialogs(offset = 0, signal?: AbortSignal, userId?: number) {
  const value = await socialRequest<{ dialogs: Dialog[] }>('/dialogs', {
    params: { limit: 20, offset, need_uid: userId },
    signal,
  });
  if (!Array.isArray(value?.dialogs)) throw new Error('Не удалось прочитать диалоги.');
  return value.dialogs.filter(
    d => Number.isSafeInteger(d?.user_id) && d.user_id > 0 && typeof d.nickname === 'string'
  );
}

export async function fetchMessages(id: number, before = 0, signal?: AbortSignal) {
  const values = await socialRequest<Message[]>(`/dialogs/${id}/messages`, {
    params: { limit: 50, start_from: before || undefined },
    signal,
  });
  if (!Array.isArray(values)) throw new Error('Не удалось прочитать сообщения.');
  return values.filter(isMessage);
}

export async function sendMessage(id: number, text: string) {
  const message = text.trim();
  if (!message || message.length > 10_000)
    throw new Error('Напиши сообщение от 1 до 10 000 символов.');
  const value = await socialRequest<Message>(`/dialogs/${id}/messages`, {
    method: 'POST',
    body: { message },
  });
  if (!isMessage(value)) throw new Error('Yummy не подтвердил отправку сообщения.');
  return value;
}

export async function acknowledge(path: string, method = 'POST') {
  if ((await socialRequest(path, { method })) !== true)
    throw new Error('Yummy не подтвердил изменение.');
}

// HTML arrives from Yummy. Render only text, and never follow arbitrary server-supplied schemes.
export const socialText = (value = '') => {
  if (typeof DOMParser === 'undefined') return plainText(value);
  const doc = new DOMParser().parseFromString(value, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  return doc.body.textContent || '';
};

export function notificationHref(uri?: string) {
  if (!uri) return undefined;
  try {
    const url = new URL(uri, 'https://ru.yummyani.me');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !/^(?:(?:ru|en|uk)\.)?(?:yummyani\.me|yummy-ani\.me|yani\.tv)$/.test(url.hostname)
    )
      return undefined;
    const anime = /^\/catalog\/item\/([^/]+)$/.exec(url.pathname);
    if (anime) return `#/anime/${encodeURIComponent(decodeURIComponent(anime[1]))}`;
    if (/^\/users\/id[1-9]\d*$/.test(url.pathname)) return `#${url.pathname}`;
    if (url.pathname === '/dialogs') {
      const id = Number(url.searchParams.get('id'));
      return Number.isSafeInteger(id) && id > 0 ? `#/messages?user=${id}` : '#/messages';
    }
    return url.href;
  } catch {
    return undefined;
  }
}
