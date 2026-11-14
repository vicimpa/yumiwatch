import type { JSX } from 'preact';
export type IconName = 'home' | 'search' | 'grid' | 'calendar' | 'heart' | 'settings' | 'download' | 'arrow' | 'back' | 'play' | 'close' | 'check' | 'chevron' | 'filter' | 'clock' | 'external' | 'wifi' | 'refresh' | 'spark' | 'sun' | 'trash' | 'bookmark' | 'comment';
const paths: Record<IconName, JSX.Element> = {
  comment: <path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 0 1-1-4 9 9 0 0 1 19 0Z"/>,
  home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
  settings: <><path d="m9 3-.7 3-2.6.8L3 6l-1 3 2.3 2v2L2 15l1.5 3 2.8-.7 2.5 1.5.7 2.2h4l.7-2.2 2.5-1.5 2.8.7 1.5-3-2.3-2v-2L21 9l-1-3-2.7.8-2.6-.8L14 3Z"/><circle cx="11.5" cy="12" r="3"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  play: <path d="m8 4 13 8-13 8z" fill="currentColor" stroke="none"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  filter: <><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="9" cy="18" r="2" fill="var(--surface)"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  wifi: <><path d="m2 2 20 20M2 8.8a17 17 0 0 1 3.5-2M10 5a17 17 0 0 1 12 3.8M5 12a11 11 0 0 1 3-1.6M13 10a11 11 0 0 1 6 2M8 15.5a6 6 0 0 1 7.5-.3"/><circle cx="12" cy="19" r="1"/></>,
  refresh: <><path d="M20 8a9 9 0 1 0 0 8M20 3v5h-5"/></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2m-1-9-2 2M5 19l-2 2m0-18 2 2m14 14 2 2"/></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>,
};
export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & JSX.SVGAttributes<SVGSVGElement>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
