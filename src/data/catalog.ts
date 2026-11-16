export const TYPES = [
  ['tv', 'ТВ-сериал'],
  ['movie', 'Фильм'],
  ['ova', 'OVA'],
  ['ona', 'ONA'],
  ['special', 'Спешл'],
  ['shorttv', 'Короткий сериал'],
  ['shortfilm', 'Короткий фильм'],
];
export const STATUSES = [
  ['ongoing', 'Онгоинг'],
  ['released', 'Вышел'],
  ['announcement', 'Анонс'],
];
export const SEASONS = [
  ['winter', 'Зима'],
  ['spring', 'Весна'],
  ['summer', 'Лето'],
  ['fall', 'Осень'],
];
export const TRANSLATES = [
  ['dubbing', 'Дубляж'],
  ['multivoice', 'Многоголосая'],
  ['onevoice', 'Одноголосая'],
  ['twovoice', 'Двухголосая'],
  ['subtitles', 'Субтитры'],
];
export const AGES = [
  ['1', 'G · все возрасты'],
  ['2', 'PG · дети'],
  ['3', 'PG-13 · 13+'],
  ['4', 'R · 17+'],
  ['5', 'R+ · 18+'],
];
export const LISTS = [
  ['watch_now', 'Смотрю'],
  ['will', 'В планах'],
  ['watched', 'Просмотрено'],
  ['lost', 'Брошено'],
  ['postpone', 'Отложено'],
  ['favourite', 'Избранное'],
];

export const FILTER_SECTIONS = [
  ['main', 'Основное'],
  ['genres', 'Жанры'],
  ['rating', 'Рейтинг'],
  ['lists', 'Мои списки'],
];

export const FILTER_LABELS: Partial<Record<string, string>> = {
  ongoing: 'Онгоинг',
  released: 'Вышел',
  announcement: 'Анонс',
  tv: 'ТВ-сериал',
  movie: 'Фильм',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Спешл',
  shorttv: 'Короткий сериал',
  shortfilm: 'Короткий фильм',
  winter: 'Зима',
  spring: 'Весна',
  summer: 'Лето',
  fall: 'Осень',
  autumn: 'Осень',
  dubbing: 'Дубляж',
  multivoice: 'Многоголосая',
  onevoice: 'Одноголосая',
  twovoice: 'Двухголосая',
  subtitles: 'Субтитры',
};

export const FILTER_RANGES = [
  { from: 'from_year', to: 'to_year', min: 1900, max: 2100, label: 'Год', chip: 'Годы' },
  { from: 'ep_from', to: 'ep_to', min: 0, max: 10000, label: 'Количество серий', chip: 'Серии' },
  { from: 'min_rating', to: 'max_rating', min: 0, max: 10, label: 'Рейтинг', chip: 'Рейтинг' },
  {
    from: 'min_rating_counters',
    to: 'max_rating_counters',
    min: 0,
    max: 1000000000,
    label: 'Количество оценок',
    chip: 'Оценки',
  },
] as const;

export const CURRENT_SEASONS = [
  { value: 'winter', title: 'Зимний' },
  { value: 'spring', title: 'Весенний' },
  { value: 'summer', title: 'Летний' },
  { value: 'fall', title: 'Осенний' },
];
