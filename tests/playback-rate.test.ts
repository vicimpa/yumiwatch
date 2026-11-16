// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  bindPlaybackRate,
  selectedPlaybackRate,
  setPlaybackRate,
  setTemporaryPlaybackRate,
} from '~/lib/playback-rate';
import { warmQualitySwitch } from '~/lib/quality-switch';

describe('selected and effective video speed', () => {
  it('keeps buffering zero out of the selected speed and quality handover', () => {
    const live = document.createElement('video'),
      next = document.createElement('video');

    setPlaybackRate(live, 2);
    live.playbackRate = 0;
    Object.defineProperty(next, 'readyState', { value: 4 });

    const commit = vi.fn();

    warmQualitySwitch(live, next, commit, vi.fn());
    expect(commit).toHaveBeenCalledOnce();
    expect(next.playbackRate).toBe(2);
    expect(selectedPlaybackRate(live)).toBe(2);
  });
  it('does not repeatedly send the same temporary speed to a GStreamer decoder', () => {
    const video = document.createElement('video'),
      trickPlay = vi.fn();
    const release = bindPlaybackRate(video, { trickPlay });

    setPlaybackRate(video, 2);
    trickPlay.mockClear();
    for (let i = 0; i < 10; i++) setTemporaryPlaybackRate(video, 2.5);
    expect(trickPlay).toHaveBeenCalledExactlyOnceWith(2.5, false);
    expect(video.defaultPlaybackRate).toBe(2);
    expect(selectedPlaybackRate(video)).toBe(2);
    setPlaybackRate(video, 2);
    expect(trickPlay).toHaveBeenLastCalledWith(2, false);
    release();
    setPlaybackRate(video, 1.5);
    expect(video.playbackRate).toBe(1.5);
  });
});
