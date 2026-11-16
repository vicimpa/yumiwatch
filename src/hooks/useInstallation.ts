import { useCallback, useEffect, useState } from 'preact/hooks';

import { notify } from '~/lib/notifications';

export type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function useInstallation() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone
  );

  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };

    const installed = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
    };

    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) {
      location.hash = '/settings';

      return;
    }
    try {
      await installPrompt.prompt();

      const choice = await installPrompt.userChoice;

      if (choice.outcome === 'accepted') notify('YummyWatch появится на главном экране');
      setInstallPrompt(undefined);
    } catch {
      notify('Открой меню браузера и выбери установку приложения.');
    }
  }, [installPrompt]);

  return { installPrompt, installed, install };
}

export type Installation = ReturnType<typeof useInstallation>;
