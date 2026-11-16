import type { ComponentChildren, FunctionalComponent as FC, JSX } from 'preact';

import { CachedImage } from './CachedImage';
import { Icon, type IconName } from './Icon';

export type TEpisodePreviewProps = {
  src?: string;
  alt?: string;
  poster?: boolean;
  progress?: number;
  duration?: string;
  icon?: IconName;
  hideBrokenImage?: boolean;
};

const hideImage = (event: JSX.TargetedEvent<HTMLImageElement>) => {
  event.currentTarget.style.visibility = 'hidden';
};

export const EpisodePreview: FC<TEpisodePreviewProps> = ({
  src,
  alt = '',
  poster,
  progress = 0,
  duration,
  icon = 'play',
  hideBrokenImage,
}) => (
  <div class={poster ? 'episode-preview poster-preview' : 'episode-preview'}>
    {src && <CachedImage src={src} alt={alt} onError={hideBrokenImage ? hideImage : undefined} />}
    <span class="episode-play">
      <Icon name={icon} size={20} />
    </span>
    {duration && <span class="episode-duration">{duration}</span>}
    {progress > 0 && (
      <span class="episode-progress" style={{ width: `${Math.min(100, progress)}%` }} />
    )}
  </div>
);

export type TEpisodeCaptionProps = { title: string; children?: ComponentChildren };

export const EpisodeCaption: FC<TEpisodeCaptionProps> = ({ title, children }) => (
  <span class="episode-caption">
    <strong>{title}</strong>
    {children && <small>{children}</small>}
  </span>
);
