import { useEffect, useState } from 'preact/hooks';

import {
  latestRelease,
  newerVersion,
  RELEASE_CHECK_INTERVAL,
  type AppRelease,
} from '~/lib/releases';

const DISMISSED_KEY = 'yumiwatch:release-dismissed';

export function useReleaseUpdate() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let stopped = false,
      pending = false,
      lastCheck = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const check = async () => {
      if (
        pending ||
        document.visibilityState === 'hidden' ||
        navigator.onLine === false ||
        Date.now() - lastCheck < RELEASE_CHECK_INTERVAL
      )
        return;
      pending = true;
      // Throttle retries even when GitHub is offline or its rate limit is reached.
      lastCheck = Date.now();
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 15000);
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      try {
        const value = await latestRelease(request.signal);
        if (!stopped) setRelease(value && newerVersion(value.version) ? value : null);
      } catch {
        /* A background update check should not interrupt watching or offline use. */
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abort);
        pending = false;
        if (!stopped) {
          clearTimeout(timer);
          timer = setTimeout(() => void check(), RELEASE_CHECK_INTERVAL);
        }
      }
    };
    const online = () => {
      lastCheck = 0;
      void check();
    };
    const initial = setTimeout(() => void check(), 3000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', online);
    window.addEventListener('focus', check);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(initial);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', check);
    };
  }, []);

  return {
    release: release?.version === dismissed ? null : release,
    dismiss: () => {
      if (!release) return;
      setDismissed(release.version);
      try {
        sessionStorage.setItem(DISMISSED_KEY, release.version);
      } catch {
        /* In-memory dismissal still works. */
      }
    },
  };
}
