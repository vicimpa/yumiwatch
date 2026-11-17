import type { FunctionalComponent as FC } from 'preact';
import { ratingDistribution, type RatingCount } from '~/lib/ratings';
import './RatingDistribution.css';

const compactCount = new Intl.NumberFormat('ru', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const RatingDistribution: FC<{ values: RatingCount[]; empty: string }> = ({
  values,
  empty,
}) => {
  const { counts, total, average, max } = ratingDistribution(values);
  if (!total) return <p class="rating-distribution-empty">{empty}</p>;

  const label = (count: number, index: number) =>
    `${index + 1} из 10 — ${count.toLocaleString('ru')} оценок · ${((count / total) * 100).toLocaleString('ru', { maximumFractionDigits: 1 })}%`;

  return (
    <div class="rating-distribution">
      <p class="rating-distribution-average">
        <strong>{average.toFixed(1)}</strong>
        <span>
          средняя оценка
          <br />
          {total.toLocaleString('ru')} оценок
        </span>
      </p>
      <div
        class="rating-distribution-chart"
        role="img"
        aria-label={`Распределение ${total} оценок. Средняя оценка ${average.toFixed(1)}. ${counts.map(label).join('; ')}`}
      >
        {counts.map((count, index) => (
          <div key={index} title={label(count, index)}>
            <small>{count ? (count >= 10_000 ? compactCount.format(count) : count) : ''}</small>
            <span>
              <i style={{ height: `${(count / max) * 100}%` }} />
            </span>
            <b>{index + 1}</b>
          </div>
        ))}
      </div>
    </div>
  );
};
