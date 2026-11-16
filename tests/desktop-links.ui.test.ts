// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/preact';
import { handleDesktopLinkClick } from '~/lib/desktop';

const opener = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock('@tauri-apps/plugin-opener', () => opener);

beforeEach(() => {
  opener.openUrl.mockReset().mockResolvedValue(undefined);
  // WKWebView's native Location exposes a tuple origin and a root pathname,
  // while URL parses an unknown scheme with an opaque origin/empty pathname.
  vi.stubGlobal('location', {
    href: 'tauri://localhost',
    origin: 'tauri://localhost',
    pathname: '/',
  });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function click(href: string, options: MouseEventInit = {}, download = false) {
  const link = document.createElement('a');

  link.href = href;
  if (download) link.setAttribute('download', '');

  const label = link.appendChild(document.createElement('span'));

  document.body.appendChild(link);

  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options });

  // Use a real nested event target, but prevent JSDOM's unsupported navigation.
  label.addEventListener(
    'click',
    e => {
      handleDesktopLinkClick(e as MouseEvent);
    },
    { once: true }
  );
  link.addEventListener('click', e => e.preventDefault(), { once: true });

  let intercepted = false;

  label.addEventListener(
    'click',
    e => {
      intercepted = e.defaultPrevented;
    },
    { once: true }
  );
  label.dispatchEvent(event);

  return intercepted;
}

describe('links inside packaged desktop apps', () => {
  it.each([
    '#/search',
    '#/catalog?status=ongoing',
    '#/anime/10531?view=anime-about',
    '#/anime/10531?view=watch&play=1',
  ])('keeps native navigation %s inside the WebView', hash => {
    expect(click(`tauri://localhost${hash}`)).toBe(false);
    expect(opener.openUrl).not.toHaveBeenCalled();
  });
  it('keeps literal fragment links inside the current document', () => {
    expect(click('#/settings')).toBe(false);
  });
  it.each(['http://localhost:4179/', 'http://tauri.localhost/', 'https://tauri.localhost/'])(
    'preserves in-app links at %s',
    href => {
      vi.stubGlobal('location', new URL(href));
      expect(click(`${href}#/search`)).toBe(false);
    }
  );
  it('opens external HTTPS links in the system browser', async () => {
    expect(click('https://yummyani.me/dev/applications')).toBe(true);
    await waitFor(() =>
      expect(opener.openUrl).toHaveBeenCalledExactlyOnceWith('https://yummyani.me/dev/applications')
    );
  });
  it.each([
    'tauri://other-host#/search',
    'yumiwatch-media://localhost/private',
    'javascript:alert(1)',
    'http://example.com/',
  ])('blocks unsupported external URL %s', href => {
    expect(click(href)).toBe(true);
    expect(opener.openUrl).not.toHaveBeenCalled();
  });
  it('leaves downloads and middle clicks to the WebView', () => {
    expect(click('https://example.com/file', {}, true)).toBe(false);
    expect(click('https://example.com/', { button: 1 })).toBe(false);
    expect(opener.openUrl).not.toHaveBeenCalled();
  });
});
