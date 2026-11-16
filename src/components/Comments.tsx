import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useMemo, useRef, useState } from 'preact/hooks';

import type { TReplyTarget } from '~/lib/comments';
import { getComments, peekComments, type YummyComment } from '~/lib/comments';
import { useResource, useSession } from '~/lib/hooks';

import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';
import { CommentThread } from './CommentThread';
import { Button, FormError, Icon, Select } from '~/ui';

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
  const [revision, setRevision] = useState(0);
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState<TReplyTarget>();
  const [thread, setThread] = useState<YummyComment>();
  const [extra, setExtra] = useState<YummyComment[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [moreEnd, setMoreEnd] = useState(false);
  const generation = useRef(0);
  const resource = useResource(
    signal => getComments(animeId, sort, 0, signal),
    [animeId, sort, revision, session?.token, session?.verified],
    () => peekComments(animeId, sort, 0)
  );
  const comments = useMemo(
    () => [...(resource.value?.data.comments || []), ...extra],
    [resource.value?.data.comments, extra]
  );
  const loginHref = `#/account?next=${encodeURIComponent(returnTo || `/anime/${animeId}?view=comments`)}`;

  const respond = useCallback(
    (comment: YummyComment, root: number) => {
      if (!session?.verified) {
        location.hash = loginHref.slice(1);

        return;
      }
      setReply({ parent: root, id: comment.id, name: comment.name });
      setCompose(true);
    },
    [session, loginHref]
  );

  const changeSort = useCallback((event: JSX.TargetedEvent<HTMLSelectElement>) => {
    generation.current++;
    setSort(event.currentTarget.value);
    setExtra([]);
    setMoreEnd(false);
    setLoadingMore(false);
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setMoreError('');

    const version = generation.current;

    try {
      const result = await getComments(animeId, sort, comments.length);

      if (generation.current !== version) return;
      setExtra(previous => [
        ...previous,
        ...result.data.comments.filter(
          comment => !comments.some(existing => existing.id === comment.id)
        ),
      ]);
      setMoreEnd(result.data.comments.length < 20);
    } catch (error) {
      if (generation.current === version) setMoreError((error as Error).message);
    } finally {
      if (generation.current === version) setLoadingMore(false);
    }
  }, [animeId, sort, comments]);

  const openComposer = useCallback(() => {
    setReply(undefined);
    setCompose(true);
  }, []);

  const closeThread = useCallback(() => setThread(undefined), []);

  const closeComposer = useCallback(() => setCompose(false), []);

  const completeComment = useCallback(() => {
    setCompose(false);
    generation.current++;
    setExtra([]);
    setMoreEnd(false);
    setRevision(value => value + 1);
    if (!reply) setSort('new');
  }, [reply]);

  return (
    <section class="comments-section">
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
            <CommentItem
              key={`${comment.id}:${revision}`}
              comment={comment}
              reply={respond}
              openThread={setThread}
            />
          ))}
          {!comments.length && (
            <div class="discussion-empty">
              <Icon name="comment" size={35} />
              <h3>Пока тихо</h3>
              <p>Начни обсуждение этого аниме.</p>
            </div>
          )}
          {!moreEnd && (resource.value?.data.comments.length || 0) >= 20 && (
            <div class="load-more">
              <Button disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Загружаем…' : 'Ещё комментарии'}
              </Button>
              {moreError && <FormError>{moreError}</FormError>}
            </div>
          )}
        </>
      )}
      <div class="discussion-compose-bar">
        {session?.verified ? (
          <button onClick={openComposer}>
            <span class="compose-avatar">{session.user.nickname.slice(0, 1)}</span>
            <span>Написать комментарий…</span>
            <Icon name="comment" size={20} />
          </button>
        ) : (
          <a href={loginHref}>
            <Icon name="comment" size={20} />
            <span>Войти, чтобы комментировать</span>
            <Icon name="arrow" size={18} />
          </a>
        )}
      </div>
      {thread && (
        <CommentThread parent={thread} revision={revision} close={closeThread} reply={respond} />
      )}
      {compose && session?.verified && (
        <CommentComposer
          key={reply?.id || 'new'}
          animeId={animeId}
          requestedReply={reply}
          close={closeComposer}
          completed={completeComment}
        />
      )}
    </section>
  );
};
