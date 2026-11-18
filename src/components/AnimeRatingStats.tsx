import type { ComponentChildren, FunctionalComponent as FC } from 'preact';
import { useEffect } from 'preact/hooks';
import { animeRatings, peekAnimeRatings } from '~/lib/api';
import { useResource } from '~/lib/hooks';
import { PERSONAL_RATING_EVENT } from '~/lib/ratings';
import { Button, CachedNotice, FormError, SectionHeading } from '~/ui';
import { RatingDistribution } from '~/ui/RatingDistribution';

export const AnimeRatingStats: FC<{ animeId: number; children?: ComponentChildren }> = ({
  animeId,
  children,
}) => {
  const resource = useResource(
    signal => animeRatings(animeId, signal),
    [animeId],
    () => peekAnimeRatings(animeId)
  );
  const error =
    resource.error ||
    (resource.value && !Array.isArray(resource.value.data) ? 'Не удалось прочитать оценки.' : '');
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ animeId: number }>).detail.animeId === animeId) resource.retry();
    };
    window.addEventListener(PERSONAL_RATING_EVENT, refresh);
    return () => window.removeEventListener(PERSONAL_RATING_EVENT, refresh);
  }, [animeId, resource.retry]);

  return (
    <section class="about-ratings" aria-label="Оценки аниме">
      <SectionHeading title="Оценки" subtitle="YummyAnime и твоя личная оценка" />
      <div class="about-ratings-layout">
        <div class="about-ratings-content">
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
        </div>
        {children}
      </div>
    </section>
  );
};
