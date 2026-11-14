import { yaniFetch } from './api';
import { getSession } from './session';
export interface YaniComment { id: number; name: string; avatars?: { small?: string }; children_count: number; deleted_at: number; time: number; user_id: number; vote: number; text: string; dislikes: number; likes: number; parent_id: number }
export interface CommentPage { comments: YaniComment[]; isMod?: boolean }
export async function getComments(animeId: number, sort: string, skip: number, signal?: AbortSignal) {
  const session = getSession();
  const data = await yaniFetch<CommentPage>(`/comments/anime/${animeId}`, { token: session?.verified ? session.token : undefined, params: { sort, skip, limit: 20 }, signal });
  if (!Array.isArray(data?.comments)) throw new Error('Не удалось прочитать комментарии Yani.');
  return { data, cached: false, savedAt: Date.now() };
}
export async function postComment(animeId: number, text: string, reply?: { parent: number; id: number }) {
  const session = getSession();
  if (!session?.verified) throw new Error('Войди в аккаунт, чтобы комментировать.');
  const value = text.trim();
  if (!value || value.length > 10000) throw new Error('Комментарий должен содержать от 1 до 10 000 символов.');
  const comment = await yaniFetch<YaniComment>(`/comments/anime/${animeId}`, { token: session.token, method: 'POST', body: { text: value, ...(reply ? { parent_comment: reply.parent, reply_to_comment: reply.id } : {}) } });
  if (!comment?.id) throw new Error('Yani не подтвердил публикацию комментария.');
  return comment;
}
