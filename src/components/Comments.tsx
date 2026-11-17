import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { TReplyTarget } from '~/lib/comments';
import { getComments, peekComments, readCommentDraft, type YummyComment } from '~/lib/comments';
import { useResource, useSession } from '~/lib/hooks';

import { CommentComposer } from './CommentComposer';
import { CommentThread } from './CommentThread';
import { AutoLoad } from './AutoLoad';
import { Button, FormError, Icon, Select } from '~/ui';
import './Comments.css';

export type TCommentsProps = { animeId: number; returnTo?: string };

export const Comments: FC<TCommentsProps> = ({ animeId, returnTo }) => {
  const session = useSession();

  return (
    <CommentsContent
      key={`${animeId}:${session?.token || 'guest'}`}
      animeId={animeId}
      returnTo={returnTo}
    />
  );
};

type TCommentsContentProps = { animeId: number; returnTo?: string };

const CommentsContent: FC<TCommentsContentProps> = ({ animeId, returnTo }) => {
  const session = useSession();
  const [sort, setSort] = useState('new');
  const [draft] = useState(() => readCommentDraft(session?.user.id, animeId));
  const [reply, setReply] = useState<TReplyTarget | undefined>(draft.reply);
  const [sending, setSending] = useState(false);
  const [posted, setPosted] = useState<YummyComment[]>([]);
  const [threadPosts, setThreadPosts] = useState<Record<number, YummyComment[]>>({});
  const [extra, setExtra] = useState<YummyComment[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [moreEnd, setMoreEnd] = useState(false);
  const generation = useRef(0);
  const pendingPage = useRef<number>();
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const resource = useResource(
    signal => getComments(animeId, sort, 0, signal),
    [animeId, sort, session?.token, session?.verified],
    () => peekComments(animeId, sort, 0)
  );
  const comments = useMemo(() => {
    const saved = [...(resource.value?.data.comments || []), ...extra];
    const additions = posted.filter(comment => !saved.some(value => value.id === comment.id));
    const seen = new Set<number>();
    return (sort === 'new' ? [...additions, ...saved] : [...saved, ...additions]).filter(
      comment => {
        if (seen.has(comment.id)) return false;
        seen.add(comment.id);
        return true;
      }
    );
  }, [resource.value?.data.comments, extra, posted, sort]);
  const loginHref = `#/account?next=${encodeURIComponent(returnTo || `/anime/${animeId}?view=comments`)}`;

  const respond = useCallback(
    (comment: YummyComment, root: number) => {
      if (sending) return;
      if (!session?.verified) {
        location.hash = loginHref.slice(1);

        return;
      }
      setReply({ parent: root, id: comment.id, name: comment.name });
    },
    [session, loginHref, sending]
  );

  const changeSort = useCallback((event: JSX.TargetedEvent<HTMLSelectElement>) => {
    generation.current++;
    setSort(event.currentTarget.value);
    setExtra([]);
    setMoreEnd(false);
    setLoadingMore(false);
    setMoreError('');
  }, []);

  const loadMore = useCallback(async () => {
    const version = generation.current;
    if (pendingPage.current === version || moreEnd) return;
    pendingPage.current = version;
    setLoadingMore(true);
    setMoreError('');

    try {
      const result = await getComments(animeId, sort, comments.length);

      if (generation.current !== version) return;
      const additions = result.data.comments.filter(
        comment => !comments.some(existing => existing.id === comment.id)
      );
      setExtra(previous => [...previous, ...additions]);
      setMoreEnd(result.data.comments.length < 20 || !additions.length);
    } catch (error) {
      if (generation.current === version) setMoreError((error as Error).message);
    } finally {
      if (pendingPage.current === version) pendingPage.current = undefined;
      if (generation.current === version) setLoadingMore(false);
    }
  }, [animeId, sort, comments, moreEnd]);

  const completeComment = useCallback(
    (comment: YummyComment, target?: TReplyTarget) => {
      setReply(undefined);
      if (target) {
        setThreadPosts(previous => ({
          ...previous,
          [target.parent]: [...(previous[target.parent] || []), comment],
        }));
        return;
      }
      setPosted(previous => [comment, ...previous]);
      generation.current++;
      setExtra([]);
      setMoreEnd(false);
      setLoadingMore(false);
      setMoreError('');
      setSort('new');
      resource.retry();
    },
    [resource.retry]
  );

  return (
    <section class="comments-section">
      <div class="discussion-content">
        <div class="discussion-header">
          <div>
            <h2>Обсуждение</h2>
            <p>Без спойлеров — до твоего нажатия</p>
          </div>
          <Select aria-label="Сортировка комментариев" value={sort} onChange={changeSort}>
            <option value="new">Новые</option>
            <option value="nice">Лучшие</option>
            <option value="old">Старые</option>
          </Select>
        </div>
        {resource.loading ? (
          <div class="comment-loading" role="status" aria-label="Загрузка комментариев">
            {[1, 2, 3].map(value => (
              <div key={value} class="comment-skeleton">
                <div class="skeleton" />
                <div>
                  <div class="skeleton line" />
                  <div class="skeleton line" />
                  <div class="skeleton line short" />
                </div>
              </div>
            ))}
          </div>
        ) : resource.error ? (
          <FormError class="account-error" as="div">
            {resource.error}
            <Button onClick={resource.retry} variant="text">
              Повторить
            </Button>
          </FormError>
        ) : (
          <>
            {comments.map(comment => (
              <CommentThread
                key={comment.id}
                parent={comment}
                reply={respond}
                posted={threadPosts[comment.id]}
                replyDisabled={sending}
              />
            ))}
            {!comments.length && (
              <div class="discussion-empty">
                <Icon name="comment" size={35} />
                <h3>Пока тихо</h3>
                <p>Начни обсуждение этого аниме.</p>
              </div>
            )}
            <AutoLoad
              enabled={!moreEnd && (resource.value?.data.comments.length || 0) >= 20}
              loading={loadingMore}
              error={moreError}
              load={loadMore}
            >
              <p class="account-loading" role="status">
                Загружаем комментарии…
              </p>
            </AutoLoad>
          </>
        )}
      </div>
      <div class="discussion-compose-bar">
        {session?.verified ? (
          <CommentComposer
            animeId={animeId}
            initialText={draft.text}
            reply={reply}
            cancelReply={() => setReply(undefined)}
            completed={completeComment}
            onSendingChange={setSending}
          />
        ) : (
          <a href={loginHref}>
            <Icon name="comment" size={20} />
            <span>Войти, чтобы комментировать</span>
            <Icon name="arrow" size={18} />
          </a>
        )}
      </div>
    </section>
  );
};
