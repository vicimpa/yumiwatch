import type { FunctionalComponent as FC } from 'preact';
import { useCallback } from 'preact/hooks';

import { cachedRequest, peekRequest } from '~/lib/api';
import { type CommentPage, type YummyComment } from '~/lib/comments';
import { useResource, useSession } from '~/lib/hooks';

import { CommentItem } from './CommentItem';
import { Button, FormError, Icon, Sheet } from '~/ui';

type TCommentThreadProps = {
  parent: YummyComment;
  close: () => void;
  reply: (comment: YummyComment, root: number) => void;
  revision: number;
};

export const CommentThread: FC<TCommentThreadProps> = ({ parent, close, reply, revision }) => {
  const session = useSession();
  const resource = useResource(
    async signal => {
      const result = await cachedRequest<CommentPage>(
        `/comments/${parent.id}/children`,
        {},
        signal,
        { token: session?.verified ? session.token : undefined }
      );

      if (!Array.isArray(result.data?.comments)) throw new Error('Не удалось прочитать ответы.');

      return result;
    },
    [parent.id, revision, session?.token],
    () =>
      peekRequest<CommentPage>(
        `/comments/${parent.id}/children`,
        {},
        { token: session?.verified ? session.token : undefined }
      )
  );

  const respond = useCallback(() => reply(parent, parent.id), [reply, parent]);

  return (
    <Sheet
      title="Ответы"
      subtitle={`Обсуждение с ${parent.name}`}
      close={close}
      className="thread-screen"
      footer={
        <Button onClick={respond} variant="primary">
          <Icon name="comment" size={17} />
          Ответить в ветке
        </Button>
      }
    >
      <div class="thread-parent">
        <CommentItem comment={parent} reply={reply} />
      </div>
      <div class="thread-replies">
        {resource.loading ? (
          <p class="account-loading" role="status">
            Загружаем ответы…
          </p>
        ) : resource.error ? (
          <FormError class="account-error" as="div">
            {resource.error}
            <Button onClick={resource.retry} variant="text">
              Повторить
            </Button>
          </FormError>
        ) : (
          resource.value?.data.comments.map(comment => (
            <CommentItem
              key={`${comment.id}:${revision}`}
              comment={comment}
              reply={reply}
              rootId={parent.id}
            />
          ))
        )}
      </div>
    </Sheet>
  );
};
