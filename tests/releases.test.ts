// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { latestRelease, newerVersion, parseRelease, RELEASE_API } from '~/lib/releases';
import { desktopInvoke, isDesktop } from '~/lib/desktop';

vi.mock('~/lib/desktop', () => ({ isDesktop: vi.fn(() => false), desktopInvoke: vi.fn() }));
const release = {
  tag_name: 'v0.0.5',
  html_url: 'https://github.com/vicimpa/yummywatch/releases/tag/v0.0.5',
  name: 'YummyWatch 0.0.5',
  draft: false,
  prerelease: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(isDesktop).mockReturnValue(false);
});

describe('application releases', () => {
  it.each([
    ['v0.0.5', '0.0.4', true],
    ['0.0.10', '0.0.9', true],
    ['0.1.0', '0.0.99', true],
    ['1.0.0', '0.99.99', true],
    ['v0.0.4', '0.0.4', false],
    ['0.0.3', '0.0.4', false],
    ['v0.0.5-beta.1', '0.0.4', false],
    ['not-a-version', '0.0.4', false],
    ['0.0.5+build.1', '0.0.4', true],
  ])('compares %s to %s numerically', (next, current, expected) => {
    expect(newerVersion(next, current)).toBe(expected);
  });
  it('only accepts stable releases from this repository', () => {
    expect(parseRelease(release)).toMatchObject({ version: '0.0.5', url: release.html_url });
    for (const invalid of [
      { ...release, draft: true },
      { ...release, prerelease: true },
      { ...release, html_url: 'https://example.com/download' },
      { ...release, html_url: 'https://github.com/another/repository/releases/tag/v0.0.5' },
      { ...release, html_url: 'javascript:alert(1)' },
    ])
      expect(parseRelease(invalid)).toBeNull();
  });
  it('checks public releases without sending account or application credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(release)));
    vi.stubGlobal('fetch', fetcher);
    expect(await latestRelease()).toMatchObject({ version: '0.0.5' });
    expect(fetcher).toHaveBeenCalledWith(
      RELEASE_API,
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
      })
    );
  });
  it('uses the fixed native command for desktop requests', async () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.mocked(desktopInvoke).mockResolvedValue(release);
    expect(await latestRelease()).toMatchObject({ version: '0.0.5' });
    expect(desktopInvoke).toHaveBeenCalledWith('latest_app_release', {});
  });
  it('treats an unpublished repository as having no release and surfaces rate limits to the background checker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await latestRelease()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    await expect(latestRelease()).rejects.toThrow('обновления');
  });
});
