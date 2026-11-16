import type { FunctionalComponent as FC } from 'preact';

import { Icon } from './Icon';

export const CardSkeleton: FC = () => (
  <div class="skeleton-card" aria-hidden="true">
    <div class="skeleton poster-skeleton poster-placeholder">
      <Icon name="spark" size={30} />
    </div>
    <div class="skeleton-caption">
      <span class="skeleton line" />
      <span class="skeleton line short" />
      <span class="skeleton skeleton-meta" />
    </div>
  </div>
);

export type TSkeletonProps = { count?: number; gallery?: boolean };

export const Skeleton: FC<TSkeletonProps> = ({ count = 6, gallery = false }) => (
  <div
    class={`anime-grid ${gallery ? 'gallery-grid' : ''}`}
    role="status"
    aria-label="Загрузка аниме"
  >
    {Array.from({ length: count }, (_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
);
