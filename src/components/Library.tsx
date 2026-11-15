import { SEARCH_INPUT_PROPS } from '../lib/search';
import { VirtualGrid } from './VirtualGrid';
import { useEffect, useState } from 'preact/hooks';
import { yaniFetch } from '../lib/api';
import { useLibrary, useResource, useSession } from '../lib/hooks';
import { WATCH_LISTS, type WatchListId } from '../lib/lists';
import { clearHistory, loadMoreHistory, normalizeAnime, setAnimeList, syncLibrary } from '../lib/library';
import { formatTime } from '../lib/player';
import type { Anime } from '../lib/types';
import { navigateGallery } from '../lib/gallery-navigation';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { AnimeCard, Empty, ErrorState, FavoriteButton, notify, Poster, Skeleton } from './UI';

export function AnimeListButton({ anime }: { anime: Anime }) {
  const library = useLibrary();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const selected = WATCH_LISTS.find(list => library.lists?.[list.id]?.some(value => value.anime_id === anime.anime_id));
  const choose = async (id: WatchListId | null) => {
    if (busy) return;
    if (id === (selected?.id ?? null)) { setOpen(false); return; }
    setBusy(true); setError('');
    try { await setAnimeList(anime, id); setOpen(false); notify(id === null ? 'Убрано из списка' : `Добавлено в «${WATCH_LISTS.find(list => list.id === id)!.title}»`); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <div class="detail-list-control"><button class="button secondary list-status-button" aria-haspopup="dialog" disabled={library.loading} onClick={() => { setError(''); setOpen(true); }}><Icon name={selected ? 'check' : 'list'} size={17}/>{selected?.title || 'Добавить в список'}<Icon name="chevron" size={15}/></button>{open && <Sheet title="В мою коллекцию" subtitle={anime.title} close={() => { if (!busy) setOpen(false); }} className="list-picker"><p class="filter-help">{library.account ? 'Сохраним в твоём аккаунте YummyAnime.' : 'Сохраним на этом устройстве. Гостевые списки хранятся отдельно от аккаунта.'}</p>{error && <p role="alert" class="sheet-validation">{error}</p>}<div class="source-options">{WATCH_LISTS.map(list => <button key={list.id} class={`source-option ${selected?.id === list.id ? 'selected' : ''}`} disabled={busy} aria-pressed={selected?.id === list.id} onClick={() => void choose(list.id)}><span><strong style={{ color: list.color }}>{list.title}</strong><small>{list.hint}</small></span>{selected?.id === list.id && <Icon name="check" size={20}/>}</button>)}{selected && <button class="source-option" disabled={busy} onClick={() => void choose(null)}><span><strong>Убрать из списка</strong><small>Избранное и история останутся</small></span><Icon name="close" size={19}/></button>}</div><div class="list-picker-favorite"><p>Любимые аниме можно сохранить отдельно.</p><FavoriteButton anime={anime}/></div>{busy && <p role="status" class="filter-help">Сохраняем…</p>}</Sheet>}</div>;
}
function Subscriptions() {
  const session = useSession();
  const resource = useResource(async signal => {
    if (!session?.verified) return { data: [] as (Anime & { sub?: { player?: string; dubbing?: string } })[], cached: false, savedAt: 0 };
    const data = await yaniFetch<(Anime & { sub?: { player?: string; dubbing?: string } })[]>(`/users/${session.user.id}/lists/subs`, { token: session.token, signal });
    if (!Array.isArray(data)) throw new Error('Не удалось прочитать подписки.');
    return { data: data.map(value => ({ ...normalizeAnime(value), sub: value.sub })), cached: false, savedAt: Date.now() };
  }, [session?.token, session?.verified]);
  if (!session) return <Empty icon="heart" title="Подписки живут в твоём аккаунте" action={<a class="button primary" href="#/account?next=%2Flibrary%3Ftab%3Dsubscriptions">Войти в YummyAnime</a>}>После входа здесь появятся подписки на озвучки с сайта.</Empty>;
  if (!session.verified || resource.loading) return <Skeleton/>;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.retry}/>;
  const values = resource.value?.data || [];
  return values.length ? <div class="subscription-list">{values.map((anime, index) => <a class="subscription-card" href={`#/anime/${anime.anime_id}`} key={`${anime.anime_id}:${index}`}><div class="history-poster"><Poster anime={anime}/></div><div><h2>{anime.title}</h2><p>{[anime.sub?.dubbing, anime.sub?.player].filter(Boolean).join(' · ') || 'Подписка на новые серии'}</p></div><Icon name="chevron" size={18}/></a>)}</div> : <Empty icon="heart" title="Подписок пока нет">Подписки на озвучки, добавленные на YummyAnime, появятся здесь.</Empty>;
}
export function LibraryPage({ query }: { query: string }) {
  const library = useLibrary();
  const tab = new URLSearchParams(query).get('tab') || '';
  const selected = WATCH_LISTS.find(list => list.alias === tab);
  const historyTab = tab === 'history'; const favoritesTab = tab === 'favorites'; const subscriptionsTab = tab === 'subscriptions';
  const overview = !selected && !historyTab && !favoritesTab && !subscriptionsTab;
  const [search, setSearch] = useState(''); const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { setSearch(''); setConfirmClear(false); }, [tab]);
  const title = selected?.title || (historyTab ? 'История просмотра' : favoritesTab ? 'Избранное' : subscriptionsTab ? 'Подписки на озвучки' : 'Моя коллекция');
  const animes = favoritesTab ? library.favorites : selected ? library.lists?.[selected.id] || [] : [];
  const matching = (anime: Anime) => anime.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const filtered = animes.filter(matching); const history = library.history.filter(entry => matching(entry.anime));
  return <section class="library-gallery" onKeyDown={navigateGallery}>{!overview && <a class="back-link" href="#/library"><Icon name="back" size={17}/>Все списки</a>}<div class="page-heading library-heading"><h1>{title}</h1><p>{overview ? 'Сейчас, потом или навсегда — у каждой истории своё место.' : selected?.hint || (historyTab ? 'Продолжи с того места, где остановился.' : favoritesTab ? 'Те самые истории, к которым хочется возвращаться.' : 'Твои подписки с YummyAnime.')}</p></div><div class="library-account-bar"><p class="collection-note">{library.account ? 'Коллекция твоего аккаунта YummyAnime' : 'Гостевая коллекция на этом устройстве'}</p>{library.account ? <button class="text-link" disabled={library.loading} onClick={() => void syncLibrary()}><Icon name="refresh" size={15}/>{library.loading ? 'Обновляем…' : 'Обновить'}</button> : <a class="text-link" href="#/account">Войти<Icon name="arrow" size={15}/></a>}</div>{library.error && <div class="account-error" role="alert">{library.error}<button class="text-link" onClick={() => void syncLibrary()}>Повторить</button></div>}
    {overview ? <div class="library-list-grid">{WATCH_LISTS.map(list => <a href={`#/library?tab=${list.alias}`} key={list.id} class="library-list-tile" style={{ '--list-color': list.color }}><div><span class="list-tile-icon"><Icon name={list.id === 0 ? 'play' : list.id === 1 ? 'calendar' : list.id === 2 ? 'check' : list.id === 3 ? 'close' : 'clock'} size={23}/></span><strong>{library.lists?.[list.id]?.length || 0}</strong></div><h2>{list.title}</h2><p>{list.hint}</p></a>)}<a class="library-list-tile" href="#/library?tab=favorites" style={{ '--list-color': '#e6a3b6' }}><div><span class="list-tile-icon"><Icon name="heart" size={23}/></span><strong>{library.favorites.length}</strong></div><h2>Избранное</h2><p>Любимые аниме, отдельно от статуса</p></a><a class="library-list-tile" href="#/library?tab=history" style={{ '--list-color': '#8dbbc9' }}><div><span class="list-tile-icon"><Icon name="clock" size={23}/></span><strong>{library.history.length}{library.hasMore ? '+' : ''}</strong></div><h2>История</h2><p>Серии и сохранённое время</p></a><a class="library-list-tile" href="#/library?tab=subscriptions" style={{ '--list-color': '#d0b58b' }}><div><span class="list-tile-icon"><Icon name="list" size={23}/></span><Icon name="chevron" size={19}/></div><h2>Подписки</h2><p>Следи за любимыми озвучками</p></a></div> : subscriptionsTab ? <Subscriptions/> : library.loading && !library.syncedAt && !(historyTab && history.length) ? <div class="account-loading" role="status">Загружаем коллекцию аккаунта…<br/><a class="text-link" href="#/account">Проверить вход в аккаунт</a></div> : <>
      {(animes.length > 0 || historyTab && library.history.length > 0) && <div class="collection-search"><Icon name="search" size={19}/><input type="search" {...SEARCH_INPUT_PROPS} aria-label="Найти в списке" placeholder="Найти в этом списке" value={search} onInput={event => setSearch(event.currentTarget.value)}/>{search && <button class="icon-button" aria-label="Очистить поиск в списке" onClick={() => setSearch('')}><Icon name="close" size={17}/></button>}</div>}
      {historyTab ? history.length ? <><div class="history-list">{history.map(entry => <a class="history-card" href={`#/anime/${entry.anime.anime_id}?view=watch&play=1`} key={entry.anime.anime_id}><div class="history-poster"><Poster anime={entry.anime}/></div><div class="history-copy"><span class="eyebrow">СЕРИЯ {entry.episode}</span><h2>{entry.anime.title}</h2><p>{entry.position ? `${formatTime(entry.position)}${entry.duration ? ` / ${formatTime(entry.duration)}` : ''} · ` : ''}{new Date(entry.updatedAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</p>{!!entry.duration && <div class="history-progress"><span style={{ width: `${Math.min(100, (entry.position || 0) / entry.duration * 100)}%` }}/></div>}</div><span class="continue-play"><Icon name="play" size={20}/></span></a>)}</div>{library.account ? <div class="clear-history"><a class="text-link" href="https://ru.yummyani.me/watch-history" target="_blank" rel="noreferrer">Управлять историей на YummyAnime<Icon name="external" size={15}/></a></div> : <div class="clear-history">{confirmClear ? <><p>Удалить историю на этом устройстве?</p><button class="button secondary" onClick={() => { try { clearHistory(); setConfirmClear(false); notify('История очищена'); } catch (error) { notify((error as Error).message); } }}>Удалить историю</button><button class="text-link" onClick={() => setConfirmClear(false)}>Отмена</button></> : <button class="text-link" onClick={() => setConfirmClear(true)}><Icon name="trash" size={16}/>Очистить историю</button>}</div>}</> : <Empty icon="clock" title={search ? 'В истории не нашлось' : 'Здесь продолжится твоя история'} action={!search && <a class="button primary" href="#/catalog">Выбрать аниме<Icon name="arrow" size={18}/></a>}>{search ? 'Попробуй короткую часть названия.' : 'Открой первую серию — мы запомним её и озвучку.'}</Empty> : filtered.length ? <VirtualGrid items={filtered} itemKey={anime=>anime.anime_id} renderItem={anime=><AnimeCard anime={anime}/>}/> : <Empty icon="heart" title={search ? 'В списке не нашлось' : 'Пока ни одной истории'} action={!search && <a class="button primary" href="#/catalog">Найти аниме<Icon name="arrow" size={18}/></a>}>{search ? 'Попробуй другое название.' : 'На странице аниме выбери «Добавить в список».'}</Empty>}
      {historyTab && library.hasMore && <div class="load-more"><button class="button secondary" disabled={library.loadingMore} onClick={() => void loadMoreHistory()}>{library.loadingMore ? 'Загружаем…' : 'Ещё история'}</button></div>}
    </>}
  </section>;
}
