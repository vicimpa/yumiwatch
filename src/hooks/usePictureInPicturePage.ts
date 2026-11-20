import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { mediaAtEnd } from '~/lib/media-state';
import { RETURN_TO_PLAYER_EVENT, setNativePictureInPicture } from '~/lib/native-playback';
import type { PlaybackMedia } from '~/lib/playback-media';
import { playbackSettings } from '~/lib/playback-settings';

export function usePictureInPicturePage(watchPath?: string) {
  const [retainedPath, setRetainedPath] = useState(watchPath);
  const media = useRef<PlaybackMedia>(null);
  const leftPlayer = useRef(false);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requested = useRef(false);
  const confirmed = useRef(false);
  const operation = useRef<Promise<void>>();
  const revision = useRef(0);

  const change = useCallback((enabled: boolean) => {
    const previous = operation.current;
    const version = ++revision.current;
    requested.current = enabled;
    setPending(true);
    setError('');
    const task = (async () => {
      if (previous) await previous;
      if (version !== revision.current) return;
      try {
        await setNativePictureInPicture(enabled);
        if (version !== revision.current) return;
        confirmed.current = enabled;
        setActive(enabled);
      } catch {
        if (version !== revision.current) return;
        requested.current = confirmed.current;
        setError('Не удалось переключить мини-плеер.');
      } finally {
        if (version === revision.current) {
          operation.current = undefined;
          setPending(false);
        }
      }
    })();
    operation.current = task;
    return task;
  }, []);

  const toggle = useCallback(() => {
    void change(!requested.current);
  }, [change]);

  useLayoutEffect(() => {
    const video = media.current;
    if (watchPath) {
      if (leftPlayer.current && requested.current) void change(false);
      leftPlayer.current = false;
      setRetainedPath(watchPath);
      return;
    }
    if (!retainedPath) return;

    if (
      !requested.current &&
      (!video ||
        !playbackSettings().autoPictureInPicture ||
        video.paused ||
        video.readyState < 2 ||
        mediaAtEnd(video))
    ) {
      setRetainedPath(undefined);
      return;
    }

    leftPlayer.current = true;
    if (confirmed.current && requested.current) return;
    let cancelled = false;
    const opening = requested.current ? operation.current : change(true);
    void opening?.then(() => {
      if (!cancelled && !requested.current && location.hash !== '#' + retainedPath) {
        leftPlayer.current = false;
        setRetainedPath(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [watchPath, retainedPath, change]);

  useEffect(() => {
    const restore = () => {
      revision.current++;
      requested.current = confirmed.current = false;
      setActive(false);
      setPending(false);
      setError('');
      if (!watchPath && retainedPath) location.hash = retainedPath;
    };
    window.addEventListener(RETURN_TO_PLAYER_EVENT, restore);
    return () => window.removeEventListener(RETURN_TO_PLAYER_EVENT, restore);
  }, [watchPath, retainedPath]);

  return { playerPath: watchPath ?? retainedPath, media, pip: { active, pending, error, toggle } };
}
