import type { ComponentChildren, FunctionalComponent as FC } from 'preact';

import { Icon } from '~/ui';

export type TPlaybackLoaderProps = {
  label: string;
  detail?: string;
  failed?: boolean;
  children?: ComponentChildren;
};

export const PlaybackLoader: FC<TPlaybackLoaderProps> = ({ label, detail, failed, children }) => (
  <div class={`playback-loader ${failed ? 'is-error' : ''}`} role={failed ? 'alert' : 'status'}>
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
