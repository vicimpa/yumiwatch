const positions = new Map<string, number>();
const pending = new Map<string, { target: number }>();

export function pageScrollKey(path: string) {
  const [route, query] = path.split('?'),
    params = new URLSearchParams(query);

  if (route === '/profile' || /^\/users\/id[1-9]\d*$/.test(route)) return route;

  return /^\/anime\/[^/]+$/.test(route)
    ? `${route}:${params.get('view') === 'watch' || params.has('watch') ? 'watch' : 'about'}`
    : path;
}

const scroller = () => document.querySelector<HTMLElement>('#main.media-scroll');

export function rememberPageScroll(path: string) {
  const key = pageScrollKey(path);

  positions.set(key, pending.get(key)?.target ?? scroller()?.scrollTop ?? window.scrollY);
  if (positions.size > 50) positions.delete(positions.keys().next().value!);
}

export function restorePageScroll(path: string): () => void {
  const key = pageScrollKey(path),
    target = positions.get(key) || 0,
    element = scroller();

  if (!element) {
    window.scrollTo(0, target);

    return () => {};
  }
  element.scrollTop = target;
  if (Math.abs(element.scrollTop - target) < 1) return () => {};

  // Cached or freshly fetched content may not be tall enough on the first render.
  // Keep the requested position until layout can restore it, or the user takes over.
  const content = element.querySelector<HTMLElement>('.media-scroll-content') || element;
  const request = { target };

  pending.set(key, request);

  let stopped = false;

  const apply = () => {
    if (stopped) return;
    element.scrollTop = target;
    if (Math.abs(element.scrollTop - target) < 1) stop();
  };

  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : undefined;
  const mutations = resize ? undefined : new MutationObserver(apply);
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (pending.get(key) === request) pending.delete(key);
    resize?.disconnect();
    mutations?.disconnect();
    for (const event of events) element.removeEventListener(event, stop, true);
  };

  resize?.observe(content);
  mutations?.observe(content, { childList: true, subtree: true });
  for (const event of events)
    element.addEventListener(event, stop, { capture: true, passive: true });

  return stop;
}

let locks = 0;
let previousBody = '';
let previousRoot = '';
let scrollElement: HTMLElement | null = null;
let previousScrollOverflow = '';

export function lockPageScroll() {
  if (locks++ === 0) {
    previousBody = document.body.style.overflow;
    previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    scrollElement = document.querySelector<HTMLElement>('#main.media-scroll');
    previousScrollOverflow = scrollElement?.style.overflow || '';
    if (scrollElement) scrollElement.style.overflow = 'hidden';
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousRoot;
      if (scrollElement) scrollElement.style.overflow = previousScrollOverflow;
      scrollElement = null;
    }
  };
}
