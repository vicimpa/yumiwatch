import type { RefObject } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

import {
  desktopFullscreen,
  isDesktop,
  isDesktopWindow,
  toggleDesktopFullscreen,
} from '~/lib/desktop';

type TFullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

type TFullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void;
};

const noop = () => {};

export function useFullscreen(frame: RefObject<HTMLElement>, changed = noop) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const update = () => {
      const doc = document as TFullscreenDocument;

      setFullscreen(
        desktopFullscreen() ||
          (doc.fullscreenElement || doc.webkitFullscreenElement) === frame.current
      );
      changed();
    };

    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    window.addEventListener('yumiwatch:fullscreen', update);
    update();

    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
      window.removeEventListener('yumiwatch:fullscreen', update);
    };
  }, [frame, changed]);

  const toggle = useCallback(async () => {
    if (isDesktop() && !isDesktopWindow()) return;

    const element = frame.current as TFullscreenElement | null;
    const doc = document as TFullscreenDocument;

    setError('');
    try {
      if (isDesktopWindow()) await toggleDesktopFullscreen();
      else if (doc.fullscreenElement) await doc.exitFullscreen();
      else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
      else if (element?.requestFullscreen) await element.requestFullscreen();
      else if (element?.webkitRequestFullscreen) element.webkitRequestFullscreen();
      else setError('Браузер не поддерживает полный экран с нашим интерфейсом.');
    } catch {
      setError('Не удалось открыть полный экран. Попробуй ещё раз.');
    }
    changed();
  }, [frame, changed]);

  return { fullscreen, error, toggle };
}
