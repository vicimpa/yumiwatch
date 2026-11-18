import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { animeList, peekAnimeList } from '~/lib/api';
import { catalogParams, filterCount, parseCatalogQuery, type CatalogFilters } from '~/lib/filters';
import { navigateGallery } from '~/lib/gallery-navigation';
import { useResource, useSession } from '~/lib/hooks';
import { readJSON, writeJSON } from '~/lib/storage';
import type { Anime } from '~/lib/types';

import { AnimeCard, AnimeRow } from './AnimeCard';
import { AutoLoad } from './AutoLoad';
import { FilterSheet } from './Filters';
import { GalleryToolbar } from './GalleryShelf';
import {
  Button,
  ButtonLink,
  ChoiceTabs,
  Empty,
  ErrorState,
  Icon,
  Select,
  Skeleton,
  VirtualGrid,
} from '~/ui';

const PAGE_SIZE = 24;
const STATUS_CHOICES = [
  ['', 'Все'],
  ['ongoing', 'Онгоинги'],
  ['released', 'Вышедшие'],
  ['announcement', 'Анонсы'],
] as const;

export type TCatalogProps = { query: string; active?: boolean };

export const Catalog: FC<TCatalogProps> = ({ query, active = true }) => {
  const session = useSession();
  const filters = useMemo(() => parseCatalogQuery(query), [query]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!active) setExpanded(null);
  }, [active]);

  const [layout, setLayout] = useState(() => readJSON('yumiwatch:catalog-layout', 'grid'));
  const [pages, setPages] = useState<Record<number, Anime[]>>({});
  const pageRef = useRef(0);
  const loadingTarget = useRef<number | null>(null);
  const requests = useRef(new Set<AbortController>());
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const params = useMemo(() => catalogParams(filters), [filters]);
  const accountScope = filters.exclude_list ? session?.token : '';
  const resource = useResource(
    signal => animeList(params, signal),
    [query, accountScope],
    () => peekAnimeList(params)
  );
  const scopeKey = `${query}\0${accountScope || ''}`,
    liveScope = useRef(scopeKey);

  liveScope.current = scopeKey;

  const canLoadMore =
    resource.value && pageRef.current === 0 ? resource.value.data.length === PAGE_SIZE : hasMore;
  const items = useMemo(() => {
    const visiblePages = resource.value ? { ...pages, 0: resource.value.data } : pages,
      seen = new Set<number>();

    return Object.values(visiblePages)
      .flat()
      .filter(anime => {
        if (seen.has(anime.anime_id)) return false;
        seen.add(anime.anime_id);

        return true;
      });
  }, [pages, resource.value?.data]);

  useEffect(() => {
    setPages({});
    pageRef.current = 0;
    loadingTarget.current = null;
    setHasMore(false);
    setMoreError('');
    setLoadingMore(false);

    return () => {
      requests.current.forEach(controller => controller.abort());
      requests.current.clear();
    };
  }, [query, accountScope]);

  useEffect(() => {
    if (resource.value) {
      setPages(previous => ({ ...previous, 0: resource.value!.data }));
      if (pageRef.current === 0) setHasMore(resource.value.data.length === PAGE_SIZE);
    }
  }, [resource.value]);

  const change = useCallback(
    (key: keyof CatalogFilters, value: string) => {
      const next = new URLSearchParams(query);

      if (key === 'from_year' || key === 'to_year') next.delete('year');
      value ? next.set(key, value) : next.delete(key);
      location.hash = `/catalog${next.size ? `?${next}` : ''}`;
    },
    [query]
  );

  const loadNextPage = useCallback(async () => {
    if (!active || !canLoadMore || loadingTarget.current !== null) return;
    setMoreError('');
    setLoadingMore(true);

    const controller = new AbortController();

    requests.current.add(controller);

    const target = pageRef.current + 1;

    loadingTarget.current = target;

    const apply = (data: Anime[]) => {
      setPages(previous => ({ ...previous, [target]: data }));
      if (pageRef.current === target) setHasMore(data.length === PAGE_SIZE);
    };

    try {
      const result = await animeList({ ...params, offset: target * PAGE_SIZE }, controller.signal);

      if (controller.signal.aborted) return;
      pageRef.current = target;
      apply(result.data);
      loadingTarget.current = null;
      setLoadingMore(false);
      if (result.revalidate) {
        const fresh = await result.revalidate;

        if (!controller.signal.aborted) apply(fresh.data);
      }
    } catch (error) {
      if (!controller.signal.aborted) setMoreError((error as Error).message);
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && loadingTarget.current === target) {
        loadingTarget.current = null;
        setLoadingMore(false);
      }
    }
  }, [active, canLoadMore, params]);

  const refreshLoadedPages = useCallback(async () => {
    // Keep every loaded page on screen while refreshing it in bounded batches.
    const count = pageRef.current,
      scope = liveScope.current;

    for (let first = 1; first <= count && scope === liveScope.current; first += 2)
      await Promise.all(
        [first, first + 1]
          .filter(page => page <= count)
          .map(async page => {
            const controller = new AbortController();

            requests.current.add(controller);
            try {
              const saved = await animeList(
                  { ...params, offset: page * PAGE_SIZE },
                  controller.signal
                ),
                fresh = saved.revalidate ? await saved.revalidate : saved;

              if (!controller.signal.aborted && scope === liveScope.current)
                setPages(previous => ({ ...previous, [page]: fresh.data }));
            } catch {
              /* A failed refresh keeps the saved page. */
            } finally {
              requests.current.delete(controller);
            }
          })
      );
  }, [params]);

  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      resource.retry();
      void refreshLoadedPages();
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    const online = () => {
      if (active) {
        resource.retry();
        void refreshLoadedPages();
      }
    };

    window.addEventListener('online', online);

    return () => window.removeEventListener('online', online);
  }, [active, query, accountScope]);

  const openFilters = useCallback(() => setExpanded('main'), []);

  const clearQuery = useCallback(() => change('q', ''), [change]);

  const chooseStatus = useCallback((value: string) => change('status', value), [change]);

  const toggleLayout = useCallback(() => {
    const next = layout === 'grid' ? 'list' : 'grid';

    setLayout(next);
    writeJSON('yumiwatch:catalog-layout', next);
  }, [layout]);

  const changeSort = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => change('sort', event.currentTarget.value),
    [change]
  );

  const animeKey = useCallback((anime: Anime) => anime.anime_id, []);

  const renderAnime = useCallback(
    (anime: Anime) =>
      layout === 'grid' ? <AnimeCard anime={anime} /> : <AnimeRow anime={anime} />,
    [layout]
  );

  const loadMore = useCallback(() => void loadNextPage(), [loadNextPage]);

  const closeFilters = useCallback(() => setExpanded(null), []);

  return (
    <section class="catalog-gallery" onKeyDown={navigateGallery}>
      <GalleryToolbar
        title="Все аниме"
        subtitle="Галерея каталога YummyAnime"
        onFilters={openFilters}
        count={filterCount(filters)}
      />
      {filters.q && (
        <div class="gallery-query">
          <Icon name="search" size={18} />
          <span>Поиск: «{filters.q}»</span>
          <ButtonLink href={`#/search?q=${encodeURIComponent(filters.q)}`} variant="text">
            Изменить
          </ButtonLink>
          <Button aria-label="Очистить поиск" onClick={clearQuery} variant="icon">
            <Icon name="close" size={17} />
          </Button>
        </div>
      )}
      <div class="catalog-toolbar">
        <ChoiceTabs
          class="catalog-status-tabs"
          label="Статус аниме"
          active={active}
          value={filters.status}
          choices={STATUS_CHOICES}
          onChange={chooseStatus}
        />
      </div>
      <div class="results-heading">
        <div class="catalog-results-title">
          <span class="catalog-results-count">
            {filters.q ? `Поиск: «${filters.q}»` : 'Аниме'}
            {!resource.loading && ` · ${items.length}${canLoadMore ? '+' : ''}`}
          </span>
          <div class="catalog-status" role="status" aria-live="polite" aria-atomic="true">
            {resource.loading ? (
              <span>Загружаем…</span>
            ) : resource.refreshing ? (
              <span class="background-update" title="Обновляем каталог в фоне…">
                <Icon name="refresh" size={12} />
                <span>Обновляем каталог в фоне…</span>
              </span>
            ) : resource.value?.cached ? (
              <span
                class="cached-notice"
                title={`Сохранённая версия от ${new Date(resource.value.savedAt).toLocaleString('ru')}`}
              >
                <Icon name="wifi" size={12} />
                <span>Сохранённая версия</span>
              </span>
            ) : null}
          </div>
        </div>
        <div class="catalog-view-tools">
          <Button
            aria-label={layout === 'grid' ? 'Показать списком' : 'Показать сеткой'}
            onClick={toggleLayout}
            variant="icon"
          >
            <Icon name={layout === 'grid' ? 'list' : 'grid'} size={19} />
          </Button>
          <label class="sort-label">
            <span>Сортировка</span>
            <Select aria-label="Сортировка" value={filters.sort} onChange={changeSort}>
              <option value="views">По популярности</option>
              <option value="top">Топ YummyAnime</option>
              <option value="rating">По рейтингу</option>
              <option value="rating_counters">По числу оценок</option>
              <option value="year">По году</option>
              <option value="title">По алфавиту</option>
              <option value="id">Недавно добавлены</option>
              <option value="random">Случайно</option>
            </Select>
          </label>
        </div>
      </div>
      {resource.loading ? (
        <Skeleton count={12} gallery />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : (
        <>
          <VirtualGrid
            items={items}
            itemKey={animeKey}
            active={active}
            layout={layout === 'grid' ? 'grid' : 'list'}
            renderItem={renderAnime}
          />
          {!items.length && (
            <Empty
              title="Ничего не найдено"
              action={<ButtonLink href="#/catalog">Сбросить фильтры</ButtonLink>}
            >
              Попробуй другое название или измени фильтры.
            </Empty>
          )}
          <AutoLoad
            enabled={!!canLoadMore && active}
            loading={loadingMore}
            error={moreError}
            load={loadMore}
          >
            <div class="catalog-loading-page">
              {layout === 'grid' ? (
                <Skeleton count={8} gallery />
              ) : (
                <div role="status" aria-label="Загрузка аниме">
                  {[0, 1, 2, 3].map(key => (
                    <div class="result-skeleton" key={key}>
                      <div class="skeleton" />
                      <div>
                        <div class="skeleton line" />
                        <div class="skeleton line short" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AutoLoad>
        </>
      )}
      {expanded && <FilterSheet query={query} initialSection={expanded} close={closeFilters} />}
    </section>
  );
};
