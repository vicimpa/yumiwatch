import type { FunctionalComponent as FC, JSX } from 'preact';

export type IconName =
  | 'home'
  | 'search'
  | 'grid'
  | 'calendar'
  | 'heart'
  | 'settings'
  | 'download'
  | 'arrow'
  | 'back'
  | 'play'
  | 'close'
  | 'check'
  | 'chevron'
  | 'filter'
  | 'clock'
  | 'external'
  | 'wifi'
  | 'refresh'
  | 'spark'
  | 'sun'
  | 'trash'
  | 'bookmark'
  | 'comment'
  | 'list'
  | 'pause'
  | 'volume'
  | 'volumeOff'
  | 'fullscreen'
  | 'minimize'
  | 'skipNext'
  | 'skipBack';

// One 24 px grid, rounded strokes and quiet filled surfaces across the app.
const tint = { fill: 'currentColor', 'fill-opacity': 0.12 };
const paths: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M4.5 9.5v9a2 2 0 0 0 2 2h3v-6h5v6h3a2 2 0 0 0 2-2v-9L12 3Z" {...tint} />
      <path d="m3 10 9-7 9 7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="6.75" {...tint} />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  grid: (
    <>
      {[3, 14].flatMap(x =>
        [3, 14].map(y => (
          <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" rx="2.25" {...tint} />
        ))
      )}
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3" {...tint} />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h2M14 14h2M8 17.5h2" />
    </>
  ),
  heart: (
    <path d="M12 20.5 4.4 13a5.2 5.2 0 0 1 7.3-7.4l.3.3.3-.3a5.2 5.2 0 0 1 7.3 7.4Z" {...tint} />
  ),
  bookmark: <path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z" {...tint} />,
  settings: (
    <>
      <path
        d="m10 3-.5 2.3-2 .9-2.1-.7-2 3.5 1.6 1.6v2.8L3.4 15l2 3.5 2.1-.7 2 .9.5 2.3h4l.5-2.3 2-.9 2.1.7 2-3.5-1.6-1.6v-2.8L20.6 9l-2-3.5-2.1.7-2-.9L14 3Z"
        {...tint}
      />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  comment: (
    <path
      d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.7-5.2a8.5 8.5 0 1 1 15.8-4.3Z"
      {...tint}
    />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" {...tint} />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  filter: (
    <>
      <path d="M3.5 6h17M3.5 12h17M3.5 18h17" />
      <circle cx="8" cy="6" r="2" fill="var(--surface)" />
      <circle cx="16" cy="12" r="2" fill="var(--surface)" />
      <circle cx="9" cy="18" r="2" fill="var(--surface)" />
    </>
  ),
  list: (
    <>
      <path d="M8 5.5h12.5M8 12h12.5M8 18.5h12.5" />
      <path d="M3.5 5.5h.01M3.5 12h.01M3.5 18.5h.01" stroke-width="2.8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11m-4-4 4 4 4-4M4 16v2.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2V16" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  chevron: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  external: (
    <>
      <path d="M13.5 3.5h7v7m0-7-10 10M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a8.5 8.5 0 1 0 .3 7M20 3.5V8h-4.5" />
    </>
  ),
  wifi: (
    <>
      <path d="m3 3 18 18M3 8.5a16 16 0 0 1 2.8-1.6M10 5.5a16 16 0 0 1 11 3M6 12.5a10 10 0 0 1 2.8-1.4M13 10.5a10 10 0 0 1 5 2M9 16a5 5 0 0 1 5.7-.2" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  spark: <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z" {...tint} />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" {...tint} />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  trash: (
    <>
      <path d="m5.5 6.5.8 12a2 2 0 0 0 2 2h7.4a2 2 0 0 0 2-2l.8-12" {...tint} />
      <path d="M3.5 6.5h17M9 6.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.5M10 10v6.5M14 10v6.5" />
    </>
  ),
  play: (
    <path
      d="M7.5 5.5c0-.8.9-1.3 1.6-.9l10.5 6.5c.7.4.7 1.4 0 1.8L9.1 19.4c-.7.4-1.6-.1-1.6-.9Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  pause: (
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1.3" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="3.5" height="14" rx="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  skipNext: (
    <>
      <path
        d="M5.5 5.5 15 12l-9.5 6.5Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-linejoin="round"
      />
      <path d="M18.5 5.5v13" />
    </>
  ),
  skipBack: (
    <>
      <path
        d="M18.5 5.5 9 12l9.5 6.5Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-linejoin="round"
      />
      <path d="M5.5 5.5v13" />
    </>
  ),
  volume: (
    <>
      <path d="M10.5 4.5 6 8.5H3v7h3l4.5 4Z" {...tint} />
      <path d="M14.5 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M10.5 4.5 6 8.5H3v7h3l4.5 4Z" {...tint} />
      <path d="m15.5 9 6 6m0-6-6 6" />
    </>
  ),
  fullscreen: <path d="M8 3.5H3.5V8m12.5-4.5h4.5V8M3.5 16v4.5H8m12.5-4.5v4.5H16" />,
  minimize: <path d="M3.5 8H8V3.5m8 0V8h4.5M8 20.5V16H3.5m12.5 4.5V16h4.5" />,
};

export type TIconProps = { name: IconName; size?: number } & JSX.SVGAttributes<SVGSVGElement>;

export const Icon: FC<TIconProps> = ({ name, size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    data-icon={name}
    {...props}
  >
    {paths[name]}
  </svg>
);
