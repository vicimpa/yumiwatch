import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

import { subscribeImage } from '~/lib/image-cache';

import { CachedImage } from './CachedImage';
import { Icon } from './Icon';

export type TArtworkImageProps = {
  src?: string;
  alt: string;
  eager?: boolean;
  tone?: number;
  className?: string;
  imageClass?: string;
};

export const ArtworkImage: FC<TArtworkImageProps> = ({
  src = '',
  alt,
  eager = false,
  tone = 0,
  className = '',
  imageClass = '',
}) => {
  const [broken, setBroken] = useState('');
  const [loaded, setLoaded] = useState('');

  useEffect(() => subscribeImage(src, () => setBroken('')), [src]);

  const available = !!src && broken !== src;

  const markLoaded = useCallback(() => setLoaded(src), [src]);

  const markBroken = useCallback(() => setBroken(src), [src]);

  return (
    <span
      class={`poster-artwork ${className} ${available && loaded === src ? 'is-loaded' : ''}`}
      data-tone={tone % 3}
      role={available ? undefined : 'img'}
      aria-label={available ? undefined : alt}
    >
      <span class={`poster-placeholder ${available ? 'skeleton' : ''}`} aria-hidden="true">
        <Icon name="spark" size={30} />
      </span>
      {available && (
        <CachedImage
          class={imageClass || undefined}
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={markLoaded}
          onError={markBroken}
        />
      )}
    </span>
  );
};
