import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import { getCommentReplies, peekCommentReplies, type YummyComment } from '~/lib/comments';
import { useResource } from '~/lib/hooks';
import { CommentItem } from './CommentItem';
import { Button, FormError } from '~/ui';

const NO_POSTS: YummyComment[] = [];
type Props = {
  parent: YummyComment;
  rootId?: number;
  reply: (comment: YummyComment, root: number) => void;
  posted?: YummyComment[];
  ancestors?: number[];
  replyDisabled?: boolean;
};

export const CommentThread: FC<Props> = ({
  parent,
  rootId = parent.id,
  reply,
  posted = NO_POSTS,
  ancestors = [],
  replyDisabled,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const id = useId();
  useEffect(() => {
    if (posted.length) setExpanded(true);
  }, [posted]);
  const count = Math.max(parent.children_count, posted.length, loadedCount);
  return (
    <div class="comment-tree-node">
      <CommentItem
        comment={{ ...parent, children_count: count }}
        reply={reply}
        rootId={rootId}
        openThread={() => setExpanded(value => !value)}
        expanded={expanded}
        repliesId={id}
        replyDisabled={replyDisabled}
      />
      {expanded && (
        <div
          class="comment-tree-replies"
          id={id}
          role="group"
          aria-label={`Ответы для ${parent.name}`}
        >
          <CommentReplies
            parentId={parent.id}
            rootId={rootId}
            reply={reply}
            posted={posted}
            ancestors={[...ancestors, parent.id]}
            onCount={setLoadedCount}
            replyDisabled={replyDisabled}
          />
        </div>
      )}
    </div>
  );
};

const CommentReplies: FC<{
  parentId: number;
  rootId: number;
  reply: Props['reply'];
  posted: YummyComment[];
  ancestors: number[];
  onCount: (count: number) => void;
  replyDisabled?: boolean;
}> = ({ parentId, rootId, reply, posted, ancestors, onCount, replyDisabled }) => {
  const resource = useResource(
    signal => getCommentReplies(parentId, signal),
    [parentId, posted.length],
    () => peekCommentReplies(parentId)
  );
  const values = useMemo(() => {
    const seen = new Set(ancestors);
    const saved = Array.isArray(resource.value?.data.comments) ? resource.value.data.comments : [];
    return [...saved, ...posted].filter(comment => {
      if (seen.has(comment.id)) return false;
      seen.add(comment.id);
      return true;
    });
  }, [resource.value?.data.comments, posted, ancestors.join(',')]);
  useEffect(() => {
    onCount(values.length);
  }, [values.length]);
  return (
    <>
      {resource.loading && (
        <p class="account-loading" role="status">
          Загружаем ответы…
        </p>
      )}
      {resource.error && (
        <FormError class="account-error" as="div">
          {resource.error}
          <Button variant="text" onClick={resource.retry}>
            Повторить загрузку ответов
          </Button>
        </FormError>
      )}
      {values.map(comment => (
        <CommentThread
          key={comment.id}
          parent={comment}
          rootId={rootId}
          reply={reply}
          ancestors={ancestors}
          replyDisabled={replyDisabled}
        />
      ))}
      {!resource.loading && !resource.error && !values.length && (
        <p class="collection-note">Ответов пока нет.</p>
      )}
    </>
  );
};
