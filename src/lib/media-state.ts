export function mediaAtEnd(media: Pick<HTMLMediaElement, 'ended' | 'currentTime' | 'duration'>) {
  return (
    media.ended ||
    (Number.isFinite(media.duration) &&
      media.duration > 0 &&
      media.currentTime >= media.duration - Math.min(0.05, media.duration / 2))
  );
}
