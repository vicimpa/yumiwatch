import { version } from '../../package.json';
import { desktopInvoke, isDesktop } from './desktop';

export const APP_VERSION = version;
export const RELEASE_API = 'https://api.github.com/repos/vicimpa/yummywatch/releases/latest';
export const RELEASE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export interface AppRelease {
  version: string;
  url: string;
  name: string;
}

function versionParts(value: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(value.trim());
  if (!match) return;
  const parts = match.slice(1, 4).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

export function newerVersion(candidate: string, current = APP_VERSION) {
  const next = versionParts(candidate),
    installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++)
    if (next[index] !== installed[index]) return next[index] > installed[index];
  return false;
}

export function parseRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Record<string, unknown>;
  if (
    release.draft ||
    release.prerelease ||
    typeof release.tag_name !== 'string' ||
    !versionParts(release.tag_name) ||
    typeof release.html_url !== 'string'
  )
    return null;
  try {
    const url = new URL(release.html_url);
    if (
      url.origin !== 'https://github.com' ||
      url.username ||
      url.password ||
      !/^\/vicimpa\/yummywatch\/releases\/tag\/[^/]+$/.test(url.pathname)
    )
      return null;
    return {
      version: release.tag_name.replace(/^v/, ''),
      url: url.href,
      name: typeof release.name === 'string' ? release.name.slice(0, 200) : release.tag_name,
    };
  } catch {
    return null;
  }
}

export async function latestRelease(signal?: AbortSignal): Promise<AppRelease | null> {
  if (isDesktop()) return parseRelease(await desktopInvoke('latest_app_release', {}));
  const response = await fetch(RELEASE_API, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось проверить обновления.');
  return parseRelease(await response.json());
}
