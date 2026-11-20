import type { ComponentChildren, FunctionalComponent as FC } from 'preact';

import { Icon } from '~/ui';

export type TPlaybackLoaderProps = {
  label: string;
  detail?: string;
  preview?: string;
  failed?: boolean;
  children?: ComponentChildren;
};

export function PlaybackPreview({ src }: { src: string }) {
  return (
    <div class="playback-preview" aria-hidden="true">
      <img src={src} alt="" />
    </div>
  );
}

export const PlaybackLoader: FC<TPlaybackLoaderProps> = ({
  label,
  detail,
  preview,
  failed,
  children,
}) => (
  <div class={`playback-loader ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
    {preview && <PlaybackPreview src={preview} />}
    <div class="playback-loader-content">
      {failed ? (
        <span class="playback-interrupted" aria-hidden="true">
          <Icon name="wifi" size={24} />
        </span>
      ) : (
        <span class="playback-spinner" aria-hidden="true" />
      )}
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
      {children && <div class="playback-loader-actions">{children}</div>}
    </div>
  </div>
);
