import type { FunctionalComponent as FC } from 'preact';

export type TPlaybackLoaderProps = { label: string; detail?: string };

export const PlaybackLoader: FC<TPlaybackLoaderProps> = ({ label, detail }) => (
  <div class="playback-loader" role="status" aria-live="polite">
    <span class="playback-spinner" aria-hidden="true" />
    <strong>{label}</strong>
    {detail && <small>{detail}</small>}
  </div>
);
