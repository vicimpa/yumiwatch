import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { useCachedImage } from '~/hooks/useCachedImage';

const visibility = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

function observeImage(image: HTMLImageElement, update: (visible: boolean) => void) {
  observer ??= new IntersectionObserver(
    entries => {
      for (const entry of entries) visibility.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: '160px' }
  );
  visibility.set(image, update);
  observer.observe(image);

  return () => {
    visibility.delete(image);
    observer?.unobserve(image);
    if (!visibility.size) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

export type TCachedImageProps = JSX.ImgHTMLAttributes<HTMLImageElement>;

export const CachedImage: FC<TCachedImageProps> = ({
  src,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}) => {
  const image = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const eager = loading === 'eager' || typeof IntersectionObserver === 'undefined';

  useEffect(() => {
    if (eager || !image.current) return;

    return observeImage(image.current, setVisible);
  }, [eager]);

  const cached = useCachedImage(typeof src === 'string' ? src : undefined, eager || visible);

  // Visibility is already gated above; do not add a second native lazy gate
  // before decoding a poster that is about to become visible.
  const failed = useCallback(
    (event: JSX.TargetedEvent<HTMLImageElement>) => {
      if (cached) onError?.(event);
    },
    [cached, onError]
  );

  return (
    <img
      {...props}
      ref={image}
      loading={eager || visible ? 'eager' : 'lazy'}
      decoding={decoding}
      src={cached || undefined}
      onError={failed}
    />
  );
};
