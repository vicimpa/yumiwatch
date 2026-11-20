import { useWatchFrame } from '~/hooks/useWatchFrame';
import { imageUrl } from '~/lib/api';
import { useSession } from '~/lib/hooks';
import type { WatchEntry } from '~/lib/types';
import { watchFrameKey } from '~/lib/watch-frames';
import { ArtworkImage } from '~/ui';

export function WatchPreview({ entry }: { entry: WatchEntry }) {
  const session = useSession();
  const { anime, episode, preview } = entry;
  const frame = useWatchFrame(watchFrameKey(anime.anime_id, episode, session?.user.id));

  if (frame)
    return (
      <span class="poster-artwork is-loaded">
        <img src={frame} alt="" loading="lazy" decoding="async" />
      </span>
    );

  return (
    <ArtworkImage
      src={imageUrl(preview || anime.poster?.big || anime.poster?.medium)}
      alt=""
      tone={anime.anime_id}
    />
  );
}
