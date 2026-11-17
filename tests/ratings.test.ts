import { expect, it } from 'vitest';
import { ratingDistribution } from '~/lib/ratings';

it('fills missing scores, merges duplicates and ignores invalid buckets', () => {
  expect(
    ratingDistribution([
      { rating: 10, count: 2 },
      { rating: 10, count: 1 },
      { rating: 2, count: 1 },
      { rating: 0, count: 100 },
      { rating: 11, count: 100 },
      { rating: 1.5, count: 100 },
      { rating: 1, count: -100 },
      { rating: 3, count: '4' },
      { rating: 4, count: Infinity },
      { rating: 5, count: 0.5 },
      null,
    ])
  ).toEqual({ counts: [0, 1, 0, 0, 0, 0, 0, 0, 0, 3], total: 4, average: 8, max: 3 });
  expect(ratingDistribution(null)).toMatchObject({ total: 0, average: 0, max: 1 });
});
