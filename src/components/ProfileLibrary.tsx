import { animeSiteUrl } from '~/lib/content-links';
import { AppLink } from '~/ui/AppLink';
import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { yummyFetch } from '~/lib/api';
import { navigateGallery } from '~/lib/gallery-navigation';
import { useLibrary, useResource, useSession } from '~/lib/hooks';
import { clearHistory, loadMoreHistory, normalizeAnime, syncLibrary } from '~/lib/library';
import { notify } from '~/lib/notifications';
import { formatTime } from '~/lib/player';
import { SUBSCRIPTIONS_EVENT } from '~/lib/social';
import type { Anime } from '~/lib/types';
import { cardMenuEvents } from '~/lib/card-context';
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
  SectionHeading,
  Skeleton,
} from '~/ui';

export const ProfileSubscriptions: FC = () => {
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
  useEffect(() => {
    window.addEventListener(SUBSCRIPTIONS_EVENT, resource.retry);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, resource.retry);
  }, [resource.retry]);

  if (!session)
    return (
      <Empty
        icon="heart"
        title="Подписки живут в твоём аккаунте"
        action={
          <ButtonLink href="#/account?next=%2Fprofile%3Ftab%3Dsubscriptions" variant="primary">
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
        <AppLink
          class="subscription-card"
          href={`#/anime/${anime.anime_id}`}
          publicHref={animeSiteUrl(anime)}
          key={`${anime.anime_id}:${index}`}
          {...cardMenuEvents(anime)}
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
        </AppLink>
      ))}
    </div>
  ) : (
    <Empty icon="heart" title="Подписок пока нет">
      Подписки на озвучки, добавленные на YummyAnime, появятся здесь.
    </Empty>
  );
};

export const ProfileHistory: FC = () => {
  const library = useLibrary();
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const history = useMemo(
    () =>
      library.history.filter(entry =>
        entry.anime.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      ),
    [library.history, search]
  );
  const confirmClearHistory = () => {
    try {
      clearHistory();
      setConfirmClear(false);
      notify('История очищена');
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const cancelClearHistory = () => setConfirmClear(false);
  const requestClearHistory = () => setConfirmClear(true);
  return (
    <section class="profile-panel profile-history" onKeyDown={navigateGallery}>
      <SectionHeading
        title="История просмотра"
        subtitle="Продолжи с того места, где остановился."
      />
      {library.error && (
        <FormError>
          {library.error}
          <Button onClick={() => void syncLibrary()} variant="text">
            Повторить
          </Button>
        </FormError>
      )}
      {library.loading && !library.syncedAt && !library.history.length ? (
        <Skeleton />
      ) : (
        <>
          {library.history.length > 0 && (
            <div class="collection-search">
              <Icon name="search" size={19} />
              <Input
                type="search"
                {...SEARCH_INPUT_PROPS}
                aria-label="Найти в истории"
                placeholder="Найти в истории"
                value={search}
                onInput={event => setSearch(event.currentTarget.value)}
              />
              {search && (
                <Button
                  aria-label="Очистить поиск в истории"
                  onClick={() => setSearch('')}
                  variant="icon"
                >
                  <Icon name="close" size={17} />
                </Button>
              )}
            </div>
          )}
          {history.length ? (
            <>
              <div class="history-list">
                {history.map(entry => (
                  <AppLink
                    class="history-card"
                    href={`#/anime/${entry.anime.anime_id}?view=watch&play=1`}
                    publicHref={animeSiteUrl(entry.anime)}
                    key={entry.anime.anime_id}
                    {...cardMenuEvents(entry.anime)}
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
                  </AppLink>
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
          )}
          {library.hasMore && (
            <div class="load-more">
              <Button disabled={library.loadingMore} onClick={() => void loadMoreHistory()}>
                {library.loadingMore ? 'Загружаем…' : 'Ещё история'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
