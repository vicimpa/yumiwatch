import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FunctionalComponent as FC } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import {
  desktopFullscreen,
  desktopFullscreenChanging,
  desktopInvoke,
  isDesktopWindow,
  syncDesktopFullscreen,
  toggleDesktopFullscreen,
} from '~/lib/desktop';
import { notify } from '~/lib/notifications';
import type { PlaybackClosePositions } from '~/lib/playback-media';
import { PLAYER_CHROME_EVENT, playerChromeVisible } from '~/lib/player-chrome';
import { PLAYBACK_SHUTDOWN } from '~/lib/playback-settings';

const action = (run: () => Promise<void>) => {
  void run().catch(() => notify('Не удалось изменить окно.'));
};

export const WindowChrome: FC<{ watching?: boolean }> = ({ watching = false }) => {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [visible, setVisible] = useState(playerChromeVisible);
  const chrome = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isDesktopWindow()) return;
    const saveBeforeClose = (event: Event) => {
      const { detail } = event as CustomEvent<PlaybackClosePositions>;
      window.dispatchEvent(new CustomEvent(PLAYBACK_SHUTDOWN, { detail: detail ?? {} }));
      void desktopInvoke('window_close_saved', {}).catch(() => {});
    };
    window.addEventListener('yumiwatch:window-close-requested', saveBeforeClose);
    return () => window.removeEventListener('yumiwatch:window-close-requested', saveBeforeClose);
  }, []);

  useEffect(() => {
    const update = () => setVisible(playerChromeVisible());

    window.addEventListener(PLAYER_CHROME_EVENT, update);
    update();

    return () => window.removeEventListener(PLAYER_CHROME_EVENT, update);
  }, []);

  useEffect(() => {
    if (isDesktopWindow() && document.documentElement.dataset.desktop === 'macos')
      void desktopInvoke('set_window_controls_visible', { visible }).catch(() => {});
  }, [visible, fullscreen]);

  useEffect(
    () => () => {
      if (isDesktopWindow() && document.documentElement.dataset.desktop === 'macos')
        void desktopInvoke('set_window_controls_visible', { visible: true }).catch(() => {});
    },
    []
  );

  useEffect(() => {
    if (!isDesktopWindow()) return;

    const appWindow = getCurrentWindow();
    const macos = document.documentElement.dataset.desktop === 'macos';
    let disposed = false,
      revision = 0;

    const sync = async () => {
      const current = ++revision;
      const [maximized, nativeFullscreen] = await Promise.all([
        macos ? false : appWindow.isMaximized(),
        appWindow.isFullscreen(),
      ]);

      if (disposed || current !== revision) return;
      setMaximized(maximized);
      if (desktopFullscreenChanging()) return;
      setFullscreen(nativeFullscreen || !!document.fullscreenElement);
      syncDesktopFullscreen(nativeFullscreen);
    };

    const refresh = () => {
      void sync().catch(() => {});
    };

    // AppKit reports fullscreen transitions directly, including the green window button.
    const resize = macos ? undefined : appWindow.onResized(refresh);

    const externalError = () => notify('Не удалось открыть ссылку в браузере.');

    const scaleError = () => notify('Не удалось изменить масштаб интерфейса. Попробуй ещё раз.');

    const updateFullscreen = () => {
      revision++;
      setFullscreen(desktopFullscreen() || !!document.fullscreenElement);
    };

    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.code !== 'KeyF' && event.key.toLowerCase() !== 'f') return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input,select,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox]'
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat)
        void toggleDesktopFullscreen().catch(() => notify('Не удалось изменить полный экран.'));
    };

    refresh();
    document.addEventListener('fullscreenchange', refresh);
    window.addEventListener('yumiwatch:native-fullscreen', refresh);
    window.addEventListener('yumiwatch:external-error', externalError);
    window.addEventListener('yumiwatch:scale-error', scaleError);
    window.addEventListener('yumiwatch:fullscreen', updateFullscreen);
    window.addEventListener('keydown', keyboard, true);

    return () => {
      disposed = true;
      void resize?.then(unlisten => unlisten());
      document.removeEventListener('fullscreenchange', refresh);
      window.removeEventListener('yumiwatch:native-fullscreen', refresh);
      window.removeEventListener('yumiwatch:external-error', externalError);
      window.removeEventListener('yumiwatch:scale-error', scaleError);
      window.removeEventListener('yumiwatch:fullscreen', updateFullscreen);
      window.removeEventListener('keydown', keyboard, true);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopWindow() || fullscreen) return;

    const dragWindow = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target = event.target;

      // Keep hit testing on the real content. Controls and cards never become
      // drag handles when they scroll underneath the transparent titlebar.
      if (
        !(target instanceof Element) ||
        target.closest(
          'a[href],button,input,select,textarea,label,summary,video,audio,dialog,article,[data-gallery-item],.anime-card,.card-image,.poster-artwork,.episode-card,[role="dialog"],[role="button"],[role="link"],[role="slider"],[role="scrollbar"],[role="tab"],[role="tooltip"],[data-selectable],[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"]),[data-no-window-drag],.navigation-history,.window-controls'
        )
      )
        return;

      const bounds = chrome.current?.getBoundingClientRect();
      const inTitlebar =
        bounds &&
        event.clientX >= bounds.left &&
        event.clientX < bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY < bounds.bottom;

      if (!inTitlebar && !target.closest('.media-nav, .phone-header, .player-window-drag-region'))
        return;

      event.preventDefault();
      action(() =>
        event.detail === 2
          ? getCurrentWindow().toggleMaximize()
          : getCurrentWindow().startDragging()
      );
    };

    document.addEventListener('mousedown', dragWindow);

    return () => document.removeEventListener('mousedown', dragWindow);
  }, [fullscreen]);

  const minimizeWindow = useCallback(() => action(() => getCurrentWindow().minimize()), []);

  const maximizeWindow = useCallback(() => action(() => getCurrentWindow().toggleMaximize()), []);

  const closeWindow = useCallback(() => action(() => getCurrentWindow().close()), []);

  if (
    !isDesktopWindow() ||
    !['macos', 'windows'].includes(document.documentElement.dataset.desktop || '') ||
    fullscreen
  )
    return null;

  const windows = document.documentElement.dataset.desktop === 'windows';

  return (
    <>
      <div
        ref={chrome}
        class={`window-chrome ${visible ? '' : 'is-hidden'}`}
        inert={!visible}
        aria-hidden={!visible}
      >
        <div class="window-chrome-spacer" aria-hidden="true" />
        {windows && (
          <div class="window-controls" role="group" aria-label="Управление окном">
            <button aria-label="Свернуть окно" title="Свернуть" onClick={minimizeWindow}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M1 6.5h10" />
              </svg>
            </button>
            <button
              aria-label={maximized ? 'Восстановить окно' : 'Развернуть окно'}
              title={maximized ? 'Восстановить' : 'Развернуть'}
              onClick={maximizeWindow}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                {maximized ? (
                  <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" />
                ) : (
                  <path d="M1.5 1.5h9v9h-9z" />
                )}
              </svg>
            </button>
            <button
              class="window-close"
              aria-label="Закрыть окно"
              title="Закрыть"
              onClick={closeWindow}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="m1.5 1.5 9 9m0-9-9 9" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {watching && <div class="player-window-drag-region" aria-hidden="true" />}
    </>
  );
};
