import { selectedPlaybackRate, setTemporaryPlaybackRate } from './playback-rate';

// Decode the replacement silently while the live video keeps playing.
export function warmQualitySwitch(
  live: HTMLVideoElement,
  next: HTMLVideoElement,
  commit: () => void,
  failed: () => void
) {
  let cancelled = false,
    playing = false,
    frameReady = !next.requestVideoFrameCallback,
    aligned = false;
  let frame: number | undefined;
  let lastTime = next.currentTime;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = setTimeout(() => {
    stop();
    failed();
  }, 20000);

  next.muted = true;

  const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    if (frame !== undefined) next.cancelVideoFrameCallback?.(frame);
    live.removeEventListener('seeking', realign);
    live.removeEventListener('pause', realign);
  };

  const realign = () => {
    aligned = false;
  };

  live.addEventListener('seeking', realign);
  live.addEventListener('pause', realign);

  const decoded = () => {
    if (frame !== undefined) next.cancelVideoFrameCallback?.(frame);
    frameReady = !next.requestVideoFrameCallback;
    if (next.requestVideoFrameCallback)
      frame = next.requestVideoFrameCallback(() => {
        frameReady = true;
      });
  };

  const check = () => {
    if (cancelled) return;
    next.volume = live.volume;
    if (live.paused) {
      if (!next.paused) next.pause();
    } else if (next.paused && !playing) {
      playing = true;
      void next.play().then(
        () => {
          playing = false;
        },
        () => {
          if (!cancelled) {
            stop();
            failed();
          }
        }
      );
    }

    const delta = next.currentTime - live.currentTime;

    // WebKit may suppress presentation callbacks for an opacity:0 native HLS
    // layer. A progressing ready decoder is also evidence of a prepared frame.
    if (!next.seeking && next.readyState >= 3 && next.currentTime > lastTime + 0.01)
      frameReady = true;
    lastTime = next.currentTime;
    // Repeatedly seeking to a moving clock starves slow decoders (notably
    // CVH). Align once, then let the muted replacement catch up naturally.
    setTemporaryPlaybackRate(
      next,
      selectedPlaybackRate(live) *
        (live.paused ? 1 : Math.abs(delta) > 0.1 ? (delta < 0 ? 1.25 : 0.75) : 1)
    );
    if (!next.seeking && !aligned && Math.abs(delta) > 0.15) {
      aligned = true;
      next.currentTime = Math.min(
        live.currentTime + (live.paused ? 0 : 0.04),
        Number.isFinite(next.duration) ? Math.max(0, next.duration - 0.1) : Infinity
      );
      decoded();
    } else if (
      !next.seeking &&
      next.readyState >= 2 &&
      (live.paused || (!next.paused && frameReady)) &&
      Math.abs(delta) <= 0.15
    ) {
      stop();
      commit();

      return;
    }
    timer = setTimeout(check, 40);
  };

  decoded();
  check();

  return stop;
}
