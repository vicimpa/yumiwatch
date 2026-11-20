import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { PlaybackMedia } from '~/lib/playback-media';
import { mediaAtEnd } from '~/lib/media-state';
import { PLAYBACK_RATE_EVENT, selectedPlaybackRate } from '~/lib/playback-rate';

export function useMediaStatus(media: RefObject<PlaybackMedia>, revision = '') {
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(true),
    [buffering, setBuffering] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [duration, setDuration] = useState(0),
    [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [pictureInPicture, setPictureInPicture] = useState(false);

  useEffect(() => {
    const video = media.current;

    if (!video) return;

    let lastPosition = video.currentTime;

    const update = (event?: Event) => {
      if (media.current !== video) return;
      setEnded(mediaAtEnd(video));
      setPaused(video.paused || mediaAtEnd(video));
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (
        video.paused ||
        mediaAtEnd(video) ||
        video.readyState >= 3 ||
        event?.type === 'playing' ||
        event?.type === 'canplay' ||
        (event?.type === 'timeupdate' && !video.seeking && video.currentTime > lastPosition + 0.01)
      )
        setBuffering(false);
      lastPosition = video.currentTime;
      setMuted(video.muted);
      setVolume(video.volume);
      setRate(selectedPlaybackRate(video));
      setPictureInPicture(video.pictureInPicture === true);

      let end = 0;

      for (let i = 0; i < video.buffered.length; i++)
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i) >= video.currentTime
        )
          end = video.buffered.end(i);
      setBuffered(end);
    };

    const wait = () => {
      if (media.current === video)
        setBuffering(!video.paused && !mediaAtEnd(video) && video.readyState < 3);
    };
    const ready = () => {
      if (media.current === video) setBuffering(false);
    };

    const events = [
      'play',
      'playing',
      'pause',
      'ended',
      'loadedmetadata',
      'loadeddata',
      'canplay',
      'durationchange',
      'timeupdate',
      'volumechange',
      'progress',
      'seeking',
      'seeked',
      'ratechange',
      PLAYBACK_RATE_EVENT,
      'yumiwatch:complete',
      'yumiwatch:picture-in-picture',
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
    video.addEventListener('error', ready);
    window.addEventListener('offline', disconnect);
    window.addEventListener('online', connect);
    wait();
    update();

    return () => {
      for (const event of events) video.removeEventListener(event, update);
      video.removeEventListener('waiting', wait);
      video.removeEventListener('stalled', wait);
      video.removeEventListener('error', ready);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('online', connect);
    };
  }, [media, revision]);

  return {
    ended,
    paused,
    buffering,
    offline,
    duration,
    buffered,
    muted,
    volume,
    rate,
    pictureInPicture,
  };
}
