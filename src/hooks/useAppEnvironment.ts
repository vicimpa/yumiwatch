import { useEffect, useState } from 'preact/hooks';

export function useAppEnvironment() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout>;

    const connect = () => setOnline(true);

    const disconnect = () => setOnline(false);

    const focusSearch = () => document.getElementById('anime-search')?.focus();

    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'k') return;

      event.preventDefault();

      if (location.hash.startsWith('#/search')) {
        focusSearch();

        return;
      }

      location.hash = '/search';
      clearTimeout(focusTimer);
      focusTimer = setTimeout(focusSearch, 100);
    };

    window.addEventListener('online', connect);
    window.addEventListener('offline', disconnect);
    window.addEventListener('keydown', keyboard);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('online', connect);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('keydown', keyboard);
    };
  }, []);

  return online;
}
