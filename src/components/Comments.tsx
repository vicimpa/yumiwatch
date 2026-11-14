import { useRef, useState } from 'preact/hooks';
import { imageUrl, yaniFetch } from '../lib/api';
import { getComments, postComment, type CommentPage, type YaniComment } from '../lib/comments';
import { useResource, useSession } from '../lib/hooks';
import { getSession } from '../lib/session';
import { Icon } from './Icon';
import { notify } from './UI';

function textOnly(value: string) { return value.replace(/\[\/?(?:ж|b|i|u|s|к|цитата|quote|url)(?:=[^\]]*)?\]/gi, ''); }
export function CommentText({ text }: { text: string }) {
  const pattern = /\[(?:спойлер|spoiler)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:спойлер|spoiler)\]/gi;
  const parts: { value: string; spoiler: boolean }[] = []; let cursor = 0;
  for (const match of text.matchAll(pattern)) { parts.push({ value: text.slice(cursor, match.index), spoiler: false }, { value: match[1], spoiler: true }); cursor = match.index! + match[0].length; }
  parts.push({ value: text.slice(cursor), spoiler: false });
  return <div class="comment-text">{parts.map((part, index) => part.spoiler ? <details class="comment-spoiler" key={index}><summary>Спойлер · показать</summary><span>{textOnly(part.value)}</span></details> : <span key={index}>{textOnly(part.value)}</span>)}</div>;
}
function CommentItem({ comment, reply, rootId }: { comment: YaniComment; reply: (comment: YaniComment, root: number) => void; rootId?: number }) {
  const session = useSession();
  const [vote, setVote] = useState(comment.vote || 0);
  const [likes, setLikes] = useState(comment.likes || 0);
  const [dislikes, setDislikes] = useState(comment.dislikes || 0);
  const [voting, setVoting] = useState(false);
  const [children, setChildren] = useState<YaniComment[]>();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cast = async (value: number) => {
    if (!session?.verified) { notify('Войди в аккаунт, чтобы оценивать комментарии.'); return; }
    setVoting(true); const next = vote === value ? 0 : value;
    try {
      const result = await yaniFetch(`/comments/${comment.id}/vote`, { token: session.token, method: next ? 'PUT' : 'DELETE', ...(next ? { body: { action: next } } : {}) });
      if (result === false) throw new Error('Yani не подтвердил оценку комментария.');
      if (getSession()?.token !== session.token) return;
      setLikes(comment.likes + (next === 1 ? 1 : 0) - (comment.vote === 1 ? 1 : 0));
      setDislikes(comment.dislikes + (next === -1 ? 1 : 0) - (comment.vote === -1 ? 1 : 0)); setVote(next);
    } catch (error) { notify((error as Error).message); } finally { setVoting(false); }
  };
  const loadReplies = async () => {
    if (children) { setOpened(!opened); return; }
    setLoading(true); setError('');
    try { const data = await yaniFetch<CommentPage>(`/comments/${comment.id}/children`, { token: session?.verified ? session.token : undefined }); if (!Array.isArray(data?.comments)) throw new Error('Не удалось прочитать ответы.'); setChildren(data.comments); setOpened(true); }
    catch (error) { setError((error as Error).message); } finally { setLoading(false); }
  };
  return <article class="comment-item"><div class="comment-avatar">{imageUrl(comment.avatars?.small) ? <img src={imageUrl(comment.avatars?.small)} alt="" loading="lazy"/> : comment.name.slice(0, 1)}</div><div class="comment-content"><div class="comment-author"><strong>{comment.name}</strong><time dateTime={new Date(comment.time * 1000).toISOString()}>{new Date(comment.time * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>{comment.deleted_at ? <p class="muted comment-deleted">Комментарий удалён</p> : <CommentText text={comment.text}/>}<div class="comment-actions">{!comment.deleted_at && <><button aria-label="Нравится" aria-pressed={vote === 1} disabled={voting} class={vote === 1 ? 'liked' : ''} onClick={() => void cast(1)}>↑ {likes}</button><button aria-label="Не нравится" aria-pressed={vote === -1} disabled={voting} class={vote === -1 ? 'disliked' : ''} onClick={() => void cast(-1)}>↓ {dislikes}</button><button onClick={() => reply(comment, rootId || comment.id)}>Ответить</button></>}{!rootId && comment.children_count > 0 && <button disabled={loading} onClick={() => void loadReplies()}>{loading ? 'Загружаем…' : opened ? 'Скрыть ответы' : `Ответы (${comment.children_count})`}</button>}</div>{error && <p class="account-error">{error}</p>}{opened && children && <div class="comment-replies">{children.map(child => <CommentItem key={child.id} comment={child} reply={reply} rootId={comment.id}/>)}</div>}</div></article>;
}
export function Comments({ animeId }: { animeId: number }) {
  const session = useSession();
  return <CommentsContent key={session?.token || 'guest'} animeId={animeId}/>;
}
function CommentsContent({ animeId }: { animeId: number }) {
  const session = useSession();
  const [sort, setSort] = useState('new');
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ parent: number; id: number; name: string }>();
  const [sending, setSending] = useState(false);
  const [postError, setPostError] = useState('');
  const [revision, setRevision] = useState(0);
  const [extra, setExtra] = useState<YaniComment[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [moreEnd, setMoreEnd] = useState(false);
  const generation = useRef(0);
  const resource = useResource(signal => getComments(animeId, sort, 0, signal), [animeId, sort, revision]);
  const comments = [...(resource.value?.data.comments || []), ...extra];
  const respond = (comment: YaniComment, root: number) => {
    if (!session?.verified) { notify('Войди в аккаунт, чтобы ответить.'); return; }
    setReply({ parent: root, id: comment.id, name: comment.name }); document.getElementById('comment-text')?.focus();
  };
  return <section class="comments-section"><div class="section-heading"><h2>Комментарии</h2><select aria-label="Сортировка комментариев" value={sort} onChange={event => { generation.current++; setSort(event.currentTarget.value); setExtra([]); setMoreEnd(false); setLoadingMore(false); }}><option value="new">Новые</option><option value="nice">Лучшие</option><option value="old">Старые</option></select></div>{session?.verified ? <form class="comment-form" onSubmit={async event => {
    event.preventDefault(); if (sending) return;
    setSending(true); setPostError('');
    try { await postComment(animeId, text, reply); if (getSession()?.token !== session.token) return; generation.current++; setText(''); setReply(undefined); setExtra([]); setMoreEnd(false); setRevision(value => value + 1); notify('Комментарий опубликован'); }
    catch (error) { setPostError((error as Error).message); } finally { setSending(false); }
  }}>{reply && <div class="comment-reply-to">Ответ для {reply.name}<button type="button" aria-label="Отменить ответ" onClick={() => setReply(undefined)}><Icon name="close" size={16}/></button></div>}<label htmlFor="comment-text">Обсуждение от имени {session.user.nickname}<textarea id="comment-text" placeholder="Что думаешь об аниме? Спойлеры прячь в [спойлер]…[/спойлер]." rows={3} maxLength={10000} required value={text} disabled={sending} onInput={event => setText(event.currentTarget.value)}/></label><div class="comment-form-footer"><button type="button" class="text-link" onClick={() => setText(value => `${value}[спойлер]текст[/спойлер]`)}>Добавить спойлер</button><button type="submit" class="button primary" disabled={sending || !text.trim()}>{sending ? 'Отправляем…' : 'Отправить'}</button></div>{postError && <p role="alert" class="account-error">{postError}</p>}</form> : <div class="comment-login"><p>Войди в аккаунт YummyAnime, чтобы присоединиться к обсуждению.</p><a class="button secondary" href={`#/account?next=${encodeURIComponent(`/anime/${animeId}?comments=1`)}`}>Войти</a></div>}{resource.loading ? <p class="account-loading" role="status">Загружаем комментарии…</p> : resource.error ? <div class="account-error" role="alert">{resource.error}<button onClick={resource.retry} class="text-link">Повторить</button></div> : <>{comments.map(comment => <CommentItem key={`${comment.id}:${revision}`} comment={comment} reply={respond}/>)}{!comments.length && <p class="comment-empty">Комментариев пока нет. Начни обсуждение.</p>}{!moreEnd && (resource.value?.data.comments.length || 0) >= 20 && <div class="load-more"><button class="button secondary" disabled={loadingMore} onClick={async () => {
    setLoadingMore(true); setMoreError(''); const currentGeneration = generation.current;
    try { const result = await getComments(animeId, sort, comments.length); if (generation.current !== currentGeneration) return; setExtra(previous => [...previous, ...result.data.comments.filter(comment => !comments.some(existing => existing.id === comment.id))]); setMoreEnd(result.data.comments.length < 20); }
    catch (error) { if (generation.current === currentGeneration) setMoreError((error as Error).message); } finally { if (generation.current === currentGeneration) setLoadingMore(false); }
  }}>{loadingMore ? 'Загружаем…' : 'Ещё комментарии'}</button>{moreError && <p role="alert">{moreError}</p>}</div>}</>}</section>;
}
