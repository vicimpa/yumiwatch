import { CachedImage } from './CachedImage';
import { ArtworkImage } from './ArtworkImage';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import { imageUrl } from '../lib/api';
import { subscribeImage } from '../lib/image-cache';
import { toggleFavorite } from '../lib/library';
import { useLibrary } from '../lib/hooks';
import type { Anime } from '../lib/types';

export function notify(message: string) { window.dispatchEvent(new CustomEvent('yumiwatch:toast', { detail: message })); }
export function Toast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => { setMessage((event as CustomEvent).detail); clearTimeout(timer); timer = setTimeout(() => setMessage(''), 4000); };
    window.addEventListener('yumiwatch:toast', handler);
    return () => { clearTimeout(timer); window.removeEventListener('yumiwatch:toast', handler); };
  }, []);
  return <div class={`toast ${message ? 'visible' : ''}`} role="status">{message && <><Icon name="check" size={18}/>{message}</>}</div>;
}
export function Avatar({ url, name }: { url?: string; name: string }) {
  const src = imageUrl(url);
  const [failed, setFailed] = useState('');
  useEffect(()=>subscribeImage(src,()=>setFailed('')),[src]);
  return src && failed !== src ? <CachedImage src={src} alt="" decoding="async" onError={() => setFailed(src)}/> : <span>{name.trim().slice(0, 1).toLocaleUpperCase() || '?'}</span>;
}
export function Poster({ anime, large = false }: { anime: Anime; large?: boolean }) {
  const retina = window.devicePixelRatio > 1.25;
  const url = imageUrl(large
    ? (retina ? anime.poster?.huge : undefined) || anime.poster?.big || anime.poster?.medium || anime.poster?.huge
    : (retina ? anime.poster?.big : undefined) || anime.poster?.medium || anime.poster?.big || anime.poster?.huge);
  return <ArtworkImage src={url} alt={anime.title} eager={large} tone={anime.anime_id}/>;
}
export function FavoriteButton({ anime, compact = false }: { anime: Anime; compact?: boolean }) {
  const library = useLibrary();
  const [busy, setBusy] = useState(false);
  const favorite = library.favorites.some(a => a.anime_id === anime.anime_id);
  return <button class={`${compact ? 'save-button' : 'button secondary'} ${favorite ? 'saved' : ''}`} disabled={busy || library.loading} aria-busy={busy} aria-label={favorite ? `Убрать «${anime.title}» из избранного` : `Добавить «${anime.title}» в избранное`} aria-pressed={favorite} onClick={async () => {
    setBusy(true);
    try { const added = await toggleFavorite(anime); notify(added ? 'Добавлено в твою коллекцию' : 'Удалено из избранного'); } catch (error) { notify((error as Error).message); } finally { setBusy(false); }
  }}><Icon name={favorite ? 'check' : 'bookmark'} size={compact ? 17 : 19}/>{!compact && (favorite ? 'В избранном' : 'В избранное')}</button>;
}
export function AnimeCard({ anime, rank, onOpen, onFocus, onPreview }: { anime: Anime; rank?: number; onOpen?: () => void; onFocus?: () => void; onPreview?: () => void }) {
  const score = anime.rating?.average;
  return <article class="anime-card" data-gallery-item onFocusIn={onFocus} onPointerEnter={onPreview}>
    <div class="card-image"><a href={`#/anime/${anime.anime_id}?view=anime-about`} onClick={onOpen} tabIndex={-1} aria-hidden="true"><Poster anime={anime}/><span class="poster-play"><Icon name="play" size={28}/></span></a>
      {!!score && <span class="score">★ {score.toFixed(1)}</span>}<FavoriteButton anime={anime} compact/>
      {anime.anime_status?.alias === 'ongoing' && <span class="ongoing-label"><span/>Онгоинг</span>}
    </div>
    <div class="card-caption">{rank && <span class="rank">{String(rank).padStart(2, '0')}</span>}<div><h3><a data-gallery-link class="card-title" href={`#/anime/${anime.anime_id}?view=anime-about`} onClick={onOpen}>{anime.title}</a></h3><p>{[anime.year, anime.type?.shortname || anime.type?.name].filter(Boolean).join(' · ')}{anime.episodes?.aired ? ` · ${anime.episodes.aired} сер.` : ''}</p></div></div>
  </article>;
}
export function AnimeRow({ anime, onOpen }: { anime: Anime; onOpen?: () => void }) {
  return <article class="anime-result-row"><a class="result-main" href={`#/anime/${anime.anime_id}?view=anime-about`} onClick={onOpen}><div class="result-poster"><Poster anime={anime}/></div><div class="result-copy"><h2>{anime.title}</h2><p>{[anime.year, anime.type?.shortname || anime.type?.name, anime.episodes?.aired ? `${anime.episodes.aired} сер.` : ''].filter(Boolean).join(' · ')}</p><div class="result-bottom">{anime.rating?.average ? <span class="result-rating">★ {anime.rating.average.toFixed(1)}</span> : null}<span>{anime.anime_status?.title}</span></div></div></a><FavoriteButton anime={anime} compact/></article>;
}
export function CardSkeleton() {
  return <div class="skeleton-card" aria-hidden="true"><div class="skeleton poster-skeleton poster-placeholder"><Icon name="spark" size={30}/></div><div class="skeleton-caption"><span class="skeleton line"/><span class="skeleton line short"/><span class="skeleton skeleton-meta"/></div></div>;
}
export function Skeleton({ count = 6, gallery=false }: { count?: number;gallery?:boolean }) {
  return <div class={`anime-grid ${gallery?'gallery-grid':''}`} role="status" aria-label="Загрузка аниме">{Array.from({ length: count }, (_, i) => <CardSkeleton key={i}/>)}</div>;
}
export function Empty({ icon = 'search', title, children, action }: { icon?: 'search' | 'heart' | 'calendar' | 'wifi' | 'clock'; title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return <div class="empty-state"><span class="empty-icon"><Icon name={icon} size={30}/></span><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return <Empty icon="wifi" title="Не удалось загрузить">{error}<span class="error-actions"><button class="button secondary" onClick={retry}><Icon name="refresh" size={17}/>Попробовать снова</button><a class="text-link" href="#/settings">Настройки API</a></span></Empty>;
}
export function CachedNotice({ savedAt, refreshing = false }: { savedAt: number; refreshing?: boolean }) {
  return <p class="cached-notice"><Icon name="wifi" size={16}/>Сохранённая версия от {new Date(savedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. {refreshing ? 'Проверяем обновления…' : 'Показываем сохранённые данные.'}</p>;
}
export function SectionHeading({ title, subtitle, href, action = 'Смотреть всё' }: { title: string; subtitle?: string; href?: string; action?: string }) {
  return <div class="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <a class="text-link" href={href}>{action}<Icon name="arrow" size={17}/></a>}</div>;
}
