// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalPath,
  initializeNavigation,
  navigateBack,
  navigateForward,
  navigation,
  recordNavigation,
} from '~/lib/navigation';

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '#/profile?tab=collection');
});
describe('application navigation history', () => {
  it('returns to the exact profile tab and keeps forward navigation available', () => {
    initializeNavigation();
    const profile = history.state;
    history.pushState(null, '', '#/anime/9');
    recordNavigation();
    expect(navigation.value.canBack).toBe(true);
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    navigateBack();
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
    history.replaceState(profile, '', '#/profile?tab=collection');
    expect(recordNavigation()).toBe('back');
    expect(navigation.value.canForward).toBe(true);
    expect(location.hash).toBe('#/profile?tab=collection');
    const forward = vi.spyOn(history, 'forward').mockImplementation(() => {});
    navigateForward();
    expect(forward).toHaveBeenCalledOnce();
    forward.mockRestore();
  });
  it('keeps its index across reloads and discards the forward branch after a new navigation', () => {
    initializeNavigation();
    const first = history.state;
    history.pushState(null, '', '#/anime/9');
    recordNavigation();
    initializeNavigation();
    expect(navigation.value.canBack).toBe(true);
    history.replaceState(first, '', '#/profile?tab=collection');
    recordNavigation();
    history.pushState(null, '', '#/messages');
    recordNavigation();
    expect(navigation.value.canForward).toBe(false);
  });
  it('uses an internal fallback when there is no application entry to return to', () => {
    initializeNavigation();
    navigateBack('/');
    expect(location.hash).toBe('#/');
  });
});

describe('legacy collection links', () => {
  it.each([
    ['/library', '/profile?tab=collection'],
    ['/library?tab=favorites', '/profile?tab=collection&list=favorites'],
    ...['watch_now', 'will', 'watched', 'lost', 'postpone'].map(tab => [
      `/library?tab=${tab}`,
      `/profile?tab=collection&list=${tab}`,
    ]),
    ['/library?tab=history', '/profile?tab=history'],
    ['/library?tab=subscriptions', '/profile?tab=subscriptions'],
    ['/library?tab=unknown', '/profile?tab=collection'],
    ['/profile?tab=stats', '/profile?tab=stats'],
  ])('maps %s to %s', (before, after) => {
    expect(canonicalPath(before)).toBe(after);
  });
});
