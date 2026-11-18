import { AppLink } from '~/ui/AppLink';
import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { yummyFetch } from '~/lib/api';
import { useResource, useSession } from '~/lib/hooks';
import { peekProfileData, profileData } from '~/lib/profile-cache';
import { PERSONAL_RATING_EVENT } from '~/lib/ratings';
import {
  calendarDays,
  loadGenreStats,
  peekGenreStats,
  formatWatchTime,
  localGenres,
  profileError,
  type ProfileAnime,
  type UserProfile,
} from '~/lib/profile';
import { Button, Empty, FormError, Icon, SectionHeading } from '~/ui';
import { RatingDistribution } from '~/ui/RatingDistribution';

export const ProfileTaste: FC<{ id?: number; animes: ProfileAnime[] }> = ({ id, animes }) => {
  const session = useSession();
  const resource = useResource(
    async signal =>
      id
        ? loadGenreStats(id, signal)
        : { data: localGenres(animes), cached: false, savedAt: Date.now() },
    [id, session?.token, session?.verified, animes],
    () => (id ? peekGenreStats(id) : undefined)
  );
  const genres = resource.value?.data || [];
  const max = Math.max(1, ...genres.map(genre => genre.count));

  return (
    <section class="profile-panel profile-taste">
      <SectionHeading title="Аниме по душе" subtitle="Жанры в коллекции профиля" />
      {resource.loading ? (
        <p role="status" class="profile-muted">
          Собираем твой спектр жанров…
        </p>
      ) : resource.error ? (
        <FormError>
          {profileError(new Error(resource.error))}
          <Button variant="text" onClick={resource.retry}>
            Повторить
          </Button>
        </FormError>
      ) : genres.length ? (
        <div class="profile-bars">
          {genres.slice(0, 6).map((genre, index) => (
            <AppLink
              key={genre.id}
              href={`#/catalog?genres=${genre.id}`}
              class="profile-genre"
              style={{ '--bar-color': `var(--profile-color-${index % 4})` }}
            >
              <span>
                {genre.title}
                <small>{genre.count}</small>
              </span>
              <span class="profile-bar">
                <i style={{ width: `${(genre.count / max) * 100}%` }} />
              </span>
            </AppLink>
          ))}
        </div>
      ) : (
        <p class="profile-muted">
          Жанры появятся, когда в списках «Смотрю» и «Просмотрено» будут аниме.
        </p>
      )}
    </section>
  );
};

const RatingStats: FC<{ id: number }> = ({ id }) => {
  const session = useSession();
  const resource = useResource(
    async signal =>
      profileData(
        `ratings:${id}`,
        async () => {
          const data = await yummyFetch<{ rating: number; count: number }[]>(
            `/users/${id}/stats/ratings`,
            {
              token: session?.verified ? session.token : undefined,
              signal,
            }
          );
          if (!Array.isArray(data)) throw new Error('Не удалось прочитать оценки.');
          return data.filter(value => value.rating >= 1 && value.rating <= 10 && value.count > 0);
        },
        signal
      ),
    [id, session?.token, session?.verified],
    () => peekProfileData<{ rating: number; count: number }[]>(`ratings:${id}`)
  );
  const values = resource.value?.data || [];
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ userId: number }>).detail.userId === id) resource.retry();
    };
    window.addEventListener(PERSONAL_RATING_EVENT, refresh);
    return () => window.removeEventListener(PERSONAL_RATING_EVENT, refresh);
  }, [id, resource.retry]);

  return (
    <section class="profile-panel">
      <SectionHeading title="Личная шкала" subtitle="Твои оценки, а не рейтинг сайта" />
      {resource.loading ? (
        <p class="profile-muted" role="status">
          Загружаем оценки…
        </p>
      ) : resource.error ? (
        <FormError>
          {resource.error}
          <Button variant="text" onClick={resource.retry}>
            Повторить
          </Button>
        </FormError>
      ) : (
        <RatingDistribution
          values={values}
          empty="Пока нет личных оценок. Оценки, поставленные на YummyAnime, появятся здесь."
        />
      )}
    </section>
  );
};

export const ProfileActivity: FC<{ profile?: UserProfile }> = ({ profile }) => {
  const [period, setPeriod] = useState(182);
  const source = profile?.watches?.history;
  const days = calendarDays(source || [], period);
  const episodes = days.reduce((sum, day) => sum + day.ep_count, 0);
  const seconds = days.reduce((sum, day) => sum + day.duration, 0);
  const active = days.filter(day => day.ep_count > 0 || day.duration > 0).length;
  // API history is at most 180 days; distinguish missing days from inactive ones.
  const available = new Set((source || []).map(day => Math.floor(day.when / 86400)));

  return (
    <section class="profile-panel profile-activity">
      <div class="profile-section-top">
        <SectionHeading title="В твоём ритме" subtitle="Календарь просмотров · дни по UTC" />
        <div class="profile-segment" aria-label="Период активности">
          {[28, 91, 182].map(value => (
            <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>
              {value === 28 ? 'Месяц' : value === 91 ? '3 мес.' : '6 мес.'}
            </button>
          ))}
        </div>
      </div>
      {source ? (
        <>
          <div class="profile-activity-summary">
            <strong>{formatWatchTime(seconds)}</strong>
            <span>
              {episodes.toLocaleString('ru')} серий · {active} дней с аниме
            </span>
          </div>
          <div
            class="profile-calendar-scroll"
            tabIndex={0}
            aria-label="Календарь активности, прокрутка"
          >
            <div
              class="profile-calendar"
              style={{ '--weeks': period / 7 }}
              role="img"
              aria-label={`Активность за ${period} дней: ${episodes} серий, ${active} активных дней`}
            >
              {days.map(day => {
                const known = available.has(Math.floor(day.when / 86400));
                const level = !known
                  ? -1
                  : !day.duration && !day.ep_count
                    ? 0
                    : day.duration < 1800
                      ? 1
                      : day.duration < 5400
                        ? 2
                        : day.duration < 10800
                          ? 3
                          : 4;
                const date = new Date(day.when * 1000).toLocaleDateString('ru', {
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                });
                return (
                  <span
                    key={day.when}
                    data-level={level}
                    title={`${date}: ${known ? `${day.ep_count} серий · ${formatWatchTime(day.duration)}` : 'нет данных'}`}
                  />
                );
              })}
            </div>
          </div>
          <div class="profile-calendar-legend">
            <span>Каждая клетка — один день</span>
            <span>
              Меньше{' '}
              {[0, 1, 2, 3, 4].map(value => (
                <i key={value} data-level={value} />
              ))}{' '}
              Больше
            </span>
          </div>
        </>
      ) : (
        <p class="profile-muted">
          Календарь и точное время просмотров доступны для аккаунтов YummyAnime. Гостевая история
          сохраняет место остановки.
        </p>
      )}
    </section>
  );
};

export const ProfileStats: FC<{ profile?: UserProfile; id?: number; animes: ProfileAnime[] }> = ({
  profile,
  id,
  animes,
}) => {
  const formats = (profile?.watches?.sum || [])
    .filter(value => value.spent_time > 0)
    .sort((a, b) => b.spent_time - a.spent_time);
  const total = formats.reduce((sum, value) => sum + value.spent_time, 0);
  return (
    <div class="profile-stats">
      <ProfileActivity profile={profile} />
      <div class="profile-two-columns">
        <ProfileTaste id={id} animes={animes} />
        <section class="profile-panel">
          <SectionHeading
            title="Время в историях"
            subtitle="Фактическое время просмотра на YummyAnime"
          />
          {formats.length ? (
            <>
              <p class="profile-time-total">
                <Icon name="clock" size={23} />
                <strong>{formatWatchTime(total)}</strong>
                <span>за всё время</span>
              </p>
              <div class="profile-bars">
                {formats.map((format, index) => (
                  <div
                    key={format.value}
                    class="profile-genre"
                    style={{ '--bar-color': `var(--profile-color-${index % 4})` }}
                  >
                    <span>
                      {format.name}
                      <small>{formatWatchTime(format.spent_time)}</small>
                    </span>
                    <span class="profile-bar">
                      <i style={{ width: `${(format.spent_time / total) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p class="profile-muted">Статистика появится после первых просмотров в аккаунте.</p>
          )}
        </section>
      </div>
      {id ? (
        <RatingStats id={id} />
      ) : (
        <Empty icon="clock" title="У каждой истории своё время">
          Войди в аккаунт, чтобы видеть статистику с YummyAnime.
        </Empty>
      )}
    </div>
  );
};
