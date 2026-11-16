import { useEffect, useState } from 'preact/hooks';

import { isDesktop } from '~/lib/desktop';
import { notify } from '~/lib/notifications';

export function useAppUpdate() {
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();

  useEffect(() => {
    if (isDesktop() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    let reloading = false;

    const controllerChange = () => {
      if (!reloading) {
        reloading = true;
        location.reload();
      }
    };

    // Only listen after a controller exists: first installation needs no reload.
    if (navigator.serviceWorker.controller)
      navigator.serviceWorker.addEventListener('controllerchange', controllerChange);
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(registration => {
        if (cancelled) return;
        if (registration.waiting) setUpdate(registration);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;

          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              setUpdate(registration);
          });
        });
      })
      .catch(() => notify('Не удалось включить офлайн-режим. Остальные функции доступны.'));

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChange);
    };
  }, []);

  return update;
}
