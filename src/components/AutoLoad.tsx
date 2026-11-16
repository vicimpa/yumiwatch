import type { ComponentChildren, FunctionalComponent as FC } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { Button, FormError } from '~/ui';

export type TAutoLoadProps = {
  enabled: boolean;
  loading: boolean;
  error: string;
  load: () => void;
  children: ComponentChildren;
};

export const AutoLoad: FC<TAutoLoadProps> = ({ enabled, loading, error, load, children }) => {
  const marker = useRef<HTMLDivElement>(null),
    callback = useRef(load);

  callback.current = load;

  useEffect(() => {
    if (
      !enabled ||
      loading ||
      error ||
      !marker.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;

    let requested = false;
    const observer = new IntersectionObserver(
      entries => {
        if (!requested && entries.some(entry => entry.isIntersecting)) {
          requested = true;
          callback.current();
        }
      },
      {
        root: marker.current.closest('.media-scroll,.sidebar-scroll,.modal-scroll'),
        rootMargin: '600px 0px',
      }
    );

    observer.observe(marker.current);

    return () => observer.disconnect();
  }, [enabled, loading, error]);

  if (!enabled) return null;

  return (
    <>
      <div class="auto-load-marker" ref={marker} aria-hidden="true" />
      {loading && children}
      {error ? (
        <FormError class="auto-load-error" as="div">
          <p>{error}</p>
          <Button onClick={load}>Повторить загрузку</Button>
        </FormError>
      ) : (
        !loading &&
        typeof IntersectionObserver === 'undefined' && <Button onClick={load}>Загрузить ещё</Button>
      )}
    </>
  );
};
