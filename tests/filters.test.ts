import { describe, expect, it } from 'vitest';
import {
  catalogParams,
  filterCount,
  filterQuery,
  parseCatalogQuery,
  validateFilters,
} from '~/lib/filters';

describe('full catalog filters', () => {
  it('preserves multi-select include/exclude filters and all ranges', () => {
    const filters = parseCatalogQuery(
      'genres=fentezi,romantika&exclude_genres=ugasy&types=tv,movie&season=fall&translates=dubbing,subtitles&min_age=3&from_year=2000&to_year=2026&ep_from=12&ep_to=24&min_rating=8.2&max_rating=10&min_rating_counters=100&exclude_list=watched,favourite'
    );

    expect(catalogParams(filters)).toMatchObject({
      genres: 'fentezi,romantika',
      exclude_genres: 'ugasy',
      types: 'tv,movie',
      season: 'fall',
      translates: 'dubbing,subtitles',
      min_age: '3',
      from_year: '2000',
      to_year: '2026',
      ep_from: '12',
      ep_to: '24',
      min_rating: '8.2',
      exclude_list: 'watched,favourite',
    });
    expect(parseCatalogQuery(filterQuery(filters))).toEqual(filters);
    expect(validateFilters(filters)).toBe('');
  });
  it('keeps legacy year links and custom sort direction working', () => {
    expect(
      catalogParams(parseCatalogQuery('year=2020&sort=title&sort_forward=false'))
    ).toMatchObject({ from_year: '2020', to_year: '2020', sort: 'title', sort_forward: false });
    expect(catalogParams(parseCatalogQuery('sort=top')).sort_forward).toBe(true);
  });
  it('rejects impossible ranges without losing valid zeroes', () => {
    expect(validateFilters(parseCatalogQuery('from_year=2026&to_year=2000'))).toContain(
      'меньше или равно'
    );
    expect(validateFilters(parseCatalogQuery('min_rating=11'))).toContain('от 0 до 10');
    expect(validateFilters(parseCatalogQuery('ep_from=0&ep_to=12'))).toBe('');
    expect(catalogParams(parseCatalogQuery('ep_from=0')).ep_from).toBe('0');
  });
  it('does not count search and sorting as active content filters', () => {
    expect(filterCount(parseCatalogQuery('q=one&sort=year&sort_forward=false'))).toBe(0);
    expect(filterCount(parseCatalogQuery('genres=fentezi&exclude_genres=ugasy'))).toBe(2);
  });
});
