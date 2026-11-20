export type PlaybackClosePositions = Readonly<Record<number, number>>;

// The controls use the same playback contract for HTML video and the native player.
export type PlaybackMedia = Pick<
  HTMLVideoElement,
  | 'currentTime'
  | 'currentSrc'
  | 'duration'
  | 'readyState'
  | 'seeking'
  | 'paused'
  | 'ended'
  | 'muted'
  | 'volume'
  | 'playbackRate'
  | 'defaultPlaybackRate'
  | 'buffered'
  | 'play'
  | 'pause'
> &
  Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'> & {
    captureFrame?: (close: boolean) => Promise<Blob | undefined>;
    previewFrame?: (seconds: number) => Promise<Blob | undefined>;
    pictureInPicture?: boolean;
    pictureInPictureRequested?: boolean;
    setPictureInPicture?: (enabled: boolean) => Promise<void>;
    prepareToClose?: (positions: PlaybackClosePositions) => void;
  } & Partial<
    Pick<
      HTMLVideoElement,
      | 'error'
      | 'textTracks'
      | 'getAttribute'
      | 'requestVideoFrameCallback'
      | 'cancelVideoFrameCallback'
    >
  >;
