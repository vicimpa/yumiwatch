import { useEffect, useMemo, useRef } from 'preact/hooks';

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
  const registered = useRef<DiscordPresence>();
  const presence = useMemo(() => {
    if (!video || !discordPresenceAvailable()) return;

    return new DiscordPresence(
      anime,
      video,
      imageUrl(anime.poster?.big || anime.poster?.medium),
      () => discordPresence.publish(),
      discordPresenceEnabled
    );
  }, [anime.anime_id, video?.video_id, video?.data.dubbing]);

  useEffect(() => {
    const previous = registered.current;
    registered.current = presence;
    if (presence)
      presence.update(
        playback || { position: 0, duration: 0, playing: false, reason: 'buffering' }
      );
    else discordPresence.publish();
    if (previous !== presence) previous?.dispose();
  }, [
    presence,
    playback?.position,
    playback?.duration,
    playback?.playing,
    playback?.reason,
    playback?.playbackRate,
  ]);

  useEffect(() => {
    const unregister = discordPresence.register(100, () => registered.current?.current);

    return () => {
      unregister();
      registered.current?.dispose();
    };
  }, []);
}
