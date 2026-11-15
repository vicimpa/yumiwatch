export type PageDirection = 'forward' | 'back' | 'up' | 'down';
const sections = ['/', '/catalog', '/search', '/library', '/schedule', '/settings', '/account'];
function page(path: string) {
 const [route, query] = path.split('?'), params = new URLSearchParams(query);
 const anime = /^\/anime\/[^/]+$/.test(route);
 const watch = anime && (params.get('view') === 'watch' || params.has('watch'));
 return { key: anime ? `${route}:${watch ? 'watch' : 'about'}` : route, depth: watch ? 3 : anime || route === '/settings/connection' ? 2 : 1, section: sections.indexOf(`/${route.split('/')[1] || ''}`) };
}
export function pageDirection(from: string, to: string): PageDirection | undefined {
 const previous = page(from), next = page(to);
 if (previous.key === next.key) return;
 if (next.depth !== previous.depth) return next.depth > previous.depth ? 'forward' : 'back';
 return next.section < previous.section ? 'up' : 'down';
}
export function pageSlide(direction: PageDirection) {
 return direction === 'forward' ? 'translateX(100vw)' : direction === 'back' ? 'translateX(-100vw)' : direction === 'up' ? 'translateY(-100dvh)' : 'translateY(100dvh)';
}
