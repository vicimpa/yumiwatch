import { useEffect, useState } from 'preact/hooks';
import { animeList } from '../lib/api';
import { catalogParams, FILTER_KEYS, filterCount, parseCatalogQuery, type CatalogFilters } from '../lib/filters';
import { useResource, useSession } from '../lib/hooks';
import type { Anime } from '../lib/types';
import { FilterSheet } from './Filters';
import { Icon } from './Icon';
import { AnimeCard, CachedNotice, Empty, ErrorState, Skeleton } from './UI';
const PAGE_SIZE = 24;
const LABELS: Record<string, string> = { genres: 'Жанры', exclude_genres: 'Без жанров', types: 'Формат', season: 'Сезон', translates: 'Перевод', min_age: 'Возраст', from_year: 'Год от', to_year: 'Год до', ep_from: 'Серий от', ep_to: 'Серий до', min_rating: 'Рейтинг от', max_rating: 'Рейтинг до', min_rating_counters: 'Оценок от', max_rating_counters: 'Оценок до', exclude_list: 'Исключённые списки', studio_ids: 'Студии', director_ids: 'Режиссёры' };
export function Catalog({ query }: { query: string }) {
  const session = useSession();
  const filters = parseCatalogQuery(query);
  const [search, setSearch] = useState(filters.q);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Anime[]>([]);
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const params = catalogParams(filters);
  const accountScope = filters.exclude_list ? session?.token : '';
  const resource = useResource(signal => animeList(params, signal), [query, accountScope]);
  useEffect(() => { setSearch(filters.q); setItems([]); setPage(0); setHasMore(false); setMoreError(''); setLoadingMore(false); }, [query, accountScope]);
  useEffect(() => { if (resource.value) { setItems(resource.value.data); setHasMore(resource.value.data.length === PAGE_SIZE); } }, [resource.value]);
  const change = (key: keyof CatalogFilters, value: string) => {
    const next = new URLSearchParams(query);
    if (key === 'from_year' || key === 'to_year') next.delete('year');
    value ? next.set(key, value) : next.delete(key);
    location.hash = `/catalog${next.size ? `?${next}` : ''}`;
  };
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => change('q', search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    if (!loadingMore) return;
    const controller = new AbortController();
    animeList({ ...params, offset: (page + 1) * PAGE_SIZE }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(previous => [...previous, ...result.data.filter(anime => !previous.some(item => item.anime_id === anime.anime_id))]);
      setPage(previous => previous + 1); setHasMore(result.data.length === PAGE_SIZE);
    }).catch(error => { if (!controller.signal.aborted) setMoreError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoadingMore(false); });
    return () => controller.abort();
  }, [loadingMore, query, accountScope]);
  return <>
    <div class="page-heading compact-heading"><h1>Каталог аниме</h1><p>Все аниме YummyAnime: фильтруй, находи и смотри.</p></div>
    <form class="catalog-search" onSubmit={event => { event.preventDefault(); change('q', search.trim()); }} role="search"><Icon name="search" size={22}/><input id="catalog-search" type="search" value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Название аниме" aria-label="Найти аниме" autoComplete="off" maxLength={500} enterKeyHint="search"/>{search && <button type="button" class="icon-button" onClick={() => { setSearch(''); change('q', ''); }} aria-label="Очистить поиск"><Icon name="close" size={18}/></button>}</form>
    <div class="catalog-toolbar"><div class="filter-chips">{[['', 'Все'], ['ongoing', 'Онгоинги'], ['released', 'Вышедшие'], ['announcement', 'Анонсы']].map(([value, title]) => <button class={filters.status === value ? 'chip active' : 'chip'} key={value} onClick={() => change('status', value)}>{title}</button>)}</div><button class={`button filter-button ${filterCount(filters) ? 'has-filters' : ''}`} aria-haspopup="dialog" onClick={() => setExpanded(true)}><Icon name="filter" size={18}/>Фильтры{filterCount(filters) > 0 && <span>{filterCount(filters)}</span>}</button></div>
    {filterCount(filters) > 0 && <div class="applied-filters">{FILTER_KEYS.filter(key => filters[key] && key !== 'status').map(key => <button key={key} onClick={() => change(key, '')} aria-label={`Убрать фильтр ${LABELS[key] || key}`}>{LABELS[key] || 'Фильтр'}: {['genres', 'exclude_genres', 'exclude_list', 'studio_ids', 'director_ids'].includes(key) ? filters[key].split(',').length : filters[key]}<Icon name="close" size={13}/></button>)}<a href="#/catalog" class="text-link">Сбросить</a></div>}
    <div class="results-heading"><span>{filters.q ? `Поиск: «${filters.q}»` : 'Аниме'}{!resource.loading && ` · ${items.length}${hasMore ? '+' : ''}`}</span><label class="sort-label"><span>Сортировка</span><select aria-label="Сортировка" value={filters.sort} onChange={event => change('sort', event.currentTarget.value)}><option value="views">По популярности</option><option value="top">Топ YummyAnime</option><option value="rating">По рейтингу</option><option value="rating_counters">По числу оценок</option><option value="year">По году</option><option value="title">По алфавиту</option><option value="id">Недавно добавлены</option><option value="random">Случайно</option></select></label></div>
    {resource.loading ? <Skeleton count={12}/> : resource.error ? <ErrorState error={resource.error} retry={resource.retry}/> : <>{resource.value?.cached && <CachedNotice savedAt={resource.value.savedAt}/>}<div class="anime-grid">{items.map(anime => <AnimeCard key={anime.anime_id} anime={anime}/>)}</div>{!items.length && <Empty title="Ничего не найдено" action={<a class="button secondary" href="#/catalog">Сбросить фильтры</a>}>Попробуй другое название или измени фильтры.</Empty>}{hasMore && <div class="load-more"><button class="button secondary" disabled={loadingMore} onClick={() => { setMoreError(''); setLoadingMore(true); }}>{loadingMore ? 'Загружаем…' : 'Показать ещё'}<Icon name="arrow" size={18}/></button>{moreError && <p role="alert">{moreError}</p>}</div>}</>}
    {expanded && <FilterSheet query={query} close={() => setExpanded(false)}/>}
  </>;
}
