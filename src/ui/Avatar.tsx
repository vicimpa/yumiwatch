import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

import { imageUrl } from '~/lib/api';
import { subscribeImage } from '~/lib/image-cache';

import { CachedImage } from './CachedImage';

export type TAvatarProps = { url?: string; name: string };

export const Avatar: FC<TAvatarProps> = ({ url, name }) => {
  const src = imageUrl(url);
  const [failed, setFailed] = useState('');

  useEffect(() => subscribeImage(src, () => setFailed('')), [src]);

  const markFailed = useCallback(() => setFailed(src), [src]);

  return src && failed !== src ? (
    <CachedImage src={src} alt="" decoding="async" onError={markFailed} />
  ) : (
    <span>{name.trim().slice(0, 1).toLocaleUpperCase() || '?'}</span>
  );
};
