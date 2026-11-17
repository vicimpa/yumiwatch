import type { FunctionalComponent as FC } from 'preact';
import { animeRatings, peekAnimeRatings } from '~/lib/api';
import { useResource } from '~/lib/hooks';
import { Button, CachedNotice, FormError, SectionHeading } from '~/ui';
import { RatingDistribution } from '~/ui/RatingDistribution';

export const AnimeRatingStats: FC<{ animeId: number }> = ({ animeId }) => {
  const resource = useResource(
    signal => animeRatings(animeId, signal),
    [animeId],
    () => peekAnimeRatings(animeId)
  );
  const error =
    resource.error ||
    (resource.value && !Array.isArray(resource.value.data) ? 'Не удалось прочитать оценки.' : '');

  return (
    <section class="about-ratings" aria-label="Оценки зрителей">
      <SectionHeading title="Оценки зрителей" subtitle="Распределение оценок на YummyAnime" />
      {resource.loading ? (
        <p class="collection-note" role="status">
          Загружаем оценки…
        </p>
      ) : error ? (
        <FormError>
          {error}
          <Button variant="text" onClick={resource.retry}>
            Повторить
          </Button>
        </FormError>
      ) : (
        <>
          <RatingDistribution
            values={resource.value?.data || []}
            empty="У этого аниме пока нет оценок."
          />
          {resource.value?.cached && !resource.refreshing && (
            <CachedNotice savedAt={resource.value.savedAt} />
          )}
        </>
      )}
    </section>
  );
};
