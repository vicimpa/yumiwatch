import { useEffect, useState } from 'preact/hooks';
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
export function useHash() {
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const update = () => { setPath(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return path;
}
