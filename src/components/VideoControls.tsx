import type { ComponentChildren, FunctionalComponent as FC, JSX, RefObject } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import type { PlaybackMedia } from '~/lib/playback-media';
import { useFullscreen } from '~/hooks/useFullscreen';
import { useMediaStatus } from '~/hooks/useMediaStatus';
import { isDesktop, isDesktopWindow } from '~/lib/desktop';
import { saveInterfaceSettings } from '~/lib/interface-settings';
import { mediaAtEnd } from '~/lib/media-state';
import type { PictureInPictureControls } from '~/lib/native-playback';
import { PLAYBACK_RATES, setPlaybackRate } from '~/lib/playback-rate';
import { savePlaybackSettings } from '~/lib/playback-settings';
import { formatTime } from '~/lib/player';

import { PlaybackLoader } from './PlaybackLoader';
import { VideoUpscaleSetting } from './PlaybackSettings';
import { PictureInPictureButton } from './PictureInPictureButton';
import { VideoTimeline } from './VideoTimeline';
import { Icon, Input, Select } from '~/ui';

const physical: Partial<Record<string, string>> = {
  KeyK: 'k',
  KeyJ: 'j',
  KeyL: 'l',
  KeyM: 'm',
  KeyF: 'f',
  Space: ' ',
};

export const CONTROLS_IDLE_MS = 3000;

export type TVideoControlsProps = {
  native?: boolean;
  mediaVersion?: string;
  media: RefObject<PlaybackMedia>;
  frame: RefObject<HTMLDivElement>;
  title: string;
  position: number;
  loading: boolean;
  failed: boolean;
  pip?: PictureInPictureControls;
  settings: ComponentChildren;
  previous?: () => void;
  next?: () => void;
  quality?: ComponentChildren;
  streamInfo?: ComponentChildren;
  syncStatus?: ComponentChildren;
  onBack?: () => void;
  onVoice?: () => void;
  voiceLabel?: string;
  onVisibility: (visible: boolean) => void;
  onEpisodes?: () => void;
  onComments?: () => void;
};

export const VideoControls: FC<TVideoControlsProps> = ({
  native,
  mediaVersion = '',
  media,
  frame,
  title,
  position,
  loading,
  failed,
  pip,
  settings,
  quality,
  streamInfo,
  syncStatus,
  previous,
  next,
  onVisibility,
  onEpisodes,
  onComments,
  onBack,
  onVoice,
  voiceLabel,
}) => {
  const { ended, paused, buffering, offline, duration, buffered, muted, volume, rate } =
    useMediaStatus(media, mediaVersion);
  const [visible, setVisible] = useState(true),
    [menu, setMenu] = useState(false);
  const [activity, setActivity] = useState(0),
    [dragging, setDragging] = useState(false);
  const [pointerOnControls, setPointerOnControls] = useState(false);
  const keyboard = useRef(false);
  const controls = useRef<HTMLDivElement>(null);
  const surfaceClickTimer = useRef<ReturnType<typeof setTimeout>>();
  const surfaceClickPlayback = useRef<{ video: PlaybackMedia; paused: boolean }>();

  useEffect(
    () => () => {
      clearTimeout(surfaceClickTimer.current);
      surfaceClickPlayback.current = undefined;
    },
    [mediaVersion, failed]
  );

  const menuElement = useRef<HTMLDivElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);

  const wake = useCallback(() => {
    setVisible(true);
    setActivity(value => value + 1);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      keyboard.current = false;

      const target = event.target;
      setPointerOnControls(
        target instanceof Element &&
          !!controls.current?.contains(target) &&
          !!target.closest('[data-controls-hover]')
      );

      if (
        document.querySelector('.media-app.is-playback') ||
        (target instanceof Node && frame.current?.contains(target)) ||
        (target instanceof Element && target.closest('.window-chrome'))
      )
        wake();
    };

    const leave = (event: PointerEvent) => {
      if (event.relatedTarget === null) setPointerOnControls(false);
    };
    const blur = () => setPointerOnControls(false);

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', move, { passive: true });
    window.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('blur', blur);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', blur);
    };
  }, [frame, wake]);

  const seek = useCallback(
    (time: number) => {
      const video = media.current;

      if (video && Number.isFinite(video.duration))
        video.currentTime = Math.max(0, Math.min(video.duration, time));
      wake();
    },
    [media, wake]
  );

  const togglePlay = useCallback(() => {
    const video = media.current;

    if (!video) return;
    if (mediaAtEnd(video)) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    } else if (video.paused) void video.play().catch(() => {});
    else video.pause();
    wake();
  }, [media, wake]);

  const toggleMute = useCallback(() => {
    if (media.current) {
      media.current.muted = !media.current.muted;
      savePlaybackSettings({ muted: media.current.muted });
    }
    wake();
  }, [media, wake]);

  const { fullscreen, error: fullError, toggle: toggleFullscreen } = useFullscreen(frame, wake);

  const surfaceClick = useCallback(
    (event: MouseEvent) => {
      clearTimeout(surfaceClickTimer.current);
      if (event.detail > 1) return;
      surfaceClickPlayback.current = undefined;
      if (!visible) {
        wake();

        return;
      }
      // Keyboard activation stays immediate. Wait briefly before a mouse click so
      // a double click can change fullscreen without pausing the video.
      if (!event.detail) {
        togglePlay();

        return;
      }

      const video = media.current;

      if (!video) return;
      surfaceClickPlayback.current = { video, paused: video.paused };
      surfaceClickTimer.current = setTimeout(() => {
        if (media.current === video) togglePlay();
      }, 250);
    },
    [visible, wake, togglePlay, media]
  );

  const surfaceDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(surfaceClickTimer.current);

      const before = surfaceClickPlayback.current;

      surfaceClickPlayback.current = undefined;
      // Respect slower double clicks too, after the single-click delay elapsed.
      if (before && before.video === media.current && before.video.paused !== before.paused) {
        if (before.paused) before.video.pause();
        else void before.video.play().catch(() => {});
      }
      void toggleFullscreen();
    },
    [media, toggleFullscreen]
  );

  useEffect(() => {
    const up = () => setDragging(false);

    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  useEffect(() => {
    if (paused || loading || failed || buffering || menu || dragging || pointerOnControls) {
      setVisible(true);

      return;
    }

    const timer = setTimeout(() => {
      // A hidden toolbar must not retain a keyboard activation target. Keep
      // focus in the player so the next shortcut works without a mouse click.
      const active = document.activeElement;
      if (active !== controls.current && controls.current?.contains(active))
        controls.current.focus({ preventScroll: true });
      setVisible(false);
    }, CONTROLS_IDLE_MS);

    return () => clearTimeout(timer);
  }, [paused, loading, failed, buffering, menu, dragging, pointerOnControls, activity]);

  useEffect(() => {
    onVisibility(visible);
  }, [visible]);

  useEffect(() => {
    if (failed) setMenu(false);
  }, [failed]);

  useEffect(() => {
    if (!menu) return;

    const outside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (menuElement.current?.contains(target) || menuButton.current?.contains(target)) return;
      setMenu(false);
      wake();
      if (
        !(target instanceof HTMLElement && target.closest('.native-auto-action')) &&
        (controls.current?.closest('.universal-frame') || frame.current)?.contains(target)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('click', outside, true);

    return () => document.removeEventListener('click', outside, true);
  }, [menu]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (failed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return;

      const target = event.target instanceof HTMLElement ? event.target : null;

      if (
        target?.closest(
          'input,select,textarea,[contenteditable]:not([contenteditable=false]),[role=textbox]'
        )
      )
        return;

      const dialog = document.querySelector('[aria-modal=true]');

      if (dialog && !frame.current?.contains(dialog)) return;
      if (target?.closest('[data-sidebar-open=true]') && event.key.startsWith('Arrow')) return;
      if (event.key === 'Escape') {
        if (menuElement.current) {
          event.preventDefault();
          setMenu(false);
        }
        return;
      }
      if (event.key === 'Enter' && !target?.closest('button,a')) {
        event.preventDefault();
        keyboard.current = true;
        wake();
        requestAnimationFrame(() =>
          controls.current
            ?.querySelector<HTMLButtonElement>('.video-toolbar button:not(:disabled)')
            ?.focus()
        );

        return;
      }
      if (
        event.key.startsWith('Arrow') &&
        target?.closest(
          '.video-toolbar button,.video-top-actions button,.native-auto-action button'
        )
      )
        return;

      const key = physical[event.code] || event.key.toLowerCase();

      if (key === ' ' && target?.closest('button,a')) return;
      if (![' ', 'k', 'j', 'l', 'm', 'f', 'arrowleft', 'arrowright'].includes(key)) return;
      event.preventDefault();
      keyboard.current = true;
      wake();
      if (event.repeat && [' ', 'k', 'm', 'f'].includes(key)) return;
      if (key === ' ' || key === 'k') togglePlay();
      else if (key === 'j' || key === 'arrowleft')
        seek((media.current?.currentTime || 0) - (key === 'j' ? 10 : 5));
      else if (key === 'l' || key === 'arrowright')
        seek((media.current?.currentTime || 0) + (key === 'l' ? 10 : 5));
      else if (key === 'm') toggleMute();
      else if (key === 'f' && !isDesktopWindow()) void toggleFullscreen();
    };

    window.addEventListener('keydown', keydown);

    return () => window.removeEventListener('keydown', keydown);
  }, [failed]);

  const activatePointer = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      keyboard.current = false;
      if (!(event.target as HTMLElement).closest('.video-hit-area')) wake();
    },
    [wake]
  );

  const activateKeyboard = useCallback(() => {
    keyboard.current = true;
    wake();
  }, [wake]);

  const focusControls = useCallback(
    (event: JSX.TargetedFocusEvent<HTMLDivElement>) => {
      if (
        event.target !== event.currentTarget &&
        (keyboard.current || document.documentElement.dataset.inputMode === 'keyboard')
      )
        wake();
    },
    [wake]
  );

  const closeSettings = useCallback(() => setMenu(false), []);

  const changeRate = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => {
      const rate = Number(event.currentTarget.value);
      if (media.current && PLAYBACK_RATES.includes(rate)) {
        setPlaybackRate(media.current, rate);
        savePlaybackSettings({ rate });
      }
      wake();
    },
    [media, wake]
  );

  const startDragging = useCallback(() => setDragging(true), []);

  const seekInput = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => seek(Number(event.currentTarget.value)),
    [seek]
  );

  const changeVolume = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => {
      if (media.current) {
        media.current.volume = Number(event.currentTarget.value);
        saveInterfaceSettings({ volume: media.current.volume });
        if (media.current.muted) {
          media.current.muted = false;
          savePlaybackSettings({ muted: false });
        }
      }
      wake();
    },
    [media, wake]
  );

  const toggleSettings = useCallback(() => {
    setMenu(value => !value);
    wake();
  }, [wake]);

  const fullscreenAction = useCallback(() => void toggleFullscreen(), [toggleFullscreen]);

  const controlError = pip?.error || fullError;

  return (
    <div
      ref={controls}
      inert={failed}
      aria-hidden={failed}
      class={`video-controls ${visible ? 'is-visible' : 'is-hidden'}`}
      tabIndex={0}
      aria-label="Видеоплеер"
      onPointerDown={activatePointer}
      onKeyDown={activateKeyboard}
      onFocusIn={focusControls}
    >
      <button
        class="video-hit-area"
        tabIndex={-1}
        aria-label={
          visible ? (paused ? 'Воспроизвести видео' : 'Приостановить видео') : 'Показать управление'
        }
        onClick={surfaceClick}
        onDblClick={surfaceDoubleClick}
      />
      {(onBack || onVoice) && (
        <div class="video-chrome video-top-actions" inert={!visible} data-controls-hover>
          {onBack && (
            <button aria-label="Об аниме" title="Об аниме (I)" onClick={onBack}>
              <Icon name="back" size={21} />
              <span>Об аниме</span>
            </button>
          )}
          {onVoice && (
            <button aria-label={`Озвучка: ${voiceLabel || 'Выбрать'}`} onClick={onVoice}>
              <Icon name="volume" size={19} />
              <span>{voiceLabel || 'Озвучка'}</span>
              <Icon name="chevron" size={15} />
            </button>
          )}
        </div>
      )}
      <div class="video-chrome video-heading">
        <span class="video-brand">YUMMYWATCH</span>
        <strong>{title}</strong>
        {streamInfo}
      </div>
      {syncStatus && (
        <span class="video-chrome video-save-status" role="status">
          {syncStatus}
        </span>
      )}
      {pip?.active && !loading && !failed && !buffering && (
        <button
          class="video-pip-return"
          data-controls-hover
          disabled={pip.pending}
          onClick={pip.toggle}
        >
          <Icon name="pictureInPicture" size={22} />
          Вернуть видео в плеер
        </button>
      )}
      {!pip?.active && paused && !loading && !failed && !buffering && (
        <button
          class="video-center-play"
          data-controls-hover
          aria-label={ended ? 'Смотреть заново' : 'Продолжить просмотр'}
          onClick={surfaceClick}
          onDblClick={surfaceDoubleClick}
        >
          <Icon name="play" size={32} />
        </button>
      )}
      {buffering && !paused && !loading && !failed && (
        <PlaybackLoader
          label={offline ? 'Соединение потеряно' : 'Буферизация…'}
          detail={offline ? 'Ждём сеть. Позиция сохранена.' : 'Подгружаем видео'}
        />
      )}
      {menu && (
        <div
          ref={menuElement}
          class="video-settings"
          role="dialog"
          aria-label="Настройки плеера"
          data-controls-hover
        >
          <div class="video-settings-heading">
            <strong>Настройки плеера</strong>
            <button aria-label="Закрыть настройки" onClick={closeSettings}>
              <Icon name="close" />
            </button>
          </div>
          <div class="video-settings-selects">
            {quality}
            <label class="video-setting-field">
              <span>Скорость</span>
              <Select aria-label="Скорость воспроизведения" value={rate} onChange={changeRate}>
                {PLAYBACK_RATES.map(rate => (
                  <option value={rate} key={rate}>
                    {rate}×
                  </option>
                ))}
              </Select>
            </label>
            {native && <VideoUpscaleSetting />}
          </div>
          {settings}
          <p class="video-shortcuts">
            Пробел / K — пауза · J / L — ±10 с · M — звук · F — полный экран
          </p>
        </div>
      )}
      <div
        class="video-chrome video-bottom"
        role="group"
        aria-label="Управление воспроизведением"
        inert={!visible}
        data-controls-hover
      >
        <VideoTimeline
          mediaVersion={mediaVersion}
          media={media}
          duration={duration}
          position={position}
          buffered={buffered}
          visible={visible && !loading && !failed}
          onPointerDown={startDragging}
          onInput={seekInput}
        />
        <div class="video-toolbar">
          <button
            aria-label={ended ? 'Смотреть заново' : paused ? 'Воспроизвести' : 'Пауза'}
            title="Пауза / воспроизведение (K)"
            onClick={togglePlay}
          >
            <Icon name={paused ? 'play' : 'pause'} size={22} />
          </button>
          <button
            class="video-previous"
            aria-label="Предыдущая серия"
            disabled={!previous}
            onClick={previous}
          >
            <Icon name="skipBack" />
          </button>
          <button aria-label="Следующая серия" disabled={!next} onClick={next}>
            <Icon name="skipNext" />
          </button>
          <span class="video-time">
            {formatTime(position)}
            <span> / {formatTime(duration)}</span>
          </span>
          <div class="video-volume">
            <button
              aria-label={muted || !volume ? 'Включить звук' : 'Выключить звук'}
              title="Звук (M)"
              onClick={toggleMute}
            >
              <Icon name={muted || !volume ? 'volumeOff' : 'volume'} />
            </button>
            <Input
              aria-label="Громкость"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onPointerDown={startDragging}
              onInput={changeVolume}
            />
          </div>
          {onEpisodes && (
            <button aria-label="Серии" title="Серии (E)" onClick={onEpisodes}>
              <Icon name="list" />
            </button>
          )}
          {onComments && (
            <button aria-label="Комментарии" title="Комментарии (C)" onClick={onComments}>
              <Icon name="comment" />
            </button>
          )}
          <button
            ref={menuButton}
            aria-label="Настройки плеера"
            aria-expanded={menu}
            title="Настройки"
            onClick={toggleSettings}
          >
            <Icon name="settings" />
          </button>
          {pip && !failed && <PictureInPictureButton pip={pip} />}
          {(!isDesktop() || isDesktopWindow()) && (
            <button
              aria-label={fullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
              title="Полный экран (F)"
              onClick={fullscreenAction}
            >
              <Icon name={fullscreen ? 'minimize' : 'fullscreen'} />
            </button>
          )}
        </div>
      </div>
      {controlError && (
        <p class="video-fullscreen-error" role="status">
          {controlError}
        </p>
      )}
    </div>
  );
};
