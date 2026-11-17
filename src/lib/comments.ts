import { cachedRequest, peekRequest, yummyFetch } from './api';
import { getSession } from './session';

export interface YummyComment {
  id: number;
  name: string;
  avatars?: { small?: string };
  children_count: number;
  deleted_at: number;
  time: number;
  user_id: number;
  vote: number;
  text: string;
  dislikes: number;
  likes: number;
  parent_id: number;
}

export interface CommentPage {
  comments: YummyComment[];
  isMod?: boolean;
}

export async function getComments(
  animeId: number,
  sort: string,
  skip: number,
  signal?: AbortSignal
) {
  const session = getSession();
  const result = await cachedRequest<CommentPage>(
    `/comments/anime/${animeId}`,
    { sort, skip, limit: 20 },
    signal,
    { token: session?.verified ? session.token : undefined }
  );

  if (!Array.isArray(result.data?.comments))
    throw new Error('Не удалось прочитать комментарии Yummy.');

  return result;
}

export function peekComments(animeId: number, sort: string, skip: number) {
  const session = getSession();

  return peekRequest<CommentPage>(
    `/comments/anime/${animeId}`,
    { sort, skip, limit: 20 },
    { token: session?.verified ? session.token : undefined }
  );
}

export async function getCommentReplies(id: number, signal?: AbortSignal) {
  const result = await cachedRequest<CommentPage>(
    `/comments/${id}/children`,
    {},
    signal,
    commentOptions()
  );
  if (!Array.isArray(result.data?.comments)) throw new Error('Не удалось прочитать ответы.');
  return result;
}

const commentOptions = () => {
  const session = getSession();
  return { token: session?.verified ? session.token : undefined };
};

export const peekCommentReplies = (id: number) =>
  peekRequest<CommentPage>(`/comments/${id}/children`, {}, commentOptions());

export const commentDraftKey = (userId: number, animeId: number) =>
  `yumiwatch:draft:${userId}:${animeId}`;

export function readCommentDraft(
  userId: number | undefined,
  animeId: number
): { text: string; reply?: TReplyTarget } {
  try {
    const value = userId
      ? JSON.parse(sessionStorage.getItem(commentDraftKey(userId, animeId)) || '{}')
      : {};
    const reply = value?.reply;
    return {
      text: typeof value?.text === 'string' ? value.text.slice(0, 10000) : '',
      ...(reply &&
      Number.isSafeInteger(reply.parent) &&
      reply.parent > 0 &&
      Number.isSafeInteger(reply.id) &&
      reply.id > 0 &&
      typeof reply.name === 'string'
        ? { reply: { parent: reply.parent, id: reply.id, name: reply.name } }
        : {}),
    };
  } catch {
    return { text: '' };
  }
}

export async function postComment(
  animeId: number,
  text: string,
  reply?: { parent: number; id: number }
) {
  const session = getSession();

  if (!session?.verified) throw new Error('Войди в аккаунт, чтобы комментировать.');

  const value = text.trim();

  if (!value || value.length > 10000)
    throw new Error('Комментарий должен содержать от 1 до 10 000 символов.');

  const comment = await yummyFetch<YummyComment>(`/comments/anime/${animeId}`, {
    token: session.token,
    method: 'POST',
    body: {
      text: value,
      ...(reply ? { parent_comment: reply.parent, reply_to_comment: reply.id } : {}),
    },
  });

  if (!comment?.id) throw new Error('Yummy не подтвердил публикацию комментария.');

  return comment;
}

export type TReplyTarget = {
  parent: number;
  id: number;
  name: string;
};
