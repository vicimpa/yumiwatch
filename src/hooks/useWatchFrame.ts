import { useEffect, useState } from 'preact/hooks';

import { subscribeImage } from '~/lib/image-cache';
import { cachedWatchFrame } from '~/lib/watch-frames';

export function useWatchFrame(key?: string) {
  const [value, setValue] = useState(() => ({ key, src: cachedWatchFrame(key) }));

  useEffect(() => {
    if (!key) return;
    const update = () => setValue({ key, src: cachedWatchFrame(key) });
    const unsubscribe = subscribeImage(key, update);
    update();

    return unsubscribe;
  }, [key]);

  return value.key === key ? value.src : cachedWatchFrame(key);
}
