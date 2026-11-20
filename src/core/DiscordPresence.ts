import type { PlaybackReason } from '~/lib/playback-session';
import type { Anime, Video } from '~/lib/types';

export const PRESENCE_INTERVAL = 15_000;
export const PAUSE_TIMEOUT = 5 * 60_000;

export type PresencePlayback = {
  position: number;
  duration: number;
  playing: boolean;
  playbackRate?: number;
  reason?: PlaybackReason;
};

export type DiscordActivity = {
  type?: 0 | 3;
  details: string;
  state: string;
  animeUrl?: string;
  largeImage?: string;
  timestamps?: { start: number; end: number };
};

const statusText = {
  sourcechange: 'Загрузка',
  buffering: 'Загрузка',
  loadedmetadata: 'Загрузка',
  offline: 'Нет сети',
  pause: 'На паузе',
};

export class DiscordPresence {
  private playback?: PresencePlayback;
  private started = false;
  private disposed = false;
  private pausedAt?: number;
  private updatedAt = 0;
  private lastSent = -Infinity;
  private lastState = '';
  private lastEnd?: number;

  constructor(
    private anime: Anime,
    private video: Video,
    private poster: string,
    private send: (activity: DiscordActivity | null) => void,
    private enabled: () => boolean
  ) {}

  private get status() {
    return this.playback?.playing
      ? 'Воспроизводится'
      : statusText[this.playback?.reason as keyof typeof statusText] || 'На паузе';
  }

  private activity(): DiscordActivity | null {
    const playback = this.playback;

    if (this.disposed || !this.enabled() || !this.started || !playback) return null;

    if (this.pausedAt !== undefined && Date.now() - this.pausedAt >= PAUSE_TIMEOUT) return null;

    const rate =
      Number.isFinite(playback.playbackRate) && playback.playbackRate! > 0
        ? playback.playbackRate!
        : 1;
    const dubbing = this.video.data.dubbing
      .trim()
      .replace(/^озвучка\s+/iu, '')
      .replace(/\s+/gu, ' ');
    const activity: DiscordActivity = {
      details: dubbing ? `${this.anime.title} (${dubbing})` : this.anime.title,
      state: `Серия ${this.video.number} · ${this.status}`,
      animeUrl: `https://ru.yummyani.me/catalog/item/${encodeURIComponent(this.anime.anime_url)}`,
      largeImage: this.poster || undefined,
    };

    if (
      playback.playing &&
      Number.isFinite(playback.duration) &&
      playback.duration > 0 &&
      Number.isFinite(playback.position)
    ) {
      const position = Math.max(0, Math.min(playback.position, playback.duration));
      const now = this.updatedAt / 1000;

      if (position < playback.duration)
        activity.timestamps = {
          start: Math.floor(now - position / rate),
          end: Math.floor(now + (playback.duration - position) / rate),
        };
    }

    return activity;
  }

  get current() {
    return this.activity();
  }

  private publish(force = false) {
    if (this.disposed) return;

    const activity = this.activity();
    const state = JSON.stringify(activity && { ...activity, timestamps: undefined });
    const end = activity?.timestamps?.end;
    const shifted =
      end !== undefined && this.lastEnd !== undefined && Math.abs(end - this.lastEnd) > 2;

    if (!force && !shifted && state === this.lastState && Date.now() - this.lastSent < 5000) return;

    this.lastState = state;
    this.lastEnd = end;
    this.lastSent = Date.now();
    this.send(activity);
  }

  update(next: PresencePlayback) {
    if (
      next.playing ||
      next.reason === 'sourcechange' ||
      next.reason === 'buffering' ||
      next.reason === 'loadedmetadata'
    ) {
      this.started = true;
      this.pausedAt = undefined;
    } else if (this.started && this.pausedAt === undefined) {
      this.pausedAt = Date.now();
    }

    if (['ended', 'dispose', 'error'].includes(next.reason || '')) this.started = false;

    const seeked = next.reason === 'seeked' || next.reason === 'skip';
    const rateChanged = next.playbackRate !== this.playback?.playbackRate;

    this.playback = next;
    this.updatedAt = Date.now();
    this.publish(seeked || rateChanged);
  }

  refresh = () => this.publish(true);

  dispose = () => {
    if (this.disposed) return;

    this.disposed = true;
    this.send(null);
  };
}
