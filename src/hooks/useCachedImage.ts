import { useEffect, useState } from 'preact/hooks';

import { cachedImage, normalizeImage, refreshImage, subscribeImage } from '~/lib/image-cache';

export function useCachedImage(raw?: string, enabled = true) {
  const url = normalizeImage(raw);
  const [value, setValue] = useState(() => ({ key: url, src: cachedImage(url) }));

  useEffect(() => {
    let mounted = true;

    const update = () => {
      if (mounted) setValue({ key: url, src: cachedImage(url) || url });
    };

    const unsubscribe = subscribeImage(url, update),
      controller = new AbortController();

    if (enabled) void refreshImage(url, !cachedImage(url), controller.signal).then(update);

    return () => {
      mounted = false;
      controller.abort();
      unsubscribe();
    };
  }, [url, enabled]);

  const cached = value.key === url ? value.src : cachedImage(url);

  // Without persistent caching, the browser owns the request. Do not give it
  // a remote src until the same visibility gate has opened.
  return cached === url && !enabled ? undefined : cached;
}
