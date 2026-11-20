// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHash } from '~/lib/hooks';
import { saveInterfaceSettings } from '~/lib/interface-settings';
import { pageDirection } from '~/lib/page-transitions';

function Screen() {
  const path = useHash();

  return <main id="main">{path}</main>;
}

function navigate(path: string) {
  history.replaceState(null, '', `#${path}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
}

const original = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '#/catalog');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
  Object.defineProperty(document, 'startViewTransition', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (original) Object.defineProperty(document, 'startViewTransition', original);
  else Reflect.deleteProperty(document, 'startViewTransition');
  delete document.documentElement.dataset.desktop;
  delete document.documentElement.dataset.pageDirection;
});

function transition() {
  return { ready: Promise.resolve(), finished: Promise.resolve(), skipTransition: vi.fn() };
}

describe('page slides', () => {
  it('replaces an initial legacy collection URL without adding a history entry', () => {
    history.replaceState({ custom: 'preserved' }, '', '#/library?tab=will');
    const length = history.length;
    render(<Screen />);
    expect(screen.getByText('/profile?tab=collection&list=will')).toBeTruthy();
    expect(location.hash).toBe('#/profile?tab=collection&list=will');
    expect(history.length).toBe(length);
    expect(history.state.custom).toBe('preserved');
  });
  it('canonicalizes legacy URLs during navigation too', () => {
    render(<Screen />);
    navigate('/library?tab=history');
    expect(screen.getByText('/profile?tab=history')).toBeTruthy();
    expect(location.hash).toBe('#/profile?tab=history');
  });
  it('uses depth for forward/back and menu position for sibling screens, leaving filters and episode changes in place', () => {
    expect(pageDirection('/catalog', '/anime/10531')).toBe('forward');
    expect(pageDirection('/anime/10531', '/anime/10531?view=watch')).toBe('forward');
    expect(pageDirection('/anime/10531?view=watch', '/anime/10531')).toBe('back');
    expect(pageDirection('/anime/10531', '/catalog')).toBe('back');
    expect(pageDirection('/', '/catalog')).toBe('down');
    expect(pageDirection('/catalog', '/')).toBe('up');
    expect(pageDirection('/catalog', '/search')).toBe('down');
    expect(pageDirection('/search', '/catalog')).toBe('up');
    expect(pageDirection('/settings', '/settings/connection')).toBe('forward');
    expect(pageDirection('/catalog', '/catalog?sort=top')).toBeUndefined();
    expect(
      pageDirection('/anime/10531?view=watch&episode=1', '/anime/10531?view=watch&episode=2')
    ).toBeUndefined();
  });
  it('commits the new screen inside the transition and restores document position before the snapshot', () => {
    const start = vi.fn((update: () => void) => {
      update();
      expect(screen.getByText('/anime/10531')).toBeTruthy();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

      return transition();
    });

    document.startViewTransition = start as unknown as typeof document.startViewTransition;
    render(<Screen />);
    navigate('/anime/10531');
    expect(start).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.pageDirection).toBe('forward');
  });
  it.each(['setting', 'system'])('disables slides for the %s motion preference', preference => {
    if (preference === 'setting') saveInterfaceSettings({ animations: false });
    else
      vi.mocked(matchMedia).mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList);

    const start = vi.fn();

    document.startViewTransition = start;
    render(<Screen />);
    navigate('/search');
    expect(screen.getByText('/search')).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });
  it('prevents an older skipped callback from replacing a newer screen', () => {
    const updates: (() => void)[] = [],
      sessions: ReturnType<typeof transition>[] = [];

    document.startViewTransition = vi.fn((update: () => void) => {
      updates.push(update);

      const active = transition();

      sessions.push(active);

      return active;
    }) as unknown as typeof document.startViewTransition;
    render(<Screen />);
    navigate('/search');
    navigate('/settings');
    expect(sessions[0].skipTransition).toHaveBeenCalledOnce();
    act(() => updates[1]());
    act(() => updates[0]());
    expect(screen.getByText('/settings')).toBeTruthy();
  });
  it.each(['without View Transitions support', 'on Linux desktop'])(
    'slides in the screen %s',
    async environment => {
      const start = vi.fn();
      if (environment === 'on Linux desktop') {
        document.documentElement.dataset.desktop = 'linux';
        document.startViewTransition = start;
      }

      const { container } = render(<Screen />);
      const animate = vi.fn().mockReturnValue({ cancel: vi.fn(), finished: Promise.resolve() });

      container.querySelector('main')!.animate = animate;
      navigate('/search');
      expect(screen.getByText('/search')).toBeTruthy();
      expect(start).not.toHaveBeenCalled();
      await waitFor(() => expect(animate).toHaveBeenCalledOnce());
      expect(animate.mock.calls[0][0][0].transform).toBe('translateY(18px)');
    }
  );
});
