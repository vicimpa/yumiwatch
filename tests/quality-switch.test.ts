// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type shaka from 'shaka-player';
import { selectQuality } from '~/components/StreamMedia';
import { warmQualitySwitch } from '~/lib/quality-switch';

function media(time = 120, paused = false) {
  const element = document.createElement('video');

  Object.defineProperty(element, 'paused', { value: paused, writable: true, configurable: true });
  Object.defineProperty(element, 'duration', { value: 1400, configurable: true });
  Object.defineProperty(element, 'readyState', { value: 4, writable: true, configurable: true });
  element.currentTime = time;
  element.play = vi.fn(async () => {
    Object.defineProperty(element, 'paused', { value: false, writable: true, configurable: true });
  });
  element.pause = vi.fn(() => {
    Object.defineProperty(element, 'paused', { value: true, writable: true, configurable: true });
  });

  return element;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('preloaded quality handover', () => {
  it('switches adaptive tracks without clearing the buffer or changing audio language', () => {
    const low = { id: 1, height: 360, language: 'ru', active: true },
      high = { id: 2, height: 720, language: 'ru' },
      otherAudio = { id: 3, height: 720, language: 'ja' };
    const selectVariantTrack = vi.fn(),
      configure = vi.fn();
    const player = {
      getVariantTracks: () => [low, high, otherAudio],
      selectVariantTrack,
      configure,
    } as unknown as shaka.Player;

    selectQuality(player, 720);
    expect(selectVariantTrack).toHaveBeenCalledWith(high, false);
    expect(configure).toHaveBeenCalledWith({ abr: { enabled: false } });
  });
  it('waits for a decoded replacement frame while the live video continues', () => {
    const live = media(),
      next = media(120, true),
      commit = vi.fn(),
      failed = vi.fn();
    let decoded!: VideoFrameRequestCallback;

    next.requestVideoFrameCallback = vi.fn(callback => {
      decoded = callback;

      return 1;
    });
    next.cancelVideoFrameCallback = vi.fn();

    const cancel = warmQualitySwitch(live, next, commit, failed);

    expect(commit).not.toHaveBeenCalled();
    expect(live.pause).not.toHaveBeenCalled();
    expect(next.muted).toBe(true);
    decoded(0, {} as VideoFrameCallbackMetadata);
    vi.advanceTimersByTime(40);
    expect(commit).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    cancel();
  });
  it('preserves pause, playback rate and volume and aligns after a seek', () => {
    const live = media(340, true),
      next = media(120, true),
      commit = vi.fn();

    live.playbackRate = 1.5;
    live.volume = 0.3;
    warmQualitySwitch(live, next, commit, vi.fn());
    expect(next.currentTime).toBe(340);
    vi.advanceTimersByTime(40);
    expect(commit).toHaveBeenCalledOnce();
    expect(next.play).not.toHaveBeenCalled();
    expect(next.playbackRate).toBe(1.5);
    expect(next.volume).toBe(0.3);
  });
  it('cancels an obsolete selection without switching later', () => {
    const live = media(),
      next = media(),
      commit = vi.fn(),
      failed = vi.fn();

    Object.defineProperty(next, 'readyState', { value: 1, writable: true });

    const cancel = warmQualitySwitch(live, next, commit, failed);

    cancel();
    Object.defineProperty(next, 'readyState', { value: 4 });
    vi.advanceTimersByTime(21000);
    expect(commit).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(live.pause).not.toHaveBeenCalled();
  });
  it('times out a stalled replacement and leaves the live video untouched', () => {
    const live = media(),
      next = media(),
      commit = vi.fn(),
      failed = vi.fn();

    Object.defineProperty(next, 'readyState', { value: 1 });
    warmQualitySwitch(live, next, commit, failed);
    vi.advanceTimersByTime(20001);
    expect(commit).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    expect(live.pause).not.toHaveBeenCalled();
  });
  it('lets a slow decoder catch up instead of restarting its seek every forty milliseconds', () => {
    const live = media(120),
      next = media(118),
      commit = vi.fn();
    let time = 118,
      seeking = false;
    const seeks = vi.fn(value => {
      time = value;
      seeking = true;
    });

    Object.defineProperty(next, 'currentTime', { get: () => time, set: seeks });
    Object.defineProperty(next, 'seeking', { get: () => seeking });

    const cancel = warmQualitySwitch(live, next, commit, vi.fn());

    expect(seeks).toHaveBeenCalledOnce();
    live.currentTime = 120.5;
    seeking = false;
    vi.advanceTimersByTime(400);
    expect(seeks).toHaveBeenCalledOnce();
    expect(next.playbackRate).toBe(1.25);
    expect(commit).not.toHaveBeenCalled();
    live.currentTime = 340;
    fireSeek(live);
    vi.advanceTimersByTime(40);
    expect(seeks).toHaveBeenCalledTimes(2);
    cancel();
  });
  it('accepts progressing decoded media when WebKit suppresses hidden-layer presentation callbacks', () => {
    const live = media(120),
      next = media(120),
      commit = vi.fn();

    next.requestVideoFrameCallback = vi.fn(() => 1);
    next.cancelVideoFrameCallback = vi.fn();
    warmQualitySwitch(live, next, commit, vi.fn());
    expect(commit).not.toHaveBeenCalled();
    live.currentTime = 120.04;
    next.currentTime = 120.04;
    vi.advanceTimersByTime(40);
    expect(commit).toHaveBeenCalledOnce();
  });
});

function fireSeek(media: HTMLVideoElement) {
  media.dispatchEvent(new Event('seeking'));
}
