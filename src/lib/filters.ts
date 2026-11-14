import type { Params } from './types';
export const FILTER_KEYS = ['status', 'types', 'genres', 'exclude_genres', 'season', 'translates', 'min_age', 'from_year', 'to_year', 'ep_from', 'ep_to', 'min_rating', 'max_rating', 'min_rating_counters', 'max_rating_counters', 'exclude_list', 'studio_ids', 'director_ids', 'ids', 'worldart_ids', 'mal_ids', 'kp_ids', 'shikimori_ids'] as const;
export type FilterKey = typeof FILTER_KEYS[number];
export type CatalogFilters = Record<FilterKey | 'q' | 'sort' | 'sort_forward', string>;
export function parseCatalogQuery(query: string): CatalogFilters {
  const params = new URLSearchParams(query);
  const filters = Object.fromEntries([...FILTER_KEYS, 'q', 'sort', 'sort_forward'].map(key => [key, params.get(key) || ''])) as CatalogFilters;
  if (params.get('year')) filters.from_year = filters.to_year = params.get('year')!;
  for (const key of FILTER_KEYS) if (filters[key] === 'all' || (key === 'min_age' && filters[key] === '0')) filters[key] = '';
  filters.sort ||= 'views';
  return filters;
}
export function catalogParams(filters: CatalogFilters): Params {
  return { ...Object.fromEntries(FILTER_KEYS.map(key => [key, filters[key] || undefined])), q: filters.q.trim(), sort: filters.sort, sort_forward: filters.sort_forward ? filters.sort_forward === 'true' : ['top', 'title'].includes(filters.sort) };
}
export function filterQuery(filters: CatalogFilters) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '')).toString();
}
export function filterCount(filters: CatalogFilters) { return FILTER_KEYS.filter(key => filters[key]).length; }
export function validateFilters(filters: CatalogFilters) {
  for (const [from, to, min, max, label] of [
    ['from_year', 'to_year', 1900, 2100, 'Год'], ['ep_from', 'ep_to', 0, 10000, 'Количество серий'], ['min_rating', 'max_rating', 0, 10, 'Рейтинг'], ['min_rating_counters', 'max_rating_counters', 0, 1000000000, 'Количество оценок'],
  ] as const) {
    for (const key of [from, to]) if (filters[key] && (!Number.isFinite(Number(filters[key])) || Number(filters[key]) < min || Number(filters[key]) > max)) return `${label}: допустимое значение от ${min} до ${max}.`;
    if (filters[from] && filters[to] && Number(filters[from]) > Number(filters[to])) return `${label}: значение «от» должно быть меньше или равно «до».`;
  }
  return '';
}
