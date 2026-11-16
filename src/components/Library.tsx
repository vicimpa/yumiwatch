import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { yummyFetch } from '~/lib/api';
import { navigateGallery } from '~/lib/gallery-navigation';
import { useLibrary, useResource, useSession } from '~/lib/hooks';
import {
  clearHistory,
  loadMoreHistory,
  normalizeAnime,
  setAnimeList,
  syncLibrary,
} from '~/lib/library';
import { WATCH_LISTS, type WatchListId } from '~/lib/lists';
import { notify } from '~/lib/notifications';
import { formatTime } from '~/lib/player';
import type { Anime } from '~/lib/types';

import { AnimeCard } from './AnimeCard';
import { FavoriteButton } from './FavoriteButton';
import { Poster } from './Poster';
import {
  Button,
  ButtonLink,
  Empty,
  ErrorState,
  FormError,
  Icon,
  Input,
  SEARCH_INPUT_PROPS,
  Sheet,
  Skeleton,
  VirtualGrid,
} from '~/ui';

const tabs: Partial<Record<string, { title: string; hint: string }>> = {
  history: { title: 'История просмотра', hint: 'Продолжи с того места, где остановился.' },
  favorites: { title: 'Избранное', hint: 'Те самые истории, к которым хочется возвращаться.' },
  subscriptions: { title: 'Подписки на озвучки', hint: 'Твои подписки с YummyAnime.' },
};

const EMPTY_ANIMES: Anime[] = [];

export type TAnimeListButtonProps = { anime: Anime };

export const AnimeListButton: FC<TAnimeListButtonProps> = ({ anime }) => {
  const library = useLibrary();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = WATCH_LISTS.find(list =>
    library.lists?.[list.id]?.some(value => value.anime_id === anime.anime_id)
  );

  const choose = useCallback(
    async (id: WatchListId | null) => {
      if (busy) return;
      if (id === (selected?.id ?? null)) {
        setOpen(false);

        return;
      }
      setBusy(true);
      setError('');
      try {
        await setAnimeList(anime, id);
        setOpen(false);
        notify(
          id === null
            ? 'Убрано из списка'
            : `Добавлено в «${WATCH_LISTS.find(list => list.id === id)!.title}»`
        );
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, selected, anime]
  );

  const openLists = useCallback(() => {
    setError('');
    setOpen(true);
  }, []);

  const closeLists = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  const clearList = useCallback(() => void choose(null), [choose]);

  return (
    <div class="detail-list-control">
      <Button
        aria-haspopup="dialog"
        disabled={library.loading}
        onClick={openLists}
        class="list-status-button"
      >
        <Icon name={selected ? 'check' : 'list'} size={17} />
        {selected?.title || 'Добавить в список'}
        <Icon name="chevron" size={15} />
      </Button>
      {open && (
        <Sheet
          title="В мою коллекцию"
          subtitle={anime.title}
          close={closeLists}
          className="list-picker"
        >
          <p class="filter-help">
            {library.account
              ? 'Сохраним в твоём аккаунте YummyAnime.'
              : 'Сохраним на этом устройстве. Гостевые списки хранятся отдельно от аккаунта.'}
          </p>
          {error && <FormError class="sheet-validation">{error}</FormError>}
          <div class="source-options">
            {WATCH_LISTS.map(list => (
              <button
                key={list.id}
                class={`source-option ${selected?.id === list.id ? 'selected' : ''}`}
                disabled={busy}
                aria-pressed={selected?.id === list.id}
                onClick={() => void choose(list.id)}
              >
                <span>
                  <strong style={{ color: list.color }}>{list.title}</strong>
                  <small>{list.hint}</small>
                </span>
                {selected?.id === list.id && <Icon name="check" size={20} />}
              </button>
            ))}
            {selected && (
              <button class="source-option" disabled={busy} onClick={clearList}>
                <span>
                  <strong>Убрать из списка</strong>
                  <small>Избранное и история останутся</small>
                </span>
                <Icon name="close" size={19} />
              </button>
            )}
          </div>
          <div class="list-picker-favorite">
            <p>Любимые аниме можно сохранить отдельно.</p>
            <FavoriteButton anime={anime} />
          </div>
          {busy && (
            <p role="status" class="filter-help">
              Сохраняем…
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
};

const Subscriptions: FC = () => {
  const session = useSession();
  const resource = useResource(
    async signal => {
      if (!session?.verified)
        return {
          data: [] as (Anime & { sub?: { player?: string; dubbing?: string } })[],
          cached: false,
          savedAt: 0,
        };

      const data = await yummyFetch<(Anime & { sub?: { player?: string; dubbing?: string } })[]>(
        `/users/${session.user.id}/lists/subs`,
        { token: session.token, signal }
      );

      if (!Array.isArray(data)) throw new Error('Не удалось прочитать подписки.');

      return {
        data: data.map(value => ({ ...normalizeAnime(value), sub: value.sub })),
        cached: false,
        savedAt: Date.now(),
      };
    },
    [session?.token, session?.verified]
  );

  if (!session)
    return (
      <Empty
        icon="heart"
        title="Подписки живут в твоём аккаунте"
        action={
          <ButtonLink href="#/account?next=%2Flibrary%3Ftab%3Dsubscriptions" variant="primary">
            Войти в YummyAnime
          </ButtonLink>
        }
      >
        После входа здесь появятся подписки на озвучки с сайта.
      </Empty>
    );
  if (!session.verified || resource.loading) return <Skeleton />;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.retry} />;

  const values = resource.value?.data || [];

  return values.length ? (
    <div class="subscription-list">
      {values.map((anime, index) => (
        <a
          class="subscription-card"
          href={`#/anime/${anime.anime_id}`}
          key={`${anime.anime_id}:${index}`}
        >
          <div class="history-poster">
            <Poster anime={anime} />
          </div>
          <div>
            <h2>{anime.title}</h2>
            <p>
              {[anime.sub?.dubbing, anime.sub?.player].filter(Boolean).join(' · ') ||
                'Подписка на новые серии'}
            </p>
          </div>
          <Icon name="chevron" size={18} />
        </a>
      ))}
    </div>
  ) : (
    <Empty icon="heart" title="Подписок пока нет">
      Подписки на озвучки, добавленные на YummyAnime, появятся здесь.
    </Empty>
  );
};

export type TLibraryPageProps = { query: string };

export const LibraryPage: FC<TLibraryPageProps> = ({ query }) => {
  const library = useLibrary();
  const tab = new URLSearchParams(query).get('tab') || '';
  const selected = WATCH_LISTS.find(list => list.alias === tab);
  const historyTab = tab === 'history';
  const favoritesTab = tab === 'favorites';
  const subscriptionsTab = tab === 'subscriptions';
  const overview = !selected && !historyTab && !favoritesTab && !subscriptionsTab;
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setSearch('');
    setConfirmClear(false);
  }, [tab]);

  const title = selected?.title || tabs[tab]?.title || 'Моя коллекция';
  const description = overview
    ? 'Сейчас, потом или навсегда — у каждой истории своё место.'
    : selected?.hint || tabs[tab]?.hint;
  const animes = favoritesTab
    ? library.favorites
    : selected
      ? library.lists?.[selected.id] || EMPTY_ANIMES
      : EMPTY_ANIMES;

  const matching = useCallback(
    (anime: Anime) => anime.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    [search]
  );

  const filtered = useMemo(() => animes.filter(matching), [animes, matching]);
  const history = useMemo(
    () => library.history.filter(entry => matching(entry.anime)),
    [library.history, matching]
  );

  const refreshLibrary = useCallback(() => void syncLibrary(), []);

  const changeSearch = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => setSearch(event.currentTarget.value),
    []
  );

  const clearSearch = useCallback(() => setSearch(''), []);

  const confirmClearHistory = useCallback(() => {
    try {
      clearHistory();
      setConfirmClear(false);
      notify('История очищена');
    } catch (error) {
      notify((error as Error).message);
    }
  }, []);

  const cancelClearHistory = useCallback(() => setConfirmClear(false), []);

  const requestClearHistory = useCallback(() => setConfirmClear(true), []);

  const animeKey = useCallback((anime: Anime) => anime.anime_id, []);

  const renderAnime = useCallback((anime: Anime) => <AnimeCard anime={anime} />, []);

  const loadHistory = useCallback(() => void loadMoreHistory(), []);

  return (
    <section class="library-gallery" onKeyDown={navigateGallery}>
      {!overview && (
        <a class="back-link" href="#/library">
          <Icon name="back" size={17} />
          Все списки
        </a>
      )}
      <div class="page-heading library-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div class="library-account-bar">
        <p class="collection-note">
          {library.account
            ? 'Коллекция твоего аккаунта YummyAnime'
            : 'Гостевая коллекция на этом устройстве'}
        </p>
        {library.account ? (
          <Button disabled={library.loading} onClick={refreshLibrary} variant="text">
            <Icon name="refresh" size={15} />
            {library.loading ? 'Обновляем…' : 'Обновить'}
          </Button>
        ) : (
          <ButtonLink href="#/account" variant="text">
            Войти
            <Icon name="arrow" size={15} />
          </ButtonLink>
        )}
      </div>
      {library.error && (
        <FormError class="account-error" as="div">
          {library.error}
          <Button onClick={refreshLibrary} variant="text">
            Повторить
          </Button>
        </FormError>
      )}
      {overview ? (
        <div class="library-list-grid">
          {WATCH_LISTS.map(list => (
            <a
              href={`#/library?tab=${list.alias}`}
              key={list.id}
              class="library-list-tile"
              style={{ '--list-color': list.color }}
            >
              <div>
                <span class="list-tile-icon">
                  <Icon name={list.icon} size={23} />
                </span>
                <strong>{library.lists?.[list.id]?.length || 0}</strong>
              </div>
              <h2>{list.title}</h2>
              <p>{list.hint}</p>
            </a>
          ))}
          <a
            class="library-list-tile"
            href="#/library?tab=favorites"
            style={{ '--list-color': '#e6a3b6' }}
          >
            <div>
              <span class="list-tile-icon">
                <Icon name="heart" size={23} />
              </span>
              <strong>{library.favorites.length}</strong>
            </div>
            <h2>Избранное</h2>
            <p>Любимые аниме, отдельно от статуса</p>
          </a>
          <a
            class="library-list-tile"
            href="#/library?tab=history"
            style={{ '--list-color': '#8dbbc9' }}
          >
            <div>
              <span class="list-tile-icon">
                <Icon name="clock" size={23} />
              </span>
              <strong>
                {library.history.length}
                {library.hasMore ? '+' : ''}
              </strong>
            </div>
            <h2>История</h2>
            <p>Серии и сохранённое время</p>
          </a>
          <a
            class="library-list-tile"
            href="#/library?tab=subscriptions"
            style={{ '--list-color': '#d0b58b' }}
          >
            <div>
              <span class="list-tile-icon">
                <Icon name="list" size={23} />
              </span>
              <Icon name="chevron" size={19} />
            </div>
            <h2>Подписки</h2>
            <p>Следи за любимыми озвучками</p>
          </a>
        </div>
      ) : subscriptionsTab ? (
        <Subscriptions />
      ) : library.loading && !library.syncedAt && !(historyTab && history.length) ? (
        <div class="account-loading" role="status">
          Загружаем коллекцию аккаунта…
          <br />
          <ButtonLink href="#/account" variant="text">
            Проверить вход в аккаунт
          </ButtonLink>
        </div>
      ) : (
        <>
          {(animes.length > 0 || (historyTab && library.history.length > 0)) && (
            <div class="collection-search">
              <Icon name="search" size={19} />
              <Input
                type="search"
                {...SEARCH_INPUT_PROPS}
                aria-label="Найти в списке"
                placeholder="Найти в этом списке"
                value={search}
                onInput={changeSearch}
              />
              {search && (
                <Button aria-label="Очистить поиск в списке" onClick={clearSearch} variant="icon">
                  <Icon name="close" size={17} />
                </Button>
              )}
            </div>
          )}
          {historyTab ? (
            history.length ? (
              <>
                <div class="history-list">
                  {history.map(entry => (
                    <a
                      class="history-card"
                      href={`#/anime/${entry.anime.anime_id}?view=watch&play=1`}
                      key={entry.anime.anime_id}
                    >
                      <div class="history-poster">
                        <Poster anime={entry.anime} />
                      </div>
                      <div class="history-copy">
                        <span class="eyebrow">СЕРИЯ {entry.episode}</span>
                        <h2>{entry.anime.title}</h2>
                        <p>
                          {entry.position
                            ? `${formatTime(entry.position)}${entry.duration ? ` / ${formatTime(entry.duration)}` : ''} · `
                            : ''}
                          {new Date(entry.updatedAt).toLocaleDateString('ru', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                        {!!entry.duration && (
                          <div class="history-progress">
                            <span
                              style={{
                                width: `${Math.min(100, ((entry.position || 0) / entry.duration) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <span class="continue-play">
                        <Icon name="play" size={20} />
                      </span>
                    </a>
                  ))}
                </div>
                {library.account ? (
                  <div class="clear-history">
                    <ButtonLink
                      href="https://ru.yummyani.me/watch-history"
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                    >
                      Управлять историей на YummyAnime
                      <Icon name="external" size={15} />
                    </ButtonLink>
                  </div>
                ) : (
                  <div class="clear-history">
                    {confirmClear ? (
                      <>
                        <p>Удалить историю на этом устройстве?</p>
                        <Button onClick={confirmClearHistory}>Удалить историю</Button>
                        <Button onClick={cancelClearHistory} variant="text">
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <Button onClick={requestClearHistory} variant="text">
                        <Icon name="trash" size={16} />
                        Очистить историю
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Empty
                icon="clock"
                title={search ? 'В истории не нашлось' : 'Здесь продолжится твоя история'}
                action={
                  !search && (
                    <ButtonLink href="#/catalog" variant="primary">
                      Выбрать аниме
                      <Icon name="arrow" size={18} />
                    </ButtonLink>
                  )
                }
              >
                {search
                  ? 'Попробуй короткую часть названия.'
                  : 'Открой первую серию — мы запомним её и озвучку.'}
              </Empty>
            )
          ) : filtered.length ? (
            <VirtualGrid items={filtered} itemKey={animeKey} renderItem={renderAnime} />
          ) : (
            <Empty
              icon="heart"
              title={search ? 'В списке не нашлось' : 'Пока ни одной истории'}
              action={
                !search && (
                  <ButtonLink href="#/catalog" variant="primary">
                    Найти аниме
                    <Icon name="arrow" size={18} />
                  </ButtonLink>
                )
              }
            >
              {search
                ? 'Попробуй другое название.'
                : 'На странице аниме выбери «Добавить в список».'}
            </Empty>
          )}
          {historyTab && library.hasMore && (
            <div class="load-more">
              <Button disabled={library.loadingMore} onClick={loadHistory}>
                {library.loadingMore ? 'Загружаем…' : 'Ещё история'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
