import type { FunctionalComponent as FC } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { peekAnimeDetail } from '~/lib/api';
import { useLibrary, useSession } from '~/lib/hooks';
import { setPersonalRating } from '~/lib/library';
import { personalRating } from '~/lib/ratings';
import { getSession } from '~/lib/session';
import type { Anime } from '~/lib/types';
import { Button, ButtonLink, FormError } from '~/ui';
import './PersonalRating.css';

export const PersonalRating: FC<{ anime: Anime; saved: () => void }> = props => {
  const session = useSession();
  return <RatingControl key={`${props.anime.anime_id}:${session?.token || 'guest'}`} {...props} />;
};

const RatingControl: FC<{ anime: Anime; saved: () => void }> = ({ anime, saved }) => {
  const session = useSession();
  const library = useLibrary();
  const [confirmed, setConfirmed] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  const token = session?.token;
  const entry =
    library.rated?.find(value => value.anime_id === anime.anime_id) ||
    Object.values(library.lists || {})
      .flat()
      .find(value => value.anime_id === anime.anime_id) ||
    library.favorites.find(value => value.anime_id === anime.anime_id);
  const cached = session?.verified ? peekAnimeDetail(anime.anime_id)?.data : undefined;
  const value =
    confirmed ??
    personalRating(
      typeof entry?.user?.rating === 'number'
        ? entry
        : typeof cached?.user?.rating === 'number'
          ? cached
          : anime
    );
  const verified = !session || session.verified;
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );
  const save = async (rating: number | null) => {
    if (pending.current || !verified) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await setPersonalRating(anime, rating);
      if (!alive.current || getSession()?.token !== token) return;
      setConfirmed(rating || 0);
      if (session) saved();
    } catch (error) {
      if (alive.current && getSession()?.token === token) setError((error as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section class="personal-rating" aria-label="Моя оценка">
      <div class="personal-rating-heading">
        <strong>Моя оценка</strong>
        <span role="status">
          {busy ? 'Сохраняем…' : value ? `${value} / 10` : 'Пока не оценено'}
        </span>
      </div>
      <fieldset
        disabled={busy || !verified}
        aria-label="Оценить аниме"
        class="personal-rating-choices"
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map(rating => (
          <button
            key={rating}
            type="button"
            aria-label={`Оценить на ${rating} из 10`}
            aria-pressed={value === rating}
            onClick={() => void save(rating)}
          >
            {rating}
          </button>
        ))}
      </fieldset>
      <div class="personal-rating-actions">
        {!!value && (
          <Button
            type="button"
            variant="text"
            disabled={busy || !verified}
            onClick={() => void save(null)}
          >
            Снять оценку
          </Button>
        )}
        <ButtonLink variant="text" href="#/profile?tab=collection&list=rated&sort=user_rating">
          Мой топ
        </ButtonLink>
      </div>
      {error && <FormError>{error}</FormError>}
    </section>
  );
};
