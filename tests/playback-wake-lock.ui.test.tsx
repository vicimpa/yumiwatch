// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';

import { usePlaybackWakeLock } from '~/hooks/usePlaybackWakeLock';

function Player({ playing }: { playing: boolean }) {
  usePlaybackWakeLock(playing);
  return null;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('releases the native lock after a pause during acquisition and on unmount', async () => {
  let acquired!: () => void;
  const acquiring = new Promise<void>(resolve => {
    acquired = resolve;
  });
  const invoke = vi.fn().mockReturnValueOnce(acquiring).mockResolvedValue(undefined);
  vi.stubGlobal('isTauri', true);
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
  const { rerender, unmount } = render(<Player playing={false} />);
  expect(invoke).not.toHaveBeenCalled();
  rerender(<Player playing />);
  await waitFor(() =>
    expect(invoke).toHaveBeenLastCalledWith('set_playback_awake', { playing: true }, undefined)
  );
  rerender(<Player playing={false} />);
  expect(invoke).toHaveBeenCalledTimes(1);
  acquired();
  await waitFor(() =>
    expect(invoke).toHaveBeenLastCalledWith('set_playback_awake', { playing: false }, undefined)
  );
  rerender(<Player playing />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
  unmount();
  await waitFor(() =>
    expect(invoke).toHaveBeenLastCalledWith('set_playback_awake', { playing: false }, undefined)
  );
});

it('releases the browser lock on hide and acquires a new one on return during playback', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const first = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  const second = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  const { rerender } = render(<Player playing />);
  expect(request).toHaveBeenCalledExactlyOnceWith('screen');
  await Promise.resolve();
  hidden.mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(first.release).toHaveBeenCalledOnce();
  await Promise.resolve();
  await Promise.resolve();
  hidden.mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  expect(request).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  rerender(<Player playing={false} />);
  expect(second.release).toHaveBeenCalledOnce();
});

it('releases a browser lock that arrives after playback has stopped', async () => {
  const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  let acquired!: (lock: typeof sentinel) => void;
  const acquiring = new Promise<typeof sentinel>(resolve => {
    acquired = resolve;
  });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn().mockReturnValue(acquiring) },
  });
  const { unmount } = render(<Player playing />);
  unmount();
  acquired(sentinel);
  await waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
});
