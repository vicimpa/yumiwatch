import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback } from 'preact/hooks';

import {
  PLAYBACK_QUALITIES,
  savePlaybackSettings,
  usePlaybackSettings,
} from '~/lib/playback-settings';

import { Dropdown, Field, Icon, SettingsCard, Toggle } from '~/ui';

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
    </SettingsCard>
  );
};
