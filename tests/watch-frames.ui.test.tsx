// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { WatchPreview } from '~/components/WatchPreview';
import { getCache } from '~/lib/cache-store';
import { storeWatchFrame } from '~/lib/image-cache';
import type { PlaybackMedia } from '~/lib/playback-media';
import { clearSession, saveSession } from '~/lib/session';
import { trackWatchFrames, watchFrameKey } from '~/lib/watch-frames';
import { anime } from './fixtures';

beforeEach(() => {
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:saved-watch-frame');
      static revokeObjectURL = vi.fn();
    }
  );
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('captures the last watched frame even when an earlier request is still pending', async () => {
  const first = new Blob(['earlier frame'], { type: 'image/jpeg' });
  const last = new Blob(['frame at exit'], { type: 'image/jpeg' });
  let reply!: (image: Blob) => void;
  const capture = vi
    .fn<(close: boolean) => Promise<Blob>>()
    .mockReturnValueOnce(
      new Promise<Blob>(resolve => {
        reply = resolve;
      })
    )
    .mockResolvedValueOnce(last);
  const video = Object.assign(new EventTarget(), {
    captureFrame: capture,
    readyState: 4,
    paused: true,
    seeking: false,
    currentTime: 1,
  });
  const key = watchFrameKey(anime.anime_id, '1', 42)!;
  const stop = trackWatchFrames(video as unknown as PlaybackMedia, () => key);

  video.dispatchEvent(new Event('timeupdate'));
  expect(capture).not.toHaveBeenCalled();
  video.paused = false;
  video.dispatchEvent(new Event('playing'));
  expect(capture).toHaveBeenNthCalledWith(1, false);
  video.currentTime = 5;
  expect(stop()).toBe(true);
  expect(capture).toHaveBeenNthCalledWith(2, true);
  await Promise.resolve();
  reply(first);
  await Promise.resolve();

  expect(getCache('frame', key)?.data).toBe(last);
  expect(getCache('frame', watchFrameKey(anime.anime_id, '1')!)).toBeUndefined();
  expect(getCache('frame', watchFrameKey(anime.anime_id, '2', 42)!)).toBeUndefined();
});

it('uses the account frame in history and falls back to the episode screenshot for guests', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const account = {
    token: 'account',
    user: { id: 42, nickname: 'Viewer' },
    remember: false,
    verified: true,
    refreshedAt: Date.now(),
  };
  saveSession(account);
  const entry = {
    anime,
    episode: '1',
    videoId: 1,
    group: '',
    updatedAt: Date.now(),
    preview: 'https://static.yani.tv/screenshot.jpg',
  };
  storeWatchFrame(
    watchFrameKey(anime.anime_id, '1', account.user.id)!,
    new Blob(['frame'], { type: 'image/jpeg' }),
    Date.now()
  );
  const { container } = render(<WatchPreview entry={entry} />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:saved-watch-frame');

  await act(async () => {
    clearSession();
  });
  await waitFor(() =>
    expect(container.querySelector('img')?.getAttribute('src')).toBe(entry.preview)
  );
});
