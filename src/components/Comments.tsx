import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { yaniFetch,cachedRequest,peekRequest } from '../lib/api';
import { getComments,peekComments, postComment, type CommentPage, type YaniComment } from '../lib/comments';
import { useResource, useSession } from '../lib/hooks';
import { getSession } from '../lib/session';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Select } from './Select';
import { Avatar, notify } from './UI';

interface ReplyTarget { parent: number; id: number; name: string }
function textOnly(value: string) { return value.replace(/\[\/?(?:ж|b|i|u|s|к|цитата|quote|url)(?:=[^\]]*)?\]/gi, ''); }
function Spoiler({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return visible ? <span class="revealed-spoiler">{textOnly(text)}</span> : <button type="button" class="inline-spoiler" onClick={() => setVisible(true)} aria-label="Показать спойлер"><Icon name="bookmark" size={13}/>Спойлер · показать</button>;
}
export function CommentText({ text }: { text: string }) {
  const pattern = /\[(?:спойлер|spoiler)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:спойлер|spoiler)\]/gi;
  const parts: { value: string; spoiler: boolean }[] = []; let cursor = 0;
  for (const match of text.matchAll(pattern)) { parts.push({ value: text.slice(cursor, match.index), spoiler: false }, { value: match[1], spoiler: true }); cursor = match.index! + match[0].length; }
  parts.push({ value: text.slice(cursor), spoiler: false });
  return <div class="comment-text">{parts.map((part, index) => part.spoiler ? <Spoiler key={index} text={part.value}/> : <span key={index}>{textOnly(part.value)}</span>)}</div>;
}
function commentDate(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - time) / 60));
  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч. назад`;
  return new Date(time * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'short', ...(minutes > 525600 ? { year: 'numeric' } : {}) });
}
function CommentItem({ comment, reply, rootId, openThread }: { comment: YaniComment; reply: (comment: YaniComment, root: number) => void; rootId?: number; openThread?: (comment: YaniComment) => void }) {
  const session = useSession();
  const [vote, setVote] = useState(comment.vote || 0);
  const [likes, setLikes] = useState(comment.likes || 0);
  const [dislikes, setDislikes] = useState(comment.dislikes || 0);
  const [voting, setVoting] = useState(false);
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
  return <article class="comment-item"><div class="comment-avatar"><Avatar url={comment.avatars?.small} name={comment.name}/></div><div class="comment-content"><div class="comment-author"><strong>{comment.name}</strong><time dateTime={new Date(comment.time * 1000).toISOString()}>{commentDate(comment.time)}</time></div>{comment.deleted_at ? <p class="muted comment-deleted">Комментарий удалён</p> : <CommentText text={comment.text}/>}<div class="comment-actions">{!comment.deleted_at && <><div class="comment-votes"><button aria-label="Нравится" aria-pressed={vote === 1} disabled={voting} class={vote === 1 ? 'liked' : ''} onClick={() => void cast(1)}>↑ <span>{likes}</span></button><button aria-label="Не нравится" aria-pressed={vote === -1} disabled={voting} class={vote === -1 ? 'disliked' : ''} onClick={() => void cast(-1)}>↓ <span>{dislikes}</span></button></div><button onClick={() => reply(comment, rootId || comment.id)}>Ответить</button></>}{openThread && comment.children_count > 0 && <button class="comment-thread-link" onClick={() => openThread(comment)}><Icon name="comment" size={16}/>Ответы ({comment.children_count})<Icon name="chevron" size={14}/></button>}</div></div></article>;
}
function Thread({ parent, close, reply, revision }: { parent: YaniComment; close: () => void; reply: (comment: YaniComment, root: number) => void; revision: number }) {
  const session = useSession();
  const resource = useResource(async signal => {
    const result = await cachedRequest<CommentPage>(`/comments/${parent.id}/children`,{},signal,{token:session?.verified?session.token:undefined});
    if (!Array.isArray(result.data?.comments)) throw new Error('Не удалось прочитать ответы.');
    return result;
  }, [parent.id, revision,session?.token],()=>peekRequest<CommentPage>(`/comments/${parent.id}/children`,{},{token:session?.verified?session.token:undefined}));
  return <Sheet title="Ответы" subtitle={`Обсуждение с ${parent.name}`} close={close} className="thread-screen" footer={<button class="button primary" onClick={() => reply(parent, parent.id)}><Icon name="comment" size={17}/>Ответить в ветке</button>}><div class="thread-parent"><CommentItem comment={parent} reply={reply}/></div><div class="thread-replies">{resource.loading ? <p class="account-loading" role="status">Загружаем ответы…</p> : resource.error ? <div class="account-error" role="alert">{resource.error}<button class="text-link" onClick={resource.retry}>Повторить</button></div> : resource.value?.data.comments.map(comment => <CommentItem key={`${comment.id}:${revision}`} comment={comment} reply={reply} rootId={parent.id}/>)}</div></Sheet>;
}
function Composer({ animeId, requestedReply, close, completed }: { animeId: number; requestedReply?: ReplyTarget; close: () => void; completed: () => void }) {
  const session = useSession()!;
  const key = `yumiwatch:draft:${session.user.id}:${animeId}`;
  const stored = useRef<{ text?: string; reply?: ReplyTarget }>({});
  const loaded = useRef(false);
  if (!loaded.current) { loaded.current = true; try { stored.current = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { stored.current = {}; } }
  const [reply, setReply] = useState(requestedReply || stored.current.reply);
  const [text, setText] = useState(!requestedReply || requestedReply.id === stored.current.reply?.id ? stored.current.text || '' : '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sent = useRef(false); const form = useRef<HTMLFormElement>(null); const formId = useId();
  useLayoutEffect(() => { textarea.current?.focus(); }, []);
  useLayoutEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${textarea.current.scrollHeight}px`; } }, [text]);
  useEffect(() => {
    const save = () => { if (sent.current || getSession()?.token !== session.token) return; try { text ? sessionStorage.setItem(key, JSON.stringify({ text, reply })) : sessionStorage.removeItem(key); } catch { /* Draft saving is optional. */ } };
    const timer = setTimeout(save, 300); return () => { clearTimeout(timer); save(); };
  }, [text, reply, key]);
  return <Sheet title={reply ? `Ответ для ${reply.name}` : 'Новый комментарий'} subtitle={`От имени ${session.user.nickname}`} close={close} className="composer-screen" footer={<><div class="composer-footer-meta"><button type="button" class="text-link" onClick={() => {
    const start = textarea.current?.selectionStart ?? text.length; const end = textarea.current?.selectionEnd ?? text.length;
    setText(value => `${value.slice(0, start)}[спойлер]${value.slice(start,end)}[/спойлер]${value.slice(end)}`);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + 9, start + 9 + end - start); });
  }}>+ Спойлер</button><span>{text.length}/10000</span></div>{error && <p role="alert" class="sheet-validation">{error}</p>}<button class="button primary" form={formId} type="submit" disabled={sending || !text.trim()}>{sending ? 'Отправляем…' : 'Опубликовать'}</button></>}><form ref={form} id={formId} class="comment-composer-form" onSubmit={async event => {
    event.preventDefault(); if (sending) return; setSending(true); setError('');
    try { await postComment(animeId, text, reply); if (getSession()?.token !== session.token) return; sent.current = true; try { sessionStorage.removeItem(key); } catch { /* Publishing succeeded even if storage is unavailable. */ } completed(); notify('Комментарий опубликован'); }
    catch (error) { setError((error as Error).message); } finally { setSending(false); }
  }}>{reply && <div class="comment-reply-to">Ответ для {reply.name}<button type="button" aria-label="Отменить ответ" onClick={() => setReply(undefined)}><Icon name="close" size={16}/></button></div>}<label htmlFor="comment-draft">Твой комментарий<textarea ref={textarea} id="comment-draft" placeholder="Поделись впечатлениями. Сюжетные детали спрячь под спойлер." maxLength={10000} required value={text} disabled={sending} onInput={event => setText(event.currentTarget.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') form.current?.requestSubmit(); }}/></label><p class="draft-note">{stored.current.text ? 'Черновик восстановлен' : 'Черновик сохранится, если закрыть этот экран'}</p></form></Sheet>;
}
export function Comments({ animeId, returnTo }: { animeId: number; returnTo?:string }) {
  const session = useSession(); return <CommentsContent key={session?.token || 'guest'} animeId={animeId} returnTo={returnTo}/>;
}
function CommentsContent({ animeId, returnTo }: { animeId: number; returnTo?:string }) {
  const session = useSession();
  const [sort, setSort] = useState('new'); const [revision, setRevision] = useState(0);
  const [compose, setCompose] = useState(false); const [reply, setReply] = useState<ReplyTarget>(); const [thread, setThread] = useState<YaniComment>();
  const [extra, setExtra] = useState<YaniComment[]>([]); const [loadingMore, setLoadingMore] = useState(false); const [moreError, setMoreError] = useState(''); const [moreEnd, setMoreEnd] = useState(false);
  const generation = useRef(0);
  const resource = useResource(signal => getComments(animeId, sort, 0, signal), [animeId, sort, revision,session?.token,session?.verified],()=>peekComments(animeId,sort,0));
  const comments = [...(resource.value?.data.comments || []), ...extra];
  const loginHref = `#/account?next=${encodeURIComponent(returnTo||`/anime/${animeId}?view=comments`)}`;
  const respond = (comment: YaniComment, root: number) => {
    if (!session?.verified) { location.hash = loginHref.slice(1); return; }
    setReply({ parent: root, id: comment.id, name: comment.name }); setCompose(true);
  };
  return <section class="comments-section"><div class="discussion-header"><div><h2>Обсуждение</h2><p>Без спойлеров — до твоего нажатия</p></div><Select aria-label="Сортировка комментариев" value={sort} onChange={event => { generation.current++; setSort(event.currentTarget.value); setExtra([]); setMoreEnd(false); setLoadingMore(false); }}><option value="new">Новые</option><option value="nice">Лучшие</option><option value="old">Старые</option></Select></div>
    {resource.loading ? <div class="comment-loading" role="status" aria-label="Загрузка комментариев">{[1,2,3].map(value => <div key={value} class="comment-skeleton"><div class="skeleton"/><div><div class="skeleton line"/><div class="skeleton line"/><div class="skeleton line short"/></div></div>)}</div> : resource.error ? <div class="account-error" role="alert">{resource.error}<button class="text-link" onClick={resource.retry}>Повторить</button></div> : <>{comments.map(comment => <CommentItem key={`${comment.id}:${revision}`} comment={comment} reply={respond} openThread={setThread}/>)}{!comments.length && <div class="discussion-empty"><Icon name="comment" size={35}/><h3>Пока тихо</h3><p>Начни обсуждение этого аниме.</p></div>}{!moreEnd && (resource.value?.data.comments.length || 0) >= 20 && <div class="load-more"><button class="button secondary" disabled={loadingMore} onClick={async () => {
      setLoadingMore(true); setMoreError(''); const version = generation.current;
      try { const result = await getComments(animeId, sort, comments.length); if (generation.current !== version) return; setExtra(previous => [...previous, ...result.data.comments.filter(comment => !comments.some(existing => existing.id === comment.id))]); setMoreEnd(result.data.comments.length < 20); }
      catch (error) { if (generation.current === version) setMoreError((error as Error).message); } finally { if (generation.current === version) setLoadingMore(false); }
    }}>{loadingMore ? 'Загружаем…' : 'Ещё комментарии'}</button>{moreError && <p role="alert">{moreError}</p>}</div>}</>}
    <div class="discussion-compose-bar">{session?.verified ? <button onClick={() => { setReply(undefined); setCompose(true); }}><span class="compose-avatar">{session.user.nickname.slice(0,1)}</span><span>Написать комментарий…</span><Icon name="comment" size={20}/></button> : <a href={loginHref}><Icon name="comment" size={20}/><span>Войти, чтобы комментировать</span><Icon name="arrow" size={18}/></a>}</div>
    {thread && <Thread parent={thread} revision={revision} close={() => setThread(undefined)} reply={respond}/>}
    {compose && session?.verified && <Composer key={reply?.id || 'new'} animeId={animeId} requestedReply={reply} close={() => setCompose(false)} completed={() => { setCompose(false); generation.current++; setExtra([]); setMoreEnd(false); setRevision(value => value + 1); if (!reply) setSort('new'); }}/>}
  </section>;
}
