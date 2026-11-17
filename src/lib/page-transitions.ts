export type PageDirection = 'forward' | 'back' | 'up' | 'down';

const sections = [
  '/',
  '/catalog',
  '/search',
  '/schedule',
  '/profile',
  '/users',
  '/notifications',
  '/messages',
  '/settings',
  '/account',
];

function page(path: string) {
  const [route, query] = path.split('?'),
    params = new URLSearchParams(query);
  const anime = /^\/anime\/[^/]+$/.test(route);
  const watch = anime && (params.get('view') === 'watch' || params.has('watch'));

  return {
    key: anime ? `${route}:${watch ? 'watch' : 'about'}` : route,
    depth: watch ? 3 : anime || route === '/settings/connection' ? 2 : 1,
    section: sections.indexOf(`/${route.split('/')[1] || ''}`),
  };
}

export function pageDirection(from: string, to: string): PageDirection | undefined {
  const previous = page(from),
    next = page(to);

  if (previous.key === next.key) return;
  if (next.depth !== previous.depth) return next.depth > previous.depth ? 'forward' : 'back';

  return next.section < previous.section ? 'up' : 'down';
}

const slides: Record<PageDirection, string> = {
  forward: 'translateX(24px)',
  back: 'translateX(-24px)',
  up: 'translateY(-18px)',
  down: 'translateY(18px)',
};

export function pageSlide(direction: PageDirection) {
  return slides[direction];
}
