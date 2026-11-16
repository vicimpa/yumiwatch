import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';

import type { TReplyTarget } from '~/lib/comments';
import { postComment } from '~/lib/comments';
import { useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import { getSession } from '~/lib/session';

import { Button, Field, Form, FormActions, FormError, Icon, Sheet, Textarea } from '~/ui';

type TCommentComposerProps = {
  animeId: number;
  requestedReply?: TReplyTarget;
  close: () => void;
  completed: () => void;
};

export const CommentComposer: FC<TCommentComposerProps> = ({
  animeId,
  requestedReply,
  close,
  completed,
}) => {
  const session = useSession()!;
  const key = `yumiwatch:draft:${session.user.id}:${animeId}`;
  const stored = useRef<{ text?: string; reply?: TReplyTarget }>({});
  const loaded = useRef(false);

  if (!loaded.current) {
    loaded.current = true;
    try {
      stored.current = JSON.parse(sessionStorage.getItem(key) || '{}');
    } catch {
      stored.current = {};
    }
  }

  const [reply, setReply] = useState(requestedReply || stored.current.reply);
  const [text, setText] = useState(
    !requestedReply || requestedReply.id === stored.current.reply?.id
      ? stored.current.text || ''
      : ''
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sent = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const formId = useId();

  useLayoutEffect(() => {
    textarea.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${textarea.current.scrollHeight}px`;
    }
  }, [text]);

  useEffect(() => {
    const save = () => {
      if (sent.current || getSession()?.token !== session.token) return;
      try {
        text
          ? sessionStorage.setItem(key, JSON.stringify({ text, reply }))
          : sessionStorage.removeItem(key);
      } catch {
        /* Draft saving is optional. */
      }
    };

    const timer = setTimeout(save, 300);

    return () => {
      clearTimeout(timer);
      save();
    };
  }, [text, reply, key]);

  const submit = useCallback(
    async (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (sending) return;
      setSending(true);
      setError('');
      try {
        await postComment(animeId, text, reply);
        if (getSession()?.token !== session.token) return;
        sent.current = true;
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* Publishing succeeded even if storage is unavailable. */
        }
        completed();
        notify('Комментарий опубликован');
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setSending(false);
      }
    },
    [sending, animeId, text, reply, session.token, key, completed]
  );

  const changeText = useCallback(
    (event: JSX.TargetedInputEvent<HTMLTextAreaElement>) => setText(event.currentTarget.value),
    []
  );

  const submitOnShortcut = useCallback((event: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') form.current?.requestSubmit();
  }, []);

  const addSpoiler = useCallback(() => {
    const start = textarea.current?.selectionStart ?? text.length;
    const end = textarea.current?.selectionEnd ?? text.length;

    setText(
      value =>
        `${value.slice(0, start)}[спойлер]${value.slice(start, end)}[/спойлер]${value.slice(end)}`
    );
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + 9, start + 9 + end - start);
    });
  }, [text.length]);

  const cancelReply = useCallback(() => setReply(undefined), []);

  return (
    <Sheet
      title={reply ? `Ответ для ${reply.name}` : 'Новый комментарий'}
      subtitle={`От имени ${session.user.nickname}`}
      close={close}
      className="composer-screen"
      footer={
        <>
          <FormActions class="composer-footer-meta">
            <Button type="button" onClick={addSpoiler} variant="text">
              + Спойлер
            </Button>
            <span>{text.length}/10000</span>
          </FormActions>
          {error && <FormError class="sheet-validation">{error}</FormError>}
          <Button form={formId} type="submit" disabled={sending || !text.trim()} variant="primary">
            {sending ? 'Отправляем…' : 'Опубликовать'}
          </Button>
        </>
      }
    >
      <Form ref={form} id={formId} class="comment-composer-form" onSubmit={submit}>
        {reply && (
          <div class="comment-reply-to">
            Ответ для {reply.name}
            <button type="button" aria-label="Отменить ответ" onClick={cancelReply}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <Field htmlFor="comment-draft" label="Твой комментарий">
          <Textarea
            ref={textarea}
            id="comment-draft"
            placeholder="Поделись впечатлениями. Сюжетные детали спрячь под спойлер."
            maxLength={10000}
            required
            value={text}
            disabled={sending}
            onInput={changeText}
            onKeyDown={submitOnShortcut}
          />
        </Field>
        <p class="draft-note">
          {stored.current.text
            ? 'Черновик восстановлен'
            : 'Черновик сохранится, если закрыть этот экран'}
        </p>
      </Form>
    </Sheet>
  );
};
