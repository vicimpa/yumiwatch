import type { Anime } from './types';

export const PERSONAL_RATING_EVENT = 'yumiwatch:personal-rating';
export const personalRating = (anime: Anime | undefined): number => {
  const value = anime?.user?.rating;
  return Number.isInteger(value) && value! >= 1 && value! <= 10 ? value! : 0;
};

export interface RatingCount {
  rating: number;
  count: number;
}

export function ratingDistribution(values: unknown) {
  const counts = Array<number>(10).fill(0);
  if (Array.isArray(values))
    for (const value of values) {
      if (
        value &&
        Number.isInteger(value.rating) &&
        value.rating >= 1 &&
        value.rating <= 10 &&
        Number.isSafeInteger(value.count) &&
        value.count > 0
      )
        counts[value.rating - 1] += value.count;
    }
  const total = counts.reduce((sum, count) => sum + count, 0);
  const average = total
    ? counts.reduce((sum, count, index) => sum + (index + 1) * count, 0) / total
    : 0;
  return { counts, total, average, max: Math.max(1, ...counts) };
}
