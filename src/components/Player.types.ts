import type { RefObject } from 'preact';

import type { PlaybackReport } from '~/lib/playback-session';
import type { Anime, Video, WatchEntry } from '~/lib/types';

export type MediaPanel = 'comments' | 'episodes' | null;

export type TPlayerProps = {
  presentation?: 'immersive';
  modeOverride?: 'source' | 'universal';
  onBack?: () => void;
  panel?: MediaPanel;
  onPanelChange?: (panel: MediaPanel) => void;
  onComments?: () => void;
  fullscreenContainer?: RefObject<HTMLDivElement>;
  preferredVoice?: string;
  preferredEpisode?: string;
  startPlaying?: boolean;
  onSelectPlayer?: (
    video: Video,
    mode: 'source' | 'universal',
    position: number,
    duration: number
  ) => void;
  anime: Anime;
  history?: WatchEntry;
  onCheckpoint?: (entry: WatchEntry) => void;
  onPlayback?: (event: PlaybackReport) => void;
};
