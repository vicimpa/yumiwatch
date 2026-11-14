import type { Video, WatchEntry } from './types';
export function playerUrl(raw: string) {
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export const groupKey = (video: Video) => JSON.stringify([video.data.player_id, video.data.player, video.data.dubbing]);
export function groupVideos(videos: Video[]) {
  const groups = new Map<string, { label: string; videos: Video[] }>();
  for (const video of videos) {
    if (!video.data || !playerUrl(video.iframe_url)) continue;
    const key = groupKey(video);
    if (!groups.has(key)) groups.set(key, { label: `${video.data.dubbing || 'Оригинал'} · ${video.data.player || 'Плеер'}`, videos: [] });
    groups.get(key)!.videos.push(video);
  }
  for (const group of groups.values()) group.videos.sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }) || a.index - b.index);
  return groups;
}
export function resumeVideo(videos: Video[], entry?: WatchEntry) {
  const latest = [...videos].filter(video => video.watched?.date).sort((a, b) => (b.watched?.date || 0) - (a.watched?.date || 0))[0];
  if (latest && (latest.watched?.date || 0) * 1000 > (entry?.updatedAt || 0)) return latest;
  return videos.find(v => v.video_id === entry?.videoId) || videos.filter(v => v.number === entry?.episode).sort((a, b) => (b.watched?.date || 0) - (a.watched?.date || 0))[0] || videos[0];
}
export function playbackUrl(video: Video, position: number) {
  const raw = playerUrl(video.iframe_url);
  if (!raw) return '';
  const url = new URL(raw);
  const start = Math.max(0, Math.floor(position - 5));
  if (Number.isFinite(start) && start > 0) {
    if (url.hostname.includes('kodik') || url.pathname.includes('iframeCVH')) url.searchParams.set('start_from', String(start));
    else if (url.hostname.includes('alloha')) url.searchParams.set('start', String(start));
  }
  return url.href;
}
export function playbackMessage(data: unknown): { time?: number; duration?: number } | null {
  if (typeof data === 'string') { if (data.length > 10000) return null; try { data = JSON.parse(data); } catch { return null; } }
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  const key = typeof message.key === 'string' ? message.key.replace(/^kodik_/, '') : message.event;
  const value = message.key ? message.value : message.time;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86400) return null;
  if (key === 'player_time_update' || key === 'timeupdate') return { time: value };
  if (key === 'player_duration_update' || key === 'duration') return { duration: value };
  return null;
}
