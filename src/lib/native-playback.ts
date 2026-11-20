import { desktopInvoke, isDesktop } from './desktop';
import type { PlaybackClosePositions, PlaybackMedia } from './playback-media';
import type { Stream, StreamCaption } from './streams';

export const usesNativePlayback = () =>
  isDesktop() && document.documentElement.dataset.desktop === 'macos';

export const RETURN_TO_PLAYER_EVENT = 'yumiwatch:return-to-player';

type Geometry = { x: number; y: number; width: number; height: number };
type Controls = {
  pause?: boolean;
  seconds?: number;
  volume?: number;
  mute?: boolean;
  speed?: number;
};
type Snapshot = {
  ready: boolean;
  seeking: boolean;
  buffering: boolean;
  ended: boolean;
  failure: boolean;
  paused: boolean | null;
  position: number;
  duration: number;
  buffered: number;
  pictureInPicture: boolean;
};

const invoke = <T>(request: Record<string, unknown>) =>
  desktopInvoke<T>('native_video', { request });

let nextId = 0;

export class NativePlayback extends EventTarget implements PlaybackMedia {
  readonly id = ++nextId;
  readonly currentSrc: string;
  readyState = 0;
  seeking = false;
  paused = true;
  ended = false;
  pictureInPicture = false;
  duration = NaN;
  defaultPlaybackRate = 1;
  error = null as MediaError | null;
  private position = 0;
  private level = 1;
  private silent = true;
  private rate = 1;
  private bufferEnd = 0;
  private controls: Controls = {};
  private geometry?: Geometry;
  private buffering = false;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private closing = false;
  private opened = false;
  private active = false;
  private lastVisible = false;
  private polling = false;
  private pictureInPictureRevision = 0;
  private pendingPictureInPicture?: { enabled: boolean; task: Promise<void> };
  private element?: HTMLElement;

  constructor(url: string) {
    super();
    this.currentSrc = url;
  }

  private emit(type: string) {
    this.dispatchEvent(new Event(type));
  }

  private fail() {
    if (this.disposed || this.error) return;
    this.error = {
      code: 3,
      message: 'Не удалось воспроизвести поток через VideoToolbox.',
    } as MediaError;
    this.readyState = 0;
    this.emit('error');
  }

  get buffered(): TimeRanges {
    const position = this.position;
    const end = this.bufferEnd;

    return { length: end > position ? 1 : 0, start: () => position, end: () => end };
  }

  get currentTime() {
    return this.position;
  }

  set currentTime(value: number) {
    if (!Number.isFinite(value)) return;
    this.controls.seconds = this.position = Math.max(0, value);
    this.ended = false;
    this.seeking = true;
    this.emit('seeking');
  }

  get volume() {
    return this.level;
  }

  set volume(value: number) {
    if (this.level === value) return;
    this.controls.volume = this.level = value;
    this.emit('volumechange');
  }

  get muted() {
    return this.silent;
  }

  set muted(value: boolean) {
    if (this.silent === value) return;
    this.controls.mute = this.silent = value;
    this.emit('volumechange');
  }

  get playbackRate() {
    return this.rate;
  }

  set playbackRate(value: number) {
    if (this.rate === value) return;
    this.controls.speed = this.rate = value;
    this.emit('ratechange');
  }

  private updatePaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.emit(paused ? 'pause' : 'play');
    if (!paused && this.readyState >= 3) this.emit('playing');
    else if (!paused && this.buffering) this.emit('waiting');
  }

  async play() {
    if (this.error) throw this.error;
    if (!this.paused) return;
    this.controls.pause = false;
    this.updatePaused(false);
  }

  pause() {
    if (this.paused) return;
    this.controls.pause = true;
    this.updatePaused(true);
  }

  private updatePictureInPicture(enabled: boolean) {
    if (typeof enabled !== 'boolean' || this.pictureInPicture === enabled) return;
    this.pictureInPicture = enabled;
    this.emit('yumiwatch:picture-in-picture');
  }

  get pictureInPictureRequested() {
    return this.pendingPictureInPicture?.enabled ?? this.pictureInPicture;
  }

  async setPictureInPicture(enabled: boolean, previous?: NativePlayback) {
    if (!this.opened || this.disposed) return;
    const pending = this.pendingPictureInPicture;
    if (!previous && pending?.enabled === enabled) return pending.task;
    const revision = ++this.pictureInPictureRevision;
    const task = (async () => {
      if (pending) await pending.task.catch(() => {});
      if (this.disposed || revision !== this.pictureInPictureRevision) return;
      const snapshot = await invoke<Snapshot>({
        action: 'pictureInPicture',
        id: this.id,
        enabled,
        previous: previous?.id,
      });
      if (!this.disposed && revision === this.pictureInPictureRevision)
        this.updatePictureInPicture(snapshot.pictureInPicture);
    })();
    this.pendingPictureInPicture = { enabled, task };
    try {
      await task;
    } finally {
      if (revision === this.pictureInPictureRevision) {
        this.pictureInPictureRevision++;
        this.pendingPictureInPicture = undefined;
      }
    }
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (this.opened) {
      clearTimeout(this.timer);
      void this.poll();
    }
  }

  async open(
    element: HTMLElement,
    stream: Stream,
    caption: StreamCaption | undefined,
    start: number,
    previewStream?: Stream
  ) {
    this.position = start;
    this.element = element;

    try {
      await invoke({
        action: 'open',
        id: this.id,
        url: stream.url,
        kind: stream.type,
        caption: caption?.url,
        preview:
          previewStream && previewStream.url !== stream.url
            ? { url: previewStream.url, kind: previewStream.type }
            : undefined,
        start,
      });
      this.opened = true;
      if (this.disposed) {
        this.close();
        return;
      }
      await this.poll();
    } catch (error) {
      if (!this.disposed) {
        this.error = { code: 3, message: String(error) } as MediaError;
        this.emit('error');
      }
    }
  }

  private async poll() {
    const element = this.element;
    if (!element || this.disposed || this.closing || this.error || this.polling) return;
    this.polling = true;
    const active = this.active;
    const rect = element.getBoundingClientRect();
    const { innerWidth: width, innerHeight: height } = window;
    const geometry = {
      x: rect.left / width,
      y: rect.top / height,
      width: rect.width / width,
      height: rect.height / height,
    };
    const visible = active && element.isConnected && rect.width > 0 && rect.height > 0;
    const previous = this.geometry;
    const moved =
      !previous ||
      (Object.keys(geometry) as (keyof Geometry)[]).some(key => geometry[key] !== previous[key]);
    this.geometry = geometry;
    const controls = this.controls;
    const pictureInPictureRevision = this.pictureInPictureRevision;
    this.controls = {};

    try {
      const snapshot = await invoke<Snapshot>({
        action: 'poll',
        id: this.id,
        controls,
        ...(moved ? { geometry } : {}),
        ...(this.lastVisible === visible ? {} : { visible }),
      });
      this.lastVisible = visible;
      if (this.disposed || this.closing) return;
      if (snapshot.failure) {
        this.fail();
        return;
      }
      if (pictureInPictureRevision === this.pictureInPictureRevision)
        this.updatePictureInPicture(snapshot.pictureInPicture);

      const initial = snapshot.ready && this.readyState === 0;
      const buffered = this.buffering;
      const seeking = this.seeking;
      const position = this.position;
      const duration = this.duration;
      const bufferEnd = this.bufferEnd;
      if (snapshot.ready) this.readyState = snapshot.buffering ? 2 : 4;
      this.buffering = snapshot.buffering;
      this.bufferEnd = snapshot.buffered;
      this.duration = snapshot.duration || NaN;
      if (this.controls.seconds === undefined) {
        if (!seeking || !snapshot.seeking) this.position = snapshot.position;
        this.seeking = snapshot.seeking;
        if (seeking && !this.seeking) this.emit('seeked');
      }
      if (initial) {
        this.emit('loadedmetadata');
        this.emit('loadeddata');
      }
      if (snapshot.ended && this.controls.seconds === undefined) {
        if (!this.ended) {
          this.ended = this.paused = true;
          this.emit('ended');
        }
      } else if (typeof snapshot.paused === 'boolean' && this.controls.pause === undefined) {
        // The response must not overwrite a click that happened after this poll was sent.
        this.updatePaused(snapshot.paused);
      }
      if (!buffered && this.buffering) this.emit('waiting');
      if ((initial || buffered) && !this.buffering) this.emit('canplay');
      if (!initial && !Object.is(duration, this.duration)) this.emit('durationchange');
      if (bufferEnd !== this.bufferEnd) this.emit('progress');
      if (snapshot.ready && this.position !== position) this.emit('timeupdate');
    } catch {
      if (!this.closing) this.fail();
    }
    this.polling = false;
    if (!this.disposed && !this.closing && !this.error)
      this.timer = setTimeout(() => void this.poll(), this.active === active ? 80 : 0);
  }

  prepareToClose(positions: PlaybackClosePositions) {
    if (!this.opened || this.disposed || this.closing) return;
    this.closing = true;
    clearTimeout(this.timer);
    const position = positions[this.id];
    if (!this.seeking && !this.error && Number.isFinite(position) && position >= 0)
      this.position = position;
  }

  captureFrame(close: boolean) {
    return this.requestFrame(close);
  }

  previewFrame(seconds: number) {
    return this.requestFrame(false, seconds);
  }

  private async requestFrame(close: boolean, seconds?: number) {
    if (!this.opened || this.disposed) return;
    if (close) {
      this.opened = false;
      this.disposed = true;
      clearTimeout(this.timer);
    }

    try {
      const response = await desktopInvoke<ArrayBuffer | number[]>('native_video_frame', {
        id: this.id,
        close,
        seconds,
      });
      if (!response) return;
      const bytes = Array.isArray(response) ? Uint8Array.from(response) : response;
      if (bytes.byteLength) return new Blob([bytes], { type: 'image/jpeg' });
    } catch {
      if (close) void invoke({ action: 'close', id: this.id }).catch(() => {});
    }
  }

  close() {
    this.disposed = true;
    clearTimeout(this.timer);
    if (this.opened) {
      this.opened = false;
      void invoke({ action: 'close', id: this.id }).catch(() => {});
    }
  }
}
