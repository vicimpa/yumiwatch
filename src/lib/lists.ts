export const WATCH_LISTS = [
  {
    id: 0,
    icon: 'play',
    alias: 'watch_now',
    title: 'Смотрю',
    hint: 'Истории, которые сейчас с тобой',
    color: '#e58e9c',
  },
  {
    id: 1,
    icon: 'calendar',
    alias: 'will',
    title: 'В планах',
    hint: 'Для следующего свободного вечера',
    color: '#b5a0e5',
  },
  {
    id: 2,
    icon: 'check',
    alias: 'watched',
    title: 'Просмотрено',
    hint: 'Истории, которые уже закончились',
    color: '#9fc9a5',
  },
  {
    id: 3,
    icon: 'close',
    alias: 'lost',
    title: 'Брошено',
    hint: 'Можно найти что-нибудь ближе',
    color: '#a0a4af',
  },
  {
    id: 5,
    icon: 'clock',
    alias: 'postpone',
    title: 'Отложено',
    hint: 'Вернёшься, когда захочется',
    color: '#dac082',
  },
] as const;

export type WatchListId = (typeof WATCH_LISTS)[number]['id'];

export const isWatchList = (value: unknown): value is WatchListId =>
  WATCH_LISTS.some(list => list.id === value);
