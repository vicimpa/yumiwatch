// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { WindowCursor } from '~/components/WindowCursor';
import { resetPlayerChrome, setPlayerChrome } from '~/lib/player-chrome';

const native = vi.hoisted(() => ({ invoke: vi.fn(), isFocused: vi.fn(), onFocusChanged: vi.fn() }));

vi.mock('~/lib/desktop', () => ({
  isDesktopWindow: () => true,
  desktopInvoke: native.invoke,
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native }));

let focus: (event: { payload: boolean }) => void;

beforeEach(() => {
  resetPlayerChrome();
  native.invoke.mockReset().mockResolvedValue(undefined);
  native.isFocused.mockResolvedValue(true);
  native.onFocusChanged.mockImplementation(callback => {
    focus = callback;

    return Promise.resolve(vi.fn());
  });
});
afterEach(() => {
  cleanup();
  resetPlayerChrome();
});

const shown = () =>
  waitFor(() =>
    expect(native.invoke).toHaveBeenLastCalledWith('set_window_cursor_visible', { visible: true })
  );

const hidden = () =>
  waitFor(() =>
    expect(native.invoke).toHaveBeenLastCalledWith('set_window_cursor_visible', { visible: false })
  );

describe('native playback cursor', () => {
  it('hides with player chrome and restores immediately on mouse movement and exit', async () => {
    const { unmount } = render(<WindowCursor />);

    await shown();
    fireEvent.pointerMove(document.body);
    act(() => setPlayerChrome(false));
    await hidden();
    fireEvent.pointerMove(document.body);
    await shown();
    act(() => setPlayerChrome(true));
    act(() => setPlayerChrome(false));
    await hidden();
    unmount();
    await shown();
  });
  it('does not hide the cursor outside the window or while another app has focus', async () => {
    render(<WindowCursor />);
    fireEvent.pointerMove(document.body);
    act(() => setPlayerChrome(false));
    await hidden();
    fireEvent(document.documentElement, new Event('pointerleave'));
    await shown();
    act(() => setPlayerChrome(false));
    await shown();
    fireEvent.pointerMove(document.body);
    act(() => setPlayerChrome(true));
    act(() => setPlayerChrome(false));
    await hidden();
    act(() => focus({ payload: false }));
    await shown();
    act(() => setPlayerChrome(false));
    await shown();
    act(() => focus({ payload: true }));
    await hidden();
  });
  it('orders restore after a slow pending hide so it cannot hide the cursor again after leaving playback', async () => {
    let finish!: () => void;

    native.invoke.mockImplementation((_command, { visible }) =>
      visible
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            finish = resolve;
          })
    );

    const { unmount } = render(<WindowCursor />);

    await shown();
    fireEvent.pointerMove(document.body);
    act(() => setPlayerChrome(false));
    await hidden();
    unmount();
    finish();
    await shown();
  });
});
