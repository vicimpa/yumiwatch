import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback } from 'preact/hooks';

import { usesNativePlayback } from '~/lib/native-playback';
import {
  PLAYBACK_QUALITIES,
  PLAYBACK_UPSCALERS,
  UPSCALE_SHARPNESS,
  savePlaybackSettings,
  usePlaybackSettings,
} from '~/lib/playback-settings';

import { Dropdown, Field, Icon, Select, SettingsCard, Toggle } from '~/ui';

const saveUpscale = (value: string) => {
  const mode = PLAYBACK_UPSCALERS.find(option => option.value === value);
  if (mode) savePlaybackSettings({ upscale: mode.value });
};

export const VideoUpscaleSetting: FC = () => {
  const { upscale, upscaleSharpness } = usePlaybackSettings();

  return (
    <>
      <label class="video-setting-field video-upscale-setting">
        <span>Апскейл</span>
        <Select
          aria-label="Апскейл видео"
          value={upscale}
          onChange={event => saveUpscale(event.currentTarget.value)}
        >
          {PLAYBACK_UPSCALERS.map(({ value, label }) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label class="video-setting-field video-upscale-setting">
        <span>Резкость контуров</span>
        <Select
          aria-label="Резкость контуров"
          value={upscaleSharpness}
          onChange={event => {
            const value = event.currentTarget.value;
            const level = UPSCALE_SHARPNESS.find(option => option.value === value);
            if (level) savePlaybackSettings({ upscaleSharpness: level.value });
          }}
        >
          {UPSCALE_SHARPNESS.map(({ value, label }) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
    </>
  );
};

export const AutoPictureInPictureSetting: FC = () => {
  const settings = usePlaybackSettings();
  if (!usesNativePlayback()) return null;

  return (
    <Toggle
      checked={settings.autoPictureInPicture}
      onChange={event =>
        savePlaybackSettings({ autoPictureInPicture: event.currentTarget.checked })
      }
    >
      Картинка в картинке при выходе из плеера
    </Toggle>
  );
};

export const AutoSkipSettings: FC = () => {
  const settings = usePlaybackSettings();

  const changeOpening = useCallback(
    (event: JSX.TargetedEvent<HTMLInputElement>) =>
      savePlaybackSettings({ autoSkipOpening: event.currentTarget.checked }),
    []
  );

  const changeEnding = useCallback(
    (event: JSX.TargetedEvent<HTMLInputElement>) =>
      savePlaybackSettings({ autoSkipEnding: event.currentTarget.checked }),
    []
  );

  return (
    <div class="auto-skip-settings" role="group" aria-label="Автопропуск">
      <Toggle checked={settings.autoSkipOpening} onChange={changeOpening}>
        Автопропуск опенинга
      </Toggle>
      <Toggle checked={settings.autoSkipEnding} onChange={changeEnding}>
        Автопропуск титров
      </Toggle>
      <small>Только в нашем плеере, по меткам источника. Сцены после титров остаются.</small>
    </div>
  );
};

export const PlaybackSettingsCard: FC = () => {
  const settings = usePlaybackSettings();

  const changeQuality = useCallback(
    (value: string) => savePlaybackSettings({ quality: value }),
    []
  );

  return (
    <SettingsCard
      title="Наш плеер"
      description="Экран просмотра занимает только плеер. Озвучки, серии и комментарии доступны в его боковых панелях. Оригинальные плееры источников можно открыть со страницы аниме."
      icon={<Icon name="play" size={25} />}
    >
      <Field class="settings-choice" label="Предпочитаемое качество">
        <Dropdown
          aria-label="Предпочитаемое качество"
          value={settings.quality}
          onChange={changeQuality}
          options={PLAYBACK_QUALITIES.map(value => ({
            value,
            label:
              value === 'auto'
                ? 'Авто · до 480p'
                : `${value}p${value === '360' ? ' · экономия трафика' : ''}`,
          }))}
        />
      </Field>
      {usesNativePlayback() && (
        <Field class="settings-choice" label="Апскейл видео">
          <Dropdown
            aria-label="Апскейл видео"
            value={settings.upscale}
            onChange={saveUpscale}
            options={[...PLAYBACK_UPSCALERS]}
          />
        </Field>
      )}
      <AutoPictureInPictureSetting />
    </SettingsCard>
  );
};
