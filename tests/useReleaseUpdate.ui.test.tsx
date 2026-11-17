// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReleaseUpdate } from '~/hooks/useReleaseUpdate';
import { latestRelease, RELEASE_CHECK_INTERVAL, RELEASE_STARTUP_DELAY } from '~/lib/releases';

vi.mock('~/lib/releases', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/releases')>()),
  latestRelease: vi.fn(),
}));
const release = {
  version: '99.0.0',
  name: 'New version',
  url: 'https://github.com/vicimpa/yummywatch/releases/tag/v99.0.0',
};
function Probe() {
  const update = useReleaseUpdate();
  return (
    <>
      <span>{update.release?.version || 'Нет обновления'}</span>
      <button onClick={update.dismiss}>Позже</button>
    </>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  vi.mocked(latestRelease).mockReset().mockResolvedValue(release);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('automatic release notifications', () => {
  it('checks at startup, throttles focus events, then checks again after five minutes', async () => {
    render(<Probe />);
    expect(latestRelease).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY);
    });
    expect(screen.getByText('99.0.0')).toBeTruthy();
    fireEvent.focus(window);
    fireEvent.focus(window);
    expect(latestRelease).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_CHECK_INTERVAL);
    });
    expect(latestRelease).toHaveBeenCalledTimes(2);
  });
  it('does not spend extra requests on repeated online notifications after a successful check', async () => {
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY);
    });
    await act(async () => {
      fireEvent.online(window);
      fireEvent.online(window);
    });
    expect(latestRelease).toHaveBeenCalledTimes(1);
  });

  it('pauses requests while the app is hidden and checks when it becomes visible again', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY + RELEASE_CHECK_INTERVAL);
    });
    expect(latestRelease).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(latestRelease).toHaveBeenCalledOnce();
  });
  it('remembers dismissal for this session but announces the next release', async () => {
    const view = render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY);
    });
    fireEvent.click(screen.getByText('Позже'));
    expect(screen.getByText('Нет обновления')).toBeTruthy();
    view.unmount();
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY);
    });
    expect(screen.getByText('Нет обновления')).toBeTruthy();
    vi.mocked(latestRelease).mockResolvedValue({ ...release, version: '99.0.1' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_CHECK_INTERVAL);
    });
    expect(screen.getByText('99.0.1')).toBeTruthy();
  });
  it('keeps network failures quiet and retries when connectivity returns', async () => {
    vi.mocked(latestRelease).mockRejectedValueOnce(new Error('offline'));
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELEASE_STARTUP_DELAY);
    });
    expect(screen.getByText('Нет обновления')).toBeTruthy();
    await act(async () => {
      fireEvent.online(window);
    });
    expect(screen.getByText('99.0.0')).toBeTruthy();
  });
});
