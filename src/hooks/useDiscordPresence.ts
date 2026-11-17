import { useEffect, useMemo } from 'preact/hooks';

import { DiscordPresence, type PresencePlayback } from '~/core/DiscordPresence';
import { imageUrl } from '~/lib/api';
import {
  discordPresence,
  discordPresenceAvailable,
  discordPresenceEnabled,
} from '~/lib/discord-presence';
import type { Anime, Video } from '~/lib/types';

export function useDiscordPresence(
  anime: Anime,
  video: Video | undefined,
  playback: PresencePlayback | undefined
) {
  const presence = useMemo(() => {
    if (!video || !discordPresenceAvailable()) return;

    return new DiscordPresence(
      anime,
      video,
      imageUrl(anime.poster?.big || anime.poster?.medium),
      () => discordPresence.publish(),
      discordPresenceEnabled
    );
  }, [anime.anime_id, video?.video_id]);

  useEffect(() => {
    if (!presence) return;

    const unregister = discordPresence.register(100, () => presence.current);

    return () => {
      unregister();
      presence.dispose();
    };
  }, [presence]);

  useEffect(() => {
    presence?.update(playback || { position: 0, duration: 0, playing: false, reason: 'buffering' });
  }, [
    presence,
    playback?.position,
    playback?.duration,
    playback?.playing,
    playback?.reason,
    playback?.playbackRate,
  ]);
}
