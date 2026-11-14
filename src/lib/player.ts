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
  return videos.find(v => v.video_id === entry?.videoId) || videos.find(v => v.number === entry?.episode) || videos[0];
}
