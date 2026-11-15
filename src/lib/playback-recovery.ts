import { rememberContinue } from './continue-cache';
import { getSession } from './session';
import { readJSON, writeJSON } from './storage';
import type { WatchEntry } from './types';

// Account IDs isolate local recovery without persisting authentication tokens.
function recoveryKey() {
  const session = getSession();
  return `yumiwatch:playback-recovery:v1:${session ? `account:${session.user.id}` : 'guest'}`;
}
export function readPlaybackRecovery(animeId: number): WatchEntry | undefined {
  const entry = readJSON<Record<string, WatchEntry>>(recoveryKey(), {})[animeId];
  return entry?.anime?.anime_id === animeId && Number.isFinite(entry.position) && entry.position! >= 0 && Number.isFinite(entry.updatedAt) ? entry : undefined;
}
export function savePlaybackRecovery(entry: WatchEntry, token: string | null) {
  if ((getSession()?.token || null) !== token) return;
  const key = recoveryKey();
  const entries = readJSON<Record<string, WatchEntry>>(key, {});
  entries[entry.anime.anime_id] = entry;
  writeJSON(key, Object.fromEntries(Object.entries(entries).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 50)));
  rememberContinue(entry,token);
}
