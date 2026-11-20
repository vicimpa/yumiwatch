import { useLayoutEffect, useRef } from 'preact/hooks';

import {
  readNativePictureInPictureCard,
  setNativePictureInPictureCard,
} from '~/lib/native-playback';

const FRAME_INTERVAL = 1000 / 30;

export function usePictureInPictureCard(canvas: HTMLCanvasElement | null, watchPath?: string) {
  const placement = useRef(Promise.resolve());

  useLayoutEffect(() => {
    const element = canvas?.parentElement;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !element || !context || !watchPath) return;

    const setVisible = (visible: boolean) => {
      placement.current = placement.current
        .then(() => setNativePictureInPictureCard(visible))
        .catch(() => {});
    };
    const rail = element.closest('.gallery-rail');
    const main = element.closest('main');
    let docked = false;
    let presented = false;
    let generation = 0;
    let nextFrame: ReturnType<typeof setTimeout> | undefined;
    let measurement = 0;

    const draw = async (version: number) => {
      const started = performance.now();
      try {
        const image = await readNativePictureInPictureCard();
        if (image && version === generation) {
          if (canvas.width !== image.width) canvas.width = image.width;
          if (canvas.height !== image.height) canvas.height = image.height;
          context.putImageData(image, 0, 0);
          canvas.hidden = false;
        }
        if (version === generation && !presented) {
          presented = true;
          setVisible(true);
        }
      } catch {
        // Keep the last frame or history preview until a new frame arrives.
      }
      if (version === generation) {
        nextFrame = setTimeout(
          () => void draw(version),
          Math.max(0, FRAME_INTERVAL - (performance.now() - started))
        );
      }
    };

    const stop = (restore: boolean) => {
      generation++;
      clearTimeout(nextFrame);
      canvas.hidden = true;
      if (presented && restore) setVisible(false);
      presented = false;
    };

    const isVisible = () => {
      if (
        !element.isConnected ||
        document.hidden ||
        document.querySelector(
          'dialog[open], [aria-modal=true][data-sidebar-open=true], [data-card-context-menu]'
        )
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const limits = [rail?.getBoundingClientRect(), main?.getBoundingClientRect()];
      const left = Math.max(rect.left, 0, ...limits.map(limit => limit?.left ?? 0));
      const top = Math.max(rect.top, 0, ...limits.map(limit => limit?.top ?? 0));
      const right = Math.min(
        rect.right,
        window.innerWidth,
        ...limits.map(limit => limit?.right ?? window.innerWidth)
      );
      const bottom = Math.min(
        rect.bottom,
        window.innerHeight,
        ...limits.map(limit => limit?.bottom ?? window.innerHeight)
      );
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      return area >= rect.width * rect.height * (docked ? 0.9 : 0.98);
    };

    const update = () => {
      measurement = 0;
      const visible = isVisible();
      if (visible === docked) return;
      docked = visible;
      if (docked) void draw(++generation);
      else stop(true);
    };

    const schedule = () => {
      if (!measurement) measurement = requestAnimationFrame(update);
    };
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(schedule, { threshold: [0, 0.9, 0.98, 1] });
    intersection?.observe(element);
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    for (const target of [element, rail, main, main?.firstElementChild]) {
      if (target) resize?.observe(target);
    }
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'data-sidebar-open'],
    });
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    schedule();

    return () => {
      cancelAnimationFrame(measurement);
      stop(location.hash !== '#' + watchPath);
      intersection?.disconnect();
      resize?.disconnect();
      changes.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [canvas, watchPath]);
}
