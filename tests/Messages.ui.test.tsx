// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesPage } from '~/components/Messages';
import { saveConversation, saveDialogCache, readConversation } from '~/lib/chat-cache';
import { clearSession, saveSession } from '~/lib/session';
import { realtime, realtimeStatus, social } from '~/lib/social';
import { RealtimeIndicator } from '~/components/Social';
const message = {
  id: 1,
  from_id: 8,
  to_id: 42,
  nickname: 'Друг',
  text: 'Сохранённая переписка',
  date: 1,
  read: true,
};
const reply = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  saveSession({
    token: 'test-chat',
    user: { id: 42, nickname: 'Viewer' },
    remember: false,
    verified: true,
    refreshedAt: Date.now(),
  });
  realtime.stop();
  social.value = {
    userId: 42,
    dialogs: [{ user_id: 8, nickname: 'Друг', unread_count: 0 }],
    notifications: [],
    messageCount: 0,
    notificationCount: 0,
    loading: false,
    error: '',
  };
});
afterEach(() => {
  cleanup();
  clearSession();
  realtime.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('cached conversations', () => {
  it('opens a dialog without a false error after the server confirms it read', async () => {
    const fetcher = vi.fn(async (url: string) =>
      reply(
        url.includes('/messages/read')
          ? { ok: true }
          : url.includes('/messages?')
            ? [{ ...message, read: false }]
            : { dialogs: [] }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MessagesPage query="user=8" />);
    await screen.findByText('Сохранённая переписка');
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url.includes('/messages/read'))).toBe(true)
    );
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Yummy не подтвердил изменение.')).toBeNull();
  });
  it('does not send repeated read requests for already-read messages on open or focus', async () => {
    const fetcher = vi.fn(async (url: string) =>
      reply(
        url.includes('/messages/read')
          ? { ok: false }
          : url.includes('/messages?')
            ? [message]
            : { dialogs: [] }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MessagesPage query="user=8" />);
    await screen.findByText('Сохранённая переписка');
    await act(async () => {
      fireEvent.focus(window);
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/messages/read'))).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('updates incoming read flags after confirmation so focusing again is a no-op', async () => {
    const fetcher = vi.fn(async (url: string) =>
      reply(
        url.includes('/messages/read')
          ? { ok: true }
          : url.includes('/messages?')
            ? [{ ...message, read: false }]
            : { dialogs: [] }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    render(<MessagesPage query="user=8" />);
    await screen.findByText('Сохранённая переписка');
    await waitFor(() => expect(readConversation(8)?.messages[0]?.read).toBe(true));
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/messages/read'))).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not render the numeric unedited flag from a fresh API response beside the date', async () => {
    saveConversation(8, { messages: [{ ...message, edited: false }], loaded: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply([{ ...message, text: 'Свежая переписка', edited: 0 }]))
    );
    const { container } = render(<MessagesPage query="user=8" />);
    const meta = () => container.querySelector('.message-meta')!;
    const strayText = () =>
      [...meta().childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim())
        .filter(Boolean);
    expect(strayText()).toEqual([]);
    await screen.findByText('Свежая переписка');
    expect(strayText()).toEqual([]);
    expect(meta().querySelector('time')).toBeTruthy();
    expect(meta().textContent).not.toContain('изменено');
  });
  it('renders saved messages and drafts synchronously while the request is still pending', () => {
    saveConversation(8, {
      messages: [message],
      loaded: true,
      draft: 'Черновик',
      position: { top: 0, atBottom: false },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    const { container } = render(<MessagesPage query="user=8" />);
    expect(screen.getByText('Сохранённая переписка')).toBeTruthy();
    expect((screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement).value).toBe(
      'Черновик'
    );
    expect(container.querySelector('.skeleton,.anime-grid')).toBeNull();
    expect(screen.queryByText('Загружаем сообщения…')).toBeNull();
  });
  it('keeps cached content visible on network failure and replaces it with a background edit', async () => {
    saveConversation(8, { messages: [message], loaded: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { unmount } = render(<MessagesPage query="user=8" />);
    await screen.findByRole('alert');
    expect(screen.getByText('Сохранённая переписка')).toBeTruthy();
    unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        reply(
          url.includes('/messages?')
            ? [{ ...message, text: 'Обновлённая переписка', edited: true }]
            : { ok: true }
        )
      )
    );
    render(<MessagesPage query="user=8" />);
    await screen.findByText('Обновлённая переписка');
    await waitFor(() =>
      expect(readConversation(8)?.messages[0].text).toBe('Обновлённая переписка')
    );
  });
  it('uses a compact status for a cold load and flushes the draft when leaving immediately', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    const { container, unmount } = render(<MessagesPage query="user=8" />);
    expect(screen.getByText('Загружаем сообщения…')).toBeTruthy();
    expect(container.querySelector('.skeleton,.anime-grid')).toBeNull();
    fireEvent.input(screen.getByLabelText('Текст сообщения'), { target: { value: 'Не потерять' } });
    unmount();
    expect(readConversation(8)?.draft).toBe('Не потерять');
  });
  it('restores the cached inbox before the realtime coordinator has loaded', () => {
    saveDialogCache(42, [{ user_id: 8, nickname: 'Сохранённый друг', unread_count: 0 }], 0);
    social.value = { ...social.value, userId: undefined, dialogs: [], loading: true };
    render(<MessagesPage query="" />);
    expect(screen.getByText('Сохранённый друг')).toBeTruthy();
  });
});

describe('messages while WebSocket is unavailable', () => {
  it('refreshes an open conversation through REST and stops polling after leaving', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(reply([message])))
      .mockImplementationOnce(() => Promise.resolve(reply([message])));
    vi.stubGlobal('fetch', fetcher);
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<MessagesPage query="user=8" />));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Сохранённая переписка')).toBeTruthy();
    fetcher.mockImplementation(() =>
      Promise.resolve(reply([message, { ...message, id: 2, text: 'Новое без сокета' }]))
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Новое без сокета')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('avoids polling while connected or hidden and resumes when fallback is needed', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    realtime.status = 'connected';
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(reply([message])));
    vi.stubGlobal('fetch', fetcher);
    await act(async () => {
      render(<MessagesPage query="user=8" />);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    realtime.status = 'reconnecting';
    visibility.mockReturnValue('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('explains delayed updates while reconnecting instead of implying a permanent initial load', () => {
    realtimeStatus.value = 'reconnecting';
    render(<RealtimeIndicator />);
    expect(screen.getByText('Обновления с небольшой задержкой')).toBeTruthy();
  });
});
