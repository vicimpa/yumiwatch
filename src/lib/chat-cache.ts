import { deleteCache, getCache, putCache } from './cache-store';
import { getSession } from './session';
import { isMessage, type Dialog, type Message } from './social-api';

export type ChatPosition = { top: number; atBottom: boolean; anchor?: number; offset?: number };
export type CachedConversation = {
  messages: Message[];
  loaded: boolean;
  more: boolean;
  draft: string;
  position?: ChatPosition;
};
const MAX_MESSAGES = 300;
const ownerId = () => {
  const session = getSession();
  return session?.verified ? session.user.id : undefined;
};
const prefix = (owner: number) => `account:${owner}:chat:v1:`;
const threadKey = (owner: number, id: number) => `${prefix(owner)}thread:${id}`;
export const mergeMessages = (...pages: Message[][]) =>
  [...new Map(pages.flat().map(message => [message.id, message])).values()].sort(
    (a, b) => a.id - b.id
  );

export function readConversation(id: number): CachedConversation | undefined {
  const owner = ownerId();
  if (!owner) return undefined;
  const value = getCache<CachedConversation>('data', threadKey(owner, id))?.data;
  return value && Array.isArray(value.messages) ? value : undefined;
}

/** Explicitly whitelisted data, bounded by both this window and the shared cache's byte limit. */
export function saveConversation(
  id: number,
  patch: Partial<CachedConversation>,
  owner = ownerId()
) {
  if (!owner || ownerId() !== owner || !Number.isSafeInteger(id) || id <= 0 || id === owner) return;
  const previous = readConversation(id);
  const merged = mergeMessages(previous?.messages || [], patch.messages || []).filter(
    message =>
      isMessage(message) &&
      ((message.from_id === owner && message.to_id === id) ||
        (message.to_id === owner && message.from_id === id))
  );
  const messages = merged.slice(-MAX_MESSAGES).map(message => ({
    id: message.id,
    from_id: message.from_id,
    to_id: message.to_id,
    nickname: message.nickname,
    text: message.deleted ? '' : message.text,
    date: message.date,
    read: !!message.read,
    deleted: !!message.deleted,
    edited: !!message.edited,
  }));
  putCache('data', threadKey(owner, id), {
    messages,
    loaded: patch.loaded ?? previous?.loaded ?? false,
    more: merged.length > MAX_MESSAGES || (patch.more ?? previous?.more ?? false),
    draft: (patch.draft ?? previous?.draft ?? '').slice(0, 10000),
    position: patch.position ?? previous?.position,
  } satisfies CachedConversation);
}

export function cacheChatMessage(owner: number, message: Message) {
  const other =
    message.from_id === owner ? message.to_id : message.to_id === owner ? message.from_id : 0;
  if (other > 0) saveConversation(other, { messages: [message] }, owner);
}

export function cacheChatRead(id: number, from: number) {
  const cached = readConversation(id);
  if (cached)
    saveConversation(id, {
      messages: cached.messages.map(message =>
        message.from_id === from ? { ...message, read: true } : message
      ),
    });
}

export function forgetConversation(id: number, owner = ownerId()) {
  if (owner) deleteCache('data', threadKey(owner, id));
}

export function readDialogCache() {
  const owner = ownerId();
  if (!owner) return undefined;
  const value = getCache<{ dialogs: Dialog[]; messageCount: number }>(
    'data',
    `${prefix(owner)}dialogs`
  )?.data;
  return value && Array.isArray(value.dialogs) ? value : undefined;
}

export function saveDialogCache(owner: number, dialogs: Dialog[], messageCount: number) {
  if (ownerId() !== owner) return;
  putCache('data', `${prefix(owner)}dialogs`, {
    messageCount,
    dialogs: dialogs.slice(0, 200).map(dialog => ({
      user_id: dialog.user_id,
      nickname: dialog.nickname,
      avatars: dialog.avatars,
      last_message: dialog.last_message,
      date: dialog.date,
      last_online: dialog.last_online,
      unread_count: dialog.unread_count,
    })),
  });
}
