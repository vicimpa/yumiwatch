import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { commentDraftKey, postComment, type TReplyTarget, type YummyComment } from '~/lib/comments';
import { useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import { getSession } from '~/lib/session';
import { Button, Icon } from '~/ui';
import { ChatComposer } from '~/ui/ChatComposer';

type TCommentComposerProps = {
  animeId: number;
  reply?: TReplyTarget;
  initialText: string;
  cancelReply: () => void;
  completed: (comment: YummyComment, reply?: TReplyTarget) => void;
  onSendingChange: (sending: boolean) => void;
};

export const CommentComposer: FC<TCommentComposerProps> = ({
  animeId,
  reply,
  initialText,
  cancelReply,
  completed,
  onSendingChange,
}) => {
  const session = useSession()!;
  const key = commentDraftKey(session.user.id, animeId);
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  const latest = useRef({ text, reply });
  latest.current = { text, reply };
  const saveDraft = () => {
    if (getSession()?.token !== session.token) return;
    try {
      const draft = latest.current;
      draft.text || draft.reply
        ? sessionStorage.setItem(key, JSON.stringify(draft))
        : sessionStorage.removeItem(key);
    } catch {
      /* Draft saving is optional. */
    }
  };
  useEffect(() => {
    const timer = setTimeout(saveDraft, 300);
    return () => clearTimeout(timer);
  }, [text, reply, key]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      saveDraft();
    };
  }, []);
  useLayoutEffect(() => {
    if (reply) textarea.current?.focus({ preventScroll: true });
    setError('');
  }, [reply]);

  const submit = async () => {
    setSending(true);
    onSendingChange(true);
    setError('');
    try {
      const comment = await postComment(animeId, text, reply);
      if (!alive.current || getSession()?.token !== session.token) return;
      latest.current = { text: '', reply: undefined };
      setText('');
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Publishing succeeded. */
      }
      completed(comment, reply);
      notify('Комментарий опубликован');
    } catch (error) {
      if (alive.current && getSession()?.token === session.token)
        setError((error as Error).message);
    } finally {
      if (alive.current) {
        setSending(false);
        onSendingChange(false);
      }
    }
  };
  const addSpoiler = () => {
    const start = textarea.current?.selectionStart ?? text.length;
    const end = textarea.current?.selectionEnd ?? text.length;
    if (text.length + 19 > 10000) return;
    setText(
      value =>
        `${value.slice(0, start)}[спойлер]${value.slice(start, end)}[/спойлер]${value.slice(end)}`
    );
    requestAnimationFrame(() => {
      textarea.current?.focus({ preventScroll: true });
      textarea.current?.setSelectionRange(start + 9, start + 9 + end - start);
    });
  };
  return (
    <ChatComposer
      className="comment-composer"
      value={text}
      onValueChange={setText}
      onSubmit={submit}
      sending={sending}
      label="Твой комментарий"
      placeholder={reply ? `Ответ для ${reply.name}…` : 'Написать комментарий…'}
      textareaRef={textarea}
      error={error}
      context={
        reply && (
          <>
            <span>
              Ответ для <strong>{reply.name}</strong>
            </span>
            <Button
              type="button"
              variant="icon"
              aria-label="Отменить ответ"
              disabled={sending}
              onClick={cancelReply}
            >
              <Icon name="close" size={16} />
            </Button>
          </>
        )
      }
      tools={
        <>
          <Button
            type="button"
            variant="text"
            disabled={sending || text.length + 19 > 10000}
            onClick={addSpoiler}
          >
            + Спойлер
          </Button>
          <span>{text.length}/10000</span>
        </>
      }
    />
  );
};
