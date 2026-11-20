import { useEffect } from 'preact/hooks';

import { desktopInvoke, isDesktop } from '~/lib/desktop';

let nativeHolders = 0;
let nativeRequest = Promise.resolve();

function holdNativeWakeLock() {
  let holding = false;

  // A pause or source change may arrive while the native command is still running.
  const update = (playing: boolean) => {
    nativeRequest = nativeRequest
      .then(() => desktopInvoke<void>('set_playback_awake', { playing }))
      .catch(() => {});
  };
  const acquire = () => {
    if (holding) return;
    holding = true;
    if (++nativeHolders === 1) update(true);
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    if (--nativeHolders === 0) update(false);
  };

  acquire();
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', acquire);
  return () => {
    window.removeEventListener('pagehide', release);
    window.removeEventListener('pageshow', acquire);
    release();
  };
}

function holdBrowserWakeLock(wakeLock: WakeLock) {
  let lock: WakeLockSentinel | undefined;
  let pending = false;
  let suspended = false;

  const release = () => {
    if (lock && !lock.released) void lock.release().catch(() => {});
    lock = undefined;
  };
  const sync = () => {
    if (suspended || document.hidden) {
      release();
      return;
    }
    if (pending || (lock && !lock.released)) return;
    pending = true;
    void wakeLock
      .request('screen')
      .then(next => {
        if (suspended || document.hidden) return next.release();
        lock = next;
      })
      .catch(() => {})
      .finally(() => {
        pending = false;
      });
  };
  const hide = () => {
    suspended = true;
    release();
  };
  const show = () => {
    suspended = false;
    sync();
  };

  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  return () => {
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    hide();
  };
}

export function usePlaybackWakeLock(playing: boolean) {
  useEffect(() => {
    if (!playing) return;
    if (isDesktop()) return holdNativeWakeLock();
    if (navigator.wakeLock) return holdBrowserWakeLock(navigator.wakeLock);
  }, [playing]);
}
