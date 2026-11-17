import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useState } from 'preact/hooks';

import { yummyFetch } from '~/lib/api';
import { type YummyComment } from '~/lib/comments';
import { useSession } from '~/lib/hooks';
import { notify } from '~/lib/notifications';
import { getSession } from '~/lib/session';
import { profileHref } from '~/lib/profile';

import { CommentText } from './CommentText';
import { Avatar, Icon } from '~/ui';

function commentDate(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - time) / 60));

  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч. назад`;

  return new Date(time * 1000).toLocaleDateString('ru', {
    day: 'numeric',
    month: 'short',
    ...(minutes > 525600 ? { year: 'numeric' } : {}),
  });
}

type TCommentItemProps = {
  comment: YummyComment;
  reply: (comment: YummyComment, root: number) => void;
  rootId?: number;
  openThread?: (comment: YummyComment) => void;
  expanded?: boolean;
  repliesId?: string;
  replyDisabled?: boolean;
};

export const CommentItem: FC<TCommentItemProps> = ({
  comment,
  reply,
  rootId,
  openThread,
  expanded,
  repliesId,
  replyDisabled,
}) => {
  const session = useSession();
  const [vote, setVote] = useState(comment.vote || 0);
  const [likes, setLikes] = useState(comment.likes || 0);
  const [dislikes, setDislikes] = useState(comment.dislikes || 0);
  const [voting, setVoting] = useState(false);

  const cast = useCallback(
    async (value: number) => {
      if (!session?.verified) {
        notify('Войди в аккаунт, чтобы оценивать комментарии.');

        return;
      }
      setVoting(true);

      const next = vote === value ? 0 : value;

      try {
        const result = await yummyFetch(`/comments/${comment.id}/vote`, {
          token: session.token,
          method: next ? 'PUT' : 'DELETE',
          ...(next ? { body: { action: next } } : {}),
        });

        if (result === false) throw new Error('Yummy не подтвердил оценку комментария.');
        if (getSession()?.token !== session.token) return;
        setLikes(comment.likes + (next === 1 ? 1 : 0) - (comment.vote === 1 ? 1 : 0));
        setDislikes(comment.dislikes + (next === -1 ? 1 : 0) - (comment.vote === -1 ? 1 : 0));
        setVote(next);
      } catch (error) {
        notify((error as Error).message);
      } finally {
        setVoting(false);
      }
    },
    [session, vote, comment]
  );

  const like = useCallback(() => void cast(1), [cast]);

  const dislike = useCallback(() => void cast(-1), [cast]);

  const respond = useCallback(() => reply(comment, rootId || comment.id), [reply, comment, rootId]);

  const openReplies = useCallback(() => openThread?.(comment), [openThread, comment]);

  return (
    <article class="comment-item" data-comment-id={comment.id}>
      <div class="comment-avatar">
        <Avatar url={comment.avatars?.small} name={comment.name} />
      </div>
      <div class="comment-content">
        <div class="comment-author">
          {comment.user_id > 0 ? (
            <a href={profileHref(comment.user_id)} class="comment-profile-link">
              <strong>{comment.name}</strong>
            </a>
          ) : (
            <strong>{comment.name}</strong>
          )}
          <time dateTime={new Date(comment.time * 1000).toISOString()}>
            {commentDate(comment.time)}
          </time>
        </div>
        {comment.deleted_at ? (
          <p class="muted comment-deleted">Комментарий удалён</p>
        ) : (
          <CommentText text={comment.text} />
        )}
        <div class="comment-actions">
          {!comment.deleted_at && (
            <>
              <div class="comment-votes">
                <button
                  aria-label="Нравится"
                  aria-pressed={vote === 1}
                  disabled={voting}
                  class={vote === 1 ? 'liked' : ''}
                  onClick={like}
                >
                  ↑ <span>{likes}</span>
                </button>
                <button
                  aria-label="Не нравится"
                  aria-pressed={vote === -1}
                  disabled={voting}
                  class={vote === -1 ? 'disliked' : ''}
                  onClick={dislike}
                >
                  ↓ <span>{dislikes}</span>
                </button>
              </div>
              <button onClick={respond} disabled={replyDisabled}>
                Ответить
              </button>
            </>
          )}
          {openThread && comment.children_count > 0 && (
            <button
              class="comment-thread-link"
              onClick={openReplies}
              aria-expanded={expanded}
              aria-controls={repliesId}
            >
              <Icon name="comment" size={16} />
              {expanded ? 'Скрыть ответы' : `Ответы (${comment.children_count})`}
              <Icon name="chevron" size={14} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
