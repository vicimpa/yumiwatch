import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { mediaAtEnd } from '~/lib/media-state';
import { PLAYBACK_RATE_EVENT, selectedPlaybackRate } from '~/lib/playback-rate';

export function useMediaStatus(media: RefObject<HTMLVideoElement>, revision = 0) {
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(true),
    [buffering, setBuffering] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [duration, setDuration] = useState(0),
    [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const video = media.current;

    if (!video) return;

    let lastPosition = video.currentTime;

    const update = (event?: Event) => {
      setEnded(mediaAtEnd(video));
      setPaused(video.paused || mediaAtEnd(video));
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (
        video.paused ||
        mediaAtEnd(video) ||
        video.readyState >= 3 ||
        (event?.type === 'timeupdate' && !video.seeking && video.currentTime > lastPosition + 0.01)
      )
        setBuffering(false);
      lastPosition = video.currentTime;
      setMuted(video.muted);
      setVolume(video.volume);
      setRate(selectedPlaybackRate(video));

      let end = 0;

      for (let i = 0; i < video.buffered.length; i++)
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i) >= video.currentTime
        )
          end = video.buffered.end(i);
      setBuffered(end);
    };

    const wait = () => setBuffering(!video.paused && !mediaAtEnd(video) && video.readyState < 3),
      ready = () => setBuffering(false);

    const events = [
      'play',
      'pause',
      'ended',
      'loadedmetadata',
      'durationchange',
      'timeupdate',
      'volumechange',
      'progress',
      'seeked',
      'ratechange',
      PLAYBACK_RATE_EVENT,
      'yumiwatch:complete',
    ];

    for (const event of events) video.addEventListener(event, update);

    const disconnect = () => {
        setOffline(true);
        wait();
      },
      connect = () => {
        setOffline(false);
        wait();
      };

    video.addEventListener('waiting', wait);
    video.addEventListener('stalled', wait);
    video.addEventListener('playing', ready);
    video.addEventListener('canplay', ready);
    video.addEventListener('pause', ready);
    video.addEventListener('error', ready);
    window.addEventListener('offline', disconnect);
    window.addEventListener('online', connect);
    update();

    return () => {
      for (const event of events) video.removeEventListener(event, update);
      video.removeEventListener('waiting', wait);
      video.removeEventListener('stalled', wait);
      video.removeEventListener('playing', ready);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('pause', ready);
      video.removeEventListener('error', ready);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('online', connect);
    };
  }, [media, revision]);

  return { ended, paused, buffering, offline, duration, buffered, muted, volume, rate };
}
