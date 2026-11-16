import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { animeSchedule, peekAnimeSchedule } from '~/lib/api';
import { useResource } from '~/lib/hooks';

import { Poster } from './Poster';
import { Empty, ErrorState, Icon, Skeleton } from '~/ui';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function dayKey(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('en-CA');
}

export const Schedule: FC = () => {
  const resource = useResource(signal => animeSchedule(signal), [], peekAnimeSchedule);

  useEffect(() => {
    const refresh = () => resource.retry();

    window.addEventListener('online', refresh);

    return () => window.removeEventListener('online', refresh);
  }, []);

  const [selected, setSelected] = useState(() => new Date().toLocaleDateString('en-CA'));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();

    date.setDate(date.getDate() + index);

    return date;
  });
  const data = (resource.value?.data || [])
    .filter(anime => anime.episodes?.next_date && dayKey(anime.episodes.next_date) === selected)
    .sort((a, b) => a.episodes!.next_date! - b.episodes!.next_date!);

  let scheduleStatus = '';

  if (resource.loading) scheduleStatus = 'Загружаем расписание…';
  else if (resource.refreshing) scheduleStatus = 'Обновляем расписание в фоне…';
  else if (resource.value?.cached) {
    const savedAt = new Date(resource.value.savedAt).toLocaleString('ru', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    scheduleStatus = `Сохранённое расписание от ${savedAt}`;
  }

  return (
    <>
      <div class="page-heading">
        <p class="eyebrow">НИ ОДНОЙ ПРОПУЩЕННОЙ ПРЕМЬЕРЫ</p>
        <h1>Расписание</h1>
        <p>
          Новые серии любимых историй. Время по твоему устройству: {zone}.
          <span class="schedule-status" role="status" aria-live="polite" aria-atomic="true">
            {scheduleStatus}
          </span>
        </p>
      </div>
      <div class="schedule-days">
        {days.map((day, i) => (
          <button
            class={selected === day.toLocaleDateString('en-CA') ? 'selected' : ''}
            onClick={() => setSelected(day.toLocaleDateString('en-CA'))}
          >
            <span>{i === 0 ? 'Сегодня' : day.toLocaleDateString('ru', { weekday: 'short' })}</span>
            <strong>{day.getDate()}</strong>
            <small>{day.toLocaleDateString('ru', { month: 'short' })}</small>
          </button>
        ))}
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : (
        <>
          <div class="schedule-list">
            {data.map(anime => (
              <a class="schedule-card" href={`#/anime/${anime.anime_id}`} key={anime.anime_id}>
                <time dateTime={new Date(anime.episodes!.next_date! * 1000).toISOString()}>
                  {new Date(anime.episodes!.next_date! * 1000).toLocaleTimeString('ru', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <div class="schedule-poster">
                  <Poster anime={anime} />
                </div>
                <div>
                  <span class="eyebrow">СЕРИЯ {(anime.episodes?.aired || 0) + 1}</span>
                  <h2>{anime.title}</h2>
                  <p>Ориентировочное время выхода</p>
                </div>
                <Icon name="chevron" size={19} />
              </a>
            ))}
          </div>
          {!data.length && (
            <Empty icon="calendar" title="Немного тишины в эфире">
              На этот день в Yummy пока нет запланированных серий. Самое время наверстать
              отложенное.
            </Empty>
          )}
          <p class="collection-note">
            Расписание показывает время японской премьеры из Yummy. Озвучка может появиться позже.
          </p>
        </>
      )}
    </>
  );
};
