import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback } from 'preact/hooks';

import {
  PLAYBACK_QUALITIES,
  savePlaybackSettings,
  usePlaybackSettings,
} from '~/lib/playback-settings';

import { Field, Icon, Select, SettingsCard, Toggle } from '~/ui';

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
    (event: JSX.TargetedEvent<HTMLSelectElement>) =>
      savePlaybackSettings({ quality: event.currentTarget.value }),
    []
  );

  return (
    <SettingsCard
      title="Наш плеер"
      description="Экран просмотра занимает только плеер. Озвучки, серии и комментарии доступны в его боковых панелях. Оригинальные плееры источников можно открыть со страницы аниме."
      icon={<Icon name="play" size={25} />}
    >
      <Field class="playback-quality-setting" label="Предпочитаемое качество">
        <Select
          aria-label="Предпочитаемое качество"
          value={settings.quality}
          onChange={changeQuality}
        >
          {PLAYBACK_QUALITIES.map(value => (
            <option key={value} value={value}>
              {value === 'auto'
                ? 'Авто · до 480p'
                : `${value}p${value === '360' ? ' · экономия трафика' : ''}`}
            </option>
          ))}
        </Select>
      </Field>
    </SettingsCard>
  );
};
