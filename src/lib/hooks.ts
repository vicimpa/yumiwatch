import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LIBRARY_EVENT } from './storage';
import { getLibraryState } from './library';
import { getSession, restoreStoredSession, SESSION_EVENT, SESSION_KEY } from './session';
import type { Result } from './types';

export function useResource<T>(loader: (signal: AbortSignal) => Promise<Result<T>>, deps: unknown[]) {
  const [value, setValue] = useState<Result<T>>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setValue(undefined);
    loader(controller.signal).then(result => { if (!controller.signal.aborted) setValue(result); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [...deps, revision]);
  return { value, error, loading, retry: () => setRevision(n => n + 1) };
}
export function useLibrary() {
  const [library, setLibrary] = useState(getLibraryState);
  useEffect(() => {
    const update = () => setLibrary({ ...getLibraryState() });
    window.addEventListener(LIBRARY_EVENT, update);
    window.addEventListener(SESSION_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(LIBRARY_EVENT, update); window.removeEventListener(SESSION_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return library;
}
export function useSession() {
  const [session, setSession] = useState(getSession);
  useEffect(() => {
    const update = () => setSession(getSession());
    const storage = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) restoreStoredSession(); };
    window.addEventListener(SESSION_EVENT, update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(SESSION_EVENT, update); window.removeEventListener('storage', storage); };
  }, []);
  return session;
}
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches || false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
const scrollPositions = new Map<string, number>();
export function useHash() {
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  const current = useRef(path);
  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const update = (event: HashChangeEvent) => {
      const previous = new URL(event.oldURL).hash.slice(1) || current.current;
      scrollPositions.set(previous, window.scrollY);
      if (scrollPositions.size > 50) scrollPositions.delete(scrollPositions.keys().next().value!);
      current.current = location.hash.slice(1) || '/'; setPath(current.current);
    };
    window.addEventListener('hashchange', update);
    return () => { window.removeEventListener('hashchange', update); history.scrollRestoration = previousRestoration; };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo(0, scrollPositions.get(path) || 0));
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return path;
}
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--visual-height', `${viewport?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty('--visual-top', `${viewport?.offsetTop || 0}px`);
      document.documentElement.dataset.keyboard = viewport && window.innerHeight - viewport.height > 140 ? 'open' : 'closed';
    };
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); delete document.documentElement.dataset.keyboard; };
  }, []);
}
