import { AppLink } from '~/ui/AppLink';
import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '~/lib/api';
import {
  mergeMessages,
  readConversation,
  saveConversation,
  forgetConversation,
  readDialogCache,
  type ChatPosition,
} from '~/lib/chat-cache';
import { useSession } from '~/lib/hooks';
import { fetchProfile } from '~/lib/profile';
import {
  markDialogRead,
  mergeDialogs,
  realtime,
  receiveMessage,
  refreshSocial,
  social,
} from '~/lib/social';
import {
  fetchDialogs,
  fetchMessages,
  isMessage,
  sendMessage,
  socialText,
  type Message,
} from '~/lib/social-api';
import { getSession } from '~/lib/session';
import { Avatar, Button, ButtonLink, Empty, FormError, Icon, Input } from '~/ui';
import { RealtimeIndicator, SocialSignIn, UnreadBadge } from './Social';
import { ChatComposer } from '~/ui/ChatComposer';

const ChatLoading: FC<{ text?: string }> = ({ text = 'Загружаем сообщения…' }) => (
  <div class="chat-loading" role="status">
    {text}
  </div>
);

const Conversation: FC<{ id: number }> = ({ id }) => {
  const session = useSession()!;
  const owner = session.user.id;
  const [cached] = useState(() => readConversation(id));
  const dialog = social.value.dialogs.find(d => d.user_id === id);
  const [nickname, setNickname] = useState(dialog?.nickname || 'Собеседник');
  const [messages, setMessages] = useState<Message[]>(cached?.messages || []);
  const [text, setText] = useState(cached?.draft || '');
  const [loading, setLoading] = useState(!cached || (!cached.loaded && !cached.messages.length));
  const ready = useRef(!loading);
  ready.current = !loading;
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState(false);
  const [more, setMore] = useState(cached?.more || false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const loaded = useRef(!!cached?.loaded);
  const pendingPosition = useRef<ChatPosition | undefined>(
    cached?.position || { top: 0, atBottom: true }
  );
  const position = useRef<ChatPosition>(cached?.position || { top: 0, atBottom: true });
  const positionTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ messages, text, more });
  latest.current = { messages, text, more };
  const capturePosition = (): ChatPosition => {
    const list = scroll.current;
    if (!list) return position.current;
    const top = list.getBoundingClientRect().top;
    const anchor = [...list.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      node => node.getBoundingClientRect().bottom > top
    );
    return {
      top: list.scrollTop,
      atBottom: list.scrollHeight - list.scrollTop - list.clientHeight < 40,
      anchor: anchor ? Number(anchor.dataset.messageId) : undefined,
      offset: anchor ? anchor.getBoundingClientRect().top - top : undefined,
    };
  };
  const [newMessages, setNewMessages] = useState(false);
  const scrollToEnd = () => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    position.current = capturePosition();
    setNewMessages(false);
  };
  const token = session.token;

  // Position cached/first-loaded messages before paint, not with a visible timeout scroll.
  useLayoutEffect(() => {
    const list = scroll.current;
    if (loading || !list) return;
    const desired = pendingPosition.current;
    if (desired) {
      if (desired.atBottom) list.scrollTop = list.scrollHeight;
      else {
        const anchor = desired.anchor
          ? list.querySelector<HTMLElement>(`[data-message-id="${desired.anchor}"]`)
          : null;
        if (anchor && desired.offset !== undefined)
          list.scrollTop +=
            anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - desired.offset;
        else list.scrollTop = desired.top;
      }
      pendingPosition.current = undefined;
    }
    position.current = capturePosition();
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) saveConversation(id, { messages, more, loaded: loaded.current }, owner);
  }, [messages, more, loading, id, owner]);
  useEffect(() => {
    const timer = setTimeout(() => saveConversation(id, { draft: text }, owner), 250);
    return () => clearTimeout(timer);
  }, [text, id, owner]);
  useLayoutEffect(
    () => () => {
      clearTimeout(positionTimer.current);
      saveConversation(
        id,
        {
          messages: latest.current.messages,
          draft: latest.current.text,
          more: latest.current.more,
          loaded: loaded.current,
          position: position.current,
        },
        owner
      );
    },
    [id, owner]
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const changes = new Map<number, Message>();
    let fetching = true;
    const current = () => !controller.signal.aborted && getSession()?.token === token;
    const read = (values = latest.current.messages) => {
      const list = scroll.current;
      const unreadIds = new Set(
        values
          .filter(message => message.from_id === id && !message.read && !message.deleted)
          .map(message => message.id)
      );
      if (
        !unreadIds.size &&
        !social.value.dialogs.find(dialog => dialog.user_id === id)?.unread_count
      )
        return;
      if (
        current() &&
        document.visibilityState === 'visible' &&
        (!list || list.scrollHeight - list.scrollTop - list.clientHeight < 160)
      )
        void markDialogRead(id)
          .then(() => {
            if (current())
              setMessages(previous =>
                previous.map(message =>
                  unreadIds.has(message.id) ? { ...message, read: true } : message
                )
              );
          })
          .catch(error => {
            if (current()) setError(error.message);
          });
    };
    const readCurrent = () => read();
    void fetchMessages(id, 0, controller.signal)
      .then(values => {
        if (!current()) return;
        if (ready.current) pendingPosition.current = capturePosition();
        loaded.current = true;
        setMessages(previous => mergeMessages(previous, values, [...changes.values()]));
        setLoading(false);
        setError('');
        setMore(values.length === 50);
        read(values);
      })
      .catch(error => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status))
          forgetConversation(id, owner);
        if (current()) {
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            setMessages([]);
            loaded.current = false;
            setMore(false);
          }
          setError(error.message);
          setLoading(false);
        }
      })
      .finally(() => {
        fetching = false;
      });
    const poll = setInterval(() => {
      if (
        current() &&
        !fetching &&
        realtime.status !== 'connected' &&
        document.visibilityState === 'visible' &&
        navigator.onLine !== false
      ) {
        fetching = true;
        setRevision(value => value + 1);
      }
    }, 15000);
    if (!dialog)
      void fetchProfile(id, controller.signal)
        .then(profile => {
          if (current()) setNickname(profile.nickname);
        })
        .catch(() => {});
    const unsubscribe = realtime.onEvent(event => {
      if (!current()) return;
      const value = event.message;
      if (
        ['new-message', 'message-edited', 'message-deleted'].includes(event.event) &&
        isMessage(value) &&
        ((value.from_id === id && value.to_id === session.user.id) ||
          (value.from_id === session.user.id && value.to_id === id))
      ) {
        const updated = { ...value, deleted: event.event === 'message-deleted' || value.deleted };
        setLoading(false);
        changes.set(value.id, updated);
        pendingPosition.current = capturePosition();
        setMessages(previous => mergeMessages(previous, [updated]));
        if (event.event === 'new-message') {
          read([updated]);
          // Do not move someone reading older messages away from their place.
          const list = scroll.current;
          if (!list || list.scrollHeight - list.scrollTop - list.clientHeight < 160)
            pendingPosition.current = { top: 0, atBottom: true };
          else setNewMessages(true);
        }
      } else if (event.event === 'message-read' && event.user_id === id)
        setMessages(previous =>
          previous.map(m => (m.from_id === session.user.id ? { ...m, read: true } : m))
        );
      else if (event.event === 'connect') setRevision(value => value + 1);
    });
    document.addEventListener('visibilitychange', readCurrent);
    window.addEventListener('focus', readCurrent);
    return () => {
      controller.abort();
      clearInterval(poll);
      unsubscribe();
      document.removeEventListener('visibilitychange', readCurrent);
      window.removeEventListener('focus', readCurrent);
    };
  }, [id, token, revision]);

  return (
    <section class="conversation" aria-label="Переписка">
      <header class="conversation-heading">
        <ButtonLink href="#/messages" variant="icon" aria-label="К диалогам">
          <Icon name="back" size={18} />
        </ButtonLink>
        <span class="social-avatar">
          <Avatar url={dialog?.avatars?.small} name={dialog?.nickname || nickname} />
        </span>
        <AppLink href={`#/users/id${id}`}>
          <strong>{dialog?.nickname || nickname}</strong>
          <small>
            Профиль YummyAnime <Icon name="chevron" size={12} />
          </small>
        </AppLink>
        <Button
          variant="icon"
          class="conversation-refresh"
          aria-label="Обновить переписку"
          onClick={() => setRevision(value => value + 1)}
          disabled={loading}
        >
          <Icon name="refresh" size={18} />
        </Button>
      </header>
      {error && (
        <FormError class="account-error">
          {error}
          <Button
            variant="text"
            onClick={() => {
              setError('');
              setRevision(value => value + 1);
            }}
          >
            Повторить
          </Button>
        </FormError>
      )}
      <div
        class="conversation-scroll"
        ref={scroll}
        onScroll={() => {
          position.current = capturePosition();
          clearTimeout(positionTimer.current);
          positionTimer.current = setTimeout(
            () => saveConversation(id, { position: position.current }, owner),
            250
          );
          const list = scroll.current;
          if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 40)
            setNewMessages(false);
        }}
      >
        {loading ? (
          <ChatLoading />
        ) : (
          <>
            {more && (
              <Button
                disabled={older}
                onClick={async () => {
                  setOlder(true);
                  try {
                    const page = await fetchMessages(id, messages[0]?.id);
                    if (!alive.current) return;
                    pendingPosition.current = capturePosition();
                    setMore(
                      page.length === 50 && page.some(m => !messages.some(old => old.id === m.id))
                    );
                    setMessages(previous => mergeMessages(page, previous));
                  } catch (error) {
                    if (alive.current) setError((error as Error).message);
                  } finally {
                    if (alive.current) setOlder(false);
                  }
                }}
              >
                Предыдущие сообщения
              </Button>
            )}
            <div class="message-list" role="log" aria-label="Сообщения" aria-relevant="additions">
              {messages.map(message => (
                <article
                  key={message.id}
                  data-message-id={message.id}
                  class={`message-bubble ${message.from_id === session.user.id ? 'is-own' : ''}`}
                >
                  <p>{message.deleted ? 'Сообщение удалено' : socialText(message.text)}</p>
                  <small class="message-meta">
                    {Number.isFinite(message.date) && (
                      <time>
                        {new Date(message.date * 1000).toLocaleString('ru', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </time>
                    )}
                    {!!message.edited && <span>· изменено</span>}
                    {message.from_id === session.user.id && (
                      <span class="message-delivery">
                        <span
                          class={!message.read ? 'is-current' : ''}
                          aria-hidden={!!message.read}
                        >
                          · отправлено
                        </span>
                        <span class={message.read ? 'is-current' : ''} aria-hidden={!message.read}>
                          · прочитано
                        </span>
                      </span>
                    )}
                  </small>
                </article>
              ))}
              {!messages.length && (
                <p class="collection-note">
                  Начни разговор — сообщение появится и на сайте YummyAnime.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {newMessages && (
        <Button class="new-messages" onClick={scrollToEnd}>
          <Icon name="arrow" size={16} />
          Новые сообщения
        </Button>
      )}
      <ChatComposer
        className="message-composer"
        value={text}
        onValueChange={setText}
        sending={sending}
        label="Текст сообщения"
        placeholder="Написать сообщение…"
        onSubmit={async () => {
          setSending(true);
          setError('');
          try {
            const message = await sendMessage(id, text);
            receiveMessage(message);
            if (!alive.current) return;
            pendingPosition.current = { top: 0, atBottom: true };
            setMessages(previous => mergeMessages(previous, [message]));
            setText('');
          } catch (error) {
            if (alive.current) setError((error as Error).message);
          } finally {
            if (alive.current) setSending(false);
          }
        }}
      />
    </section>
  );
};

export const MessagesPage: FC<{ query: string }> = ({ query }) => {
  const session = useSession();
  return !session ? (
    <SocialSignIn next={`/messages${query ? `?${query}` : ''}`} />
  ) : !session.verified ? (
    <div class="messages-page">
      <ChatLoading text="Подключаем диалоги…" />
    </div>
  ) : (
    <Messages key={`${session.user.id}:${session.token}`} query={query} />
  );
};

const Messages: FC<{ query: string }> = ({ query }) => {
  const session = useSession()!;
  const parsed = Number(new URLSearchParams(query).get('user'));
  const selected =
    Number.isSafeInteger(parsed) && parsed > 0 && parsed !== session.user.id ? parsed : undefined;
  const state = social.value;
  const [cachedDialogs] = useState(() => readDialogCache()?.dialogs || []);
  const dialogs = state.userId === session.user.id ? state.dialogs : cachedDialogs;
  const [offset, setOffset] = useState(20);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (selected && !dialogs.some(d => d.user_id === selected))
      void fetchDialogs(0, controller.signal, selected)
        .then(page => {
          if (!controller.signal.aborted)
            social.value = { ...social.value, dialogs: mergeDialogs(social.value.dialogs, page) };
        })
        .catch(error => {
          if (!controller.signal.aborted) setError(error.message);
        });
    else void refreshSocial();
    return () => controller.abort();
  }, [selected]);
  return (
    <div class="social-page messages-page">
      {error && <FormError class="account-error">{error}</FormError>}
      <div class={`messages-layout ${selected ? 'has-conversation' : ''}`}>
        <aside class="dialog-list" aria-label="Диалоги">
          <header class="dialogs-heading">
            <h1>Сообщения</h1>
            <ButtonLink
              href="#/profile?tab=friends"
              variant="icon"
              aria-label="Написать другу"
              title="Написать другу"
            >
              <Icon name="edit" size={20} />
            </ButtonLink>
            <RealtimeIndicator compact />
          </header>
          <div class="dialog-search">
            <Icon name="search" size={17} />
            <Input
              type="search"
              placeholder="Найти диалог"
              aria-label="Найти диалог"
              value={search}
              onInput={event => setSearch(event.currentTarget.value)}
            />
          </div>
          <div class="dialog-scroll">
            {state.loading && !dialogs.length ? (
              <ChatLoading text="Загружаем диалоги…" />
            ) : (
              dialogs
                .filter(dialog =>
                  dialog.nickname.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))
                )
                .map(dialog => (
                  <AppLink
                    key={dialog.user_id}
                    href={`#/messages?user=${dialog.user_id}`}
                    class={`dialog-card ${selected === dialog.user_id ? 'active' : ''}`}
                    aria-current={selected === dialog.user_id ? 'page' : undefined}
                  >
                    <span class="social-avatar">
                      <Avatar
                        url={dialog.avatars?.small || dialog.avatars?.big}
                        name={dialog.nickname}
                      />
                    </span>
                    <span>
                      <strong>{dialog.nickname}</strong>
                      <small>{socialText(dialog.last_message)}</small>
                    </span>
                    <UnreadBadge count={dialog.unread_count} />
                  </AppLink>
                ))
            )}
          </div>
          {!state.loading && !dialogs.length && (
            <p class="collection-note">
              Диалогов пока нет. Открой профиль друга, чтобы написать ему.
            </p>
          )}
          {more && dialogs.length >= 20 && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const page = await fetchDialogs(offset);
                  social.value = {
                    ...social.value,
                    dialogs: mergeDialogs(social.value.dialogs, page),
                  };
                  setOffset(offset + 20);
                  setMore(page.length === 20);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Ещё диалоги
            </Button>
          )}
        </aside>
        {selected ? (
          <Conversation key={`${selected}:${session.token}`} id={selected} />
        ) : (
          <Empty icon="comment" title="Продолжим разговор">
            Выбери диалог или напиши другу из его профиля.
          </Empty>
        )}
      </div>
    </div>
  );
};
