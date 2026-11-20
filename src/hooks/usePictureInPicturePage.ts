import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { mediaAtEnd } from '~/lib/media-state';
import { RETURN_TO_PLAYER_EVENT } from '~/lib/native-playback';
import type { PlaybackMedia } from '~/lib/playback-media';
import { playbackSettings } from '~/lib/playback-settings';

export function usePictureInPicturePage(watchPath?: string) {
  const [retainedPath, setRetainedPath] = useState(watchPath);
  const media = useRef<PlaybackMedia>(null);
  const leftPlayer = useRef(false);

  useLayoutEffect(() => {
    const video = media.current;
    if (watchPath) {
      if (leftPlayer.current && video?.pictureInPictureRequested)
        void video.setPictureInPicture?.(false).catch(() => {});
      leftPlayer.current = false;
      setRetainedPath(watchPath);
      return;
    }
    if (!retainedPath) return;

    if (
      !video?.setPictureInPicture ||
      (!video.pictureInPictureRequested &&
        (!playbackSettings().autoPictureInPicture ||
          video.paused ||
          video.readyState < 2 ||
          mediaAtEnd(video)))
    ) {
      setRetainedPath(undefined);
      return;
    }

    leftPlayer.current = true;
    if (video.pictureInPicture) return;
    // Keep the page mounted until the native window has accepted the current player.
    let cancelled = false;
    const releaseIfClosed = () => {
      if (!cancelled && video === media.current && !video.pictureInPicture) {
        leftPlayer.current = false;
        setRetainedPath(undefined);
      }
    };
    void video.setPictureInPicture(true).then(releaseIfClosed, releaseIfClosed);
    return () => {
      cancelled = true;
    };
  }, [watchPath, retainedPath]);

  useEffect(() => {
    const restore = () => {
      if (!watchPath && retainedPath) location.hash = retainedPath;
    };
    window.addEventListener(RETURN_TO_PLAYER_EVENT, restore);
    return () => window.removeEventListener(RETURN_TO_PLAYER_EVENT, restore);
  }, [watchPath, retainedPath]);

  return { playerPath: watchPath ?? retainedPath, media };
}
