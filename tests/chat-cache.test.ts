// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import {
  cacheChatMessage,
  cacheChatRead,
  readConversation,
  readDialogCache,
  saveConversation,
  saveDialogCache,
} from '~/lib/chat-cache';
import { resetMemoryCache } from '~/lib/cache-store';
import { clearSession, saveSession } from '~/lib/session';

const signIn = (id = 42) =>
  saveSession({
    token: `token-${id}`,
    user: { id, nickname: 'Viewer' },
    verified: true,
    remember: false,
    refreshedAt: Date.now(),
  });
const message = (id = 1) => ({
  id,
  from_id: 8,
  to_id: 42,
  nickname: 'Друг',
  text: 'Привет',
  date: id,
  read: false,
});
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  signIn();
});
afterEach(() => clearSession());

describe('chat cache', () => {
  it('restores history, drafts, reading position and the inbox after memory is recreated', () => {
    saveConversation(8, {
      messages: [message()],
      loaded: true,
      more: true,
      draft: 'Ответ',
      position: { top: 100, atBottom: false, anchor: 1, offset: -12 },
    });
    saveDialogCache(
      42,
      [{ user_id: 8, nickname: 'Друг', unread_count: 2, last_message: 'Привет' }],
      2
    );
    resetMemoryCache();
    expect(readConversation(8)).toMatchObject({
      messages: [message()],
      loaded: true,
      draft: 'Ответ',
      position: { top: 100, anchor: 1 },
    });
    expect(readDialogCache()?.messageCount).toBe(2);
    expect(localStorage.getItem('yumiwatch:api:private:v1')).not.toContain('token-42');
  });
  it('does not expose one account’s messages to another account or a guest', () => {
    saveConversation(8, { messages: [message()], loaded: true });
    signIn(7);
    expect(readConversation(8)).toBeUndefined();
    saveConversation(8, { draft: 'wrong owner' }, 42);
    clearSession();
    expect(readConversation(8)).toBeUndefined();
    signIn();
    expect(readConversation(8)?.draft).toBe('');
  });
  it('updates unopened cached threads from socket edits, deletion and read receipts', () => {
    cacheChatMessage(42, message());
    cacheChatMessage(42, { ...message(), text: 'Изменено', edited: true });
    expect(readConversation(8)?.messages[0].text).toBe('Изменено');
    cacheChatRead(8, 8);
    expect(readConversation(8)?.messages[0].read).toBe(true);
    cacheChatMessage(42, { ...message(), text: 'Old private text', deleted: true });
    expect(readConversation(8)?.messages[0]).toMatchObject({ deleted: true, text: '' });
    expect(localStorage.getItem('yumiwatch:api:private:v1')).not.toContain('Old private text');
  });
  it('bounds retained messages, keeps pagination available and rejects public or unrelated messages', () => {
    saveConversation(8, {
      loaded: true,
      more: false,
      messages: Array.from({ length: 400 }, (_, i) => message(i + 1)),
    });
    expect(readConversation(8)?.messages).toHaveLength(300);
    expect(readConversation(8)?.more).toBe(true);
    cacheChatMessage(42, { ...message(401), to_id: 0 });
    cacheChatMessage(42, { ...message(402), to_id: 99 });
    expect(readConversation(8)?.messages.at(-1)?.id).toBe(400);
  });
});
