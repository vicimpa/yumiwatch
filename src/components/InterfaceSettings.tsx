import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback } from 'preact/hooks';

import { supportsInterfaceScale } from '~/lib/interface-scale';
import {
  INTERFACE_SCALES,
  saveInterfaceSettings,
  useInterfaceSettings,
} from '~/lib/interface-settings';

import { Field, Icon, Input, Select, SettingsCard, Toggle } from '~/ui';

export const InterfaceSettingsCard: FC = () => {
  const settings = useInterfaceSettings();

  const changeScale = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) =>
      saveInterfaceSettings({
        scale:
          event.currentTarget.value === 'system' ? 'system' : Number(event.currentTarget.value),
      }),
    []
  );

  const changeVolume = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) =>
      saveInterfaceSettings({ volume: Number(event.currentTarget.value) }),
    []
  );

  const changeSounds = useCallback(
    (event: JSX.TargetedEvent<HTMLInputElement>) =>
      saveInterfaceSettings({ sounds: event.currentTarget.checked }),
    []
  );

  const changeEffectsVolume = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) =>
      saveInterfaceSettings({ effectsVolume: Number(event.currentTarget.value) }),
    []
  );

  const changeAnimations = useCallback(
    (event: JSX.TargetedEvent<HTMLInputElement>) =>
      saveInterfaceSettings({ animations: event.currentTarget.checked }),
    []
  );

  const changeStyle = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) =>
      saveInterfaceSettings({ style: event.currentTarget.value as typeof settings.style }),
    []
  );

  return (
    <SettingsCard
      class="interface-settings"
      title="Интерфейс и управление"
      description="Настрой медиакаталог под себя. Всё сохраняется на этом устройстве."
      icon={<Icon name="settings" size={25} />}
    >
      {supportsInterfaceScale() && (
        <>
          <Field class="interface-style" label="Масштаб интерфейса">
            <Select aria-label="Масштаб интерфейса" value={settings.scale} onChange={changeScale}>
              <option value="system">По системе</option>
              {INTERFACE_SCALES.map(scale => (
                <option value={scale} key={scale}>
                  {Math.round(scale * 100)}%
                </option>
              ))}
            </Select>
          </Field>
          <p class="fine-print">
            По умолчанию учитываем системный масштаб и размер текста Linux. Ручной масштаб
            применяется поверх масштаба экрана.
          </p>
        </>
      )}
      <Field
        class="interface-range"
        label={
          <>
            Общая громкость <output>{Math.round(settings.volume * 100)}%</output>
          </>
        }
      >
        <Input
          type="range"
          min="0"
          max="1"
          step=".05"
          aria-label="Общая громкость"
          value={settings.volume}
          onInput={changeVolume}
        />
      </Field>
      <p class="fine-print">Громкость нашего плеера и звуков интерфейса.</p>
      <Toggle checked={settings.sounds} onChange={changeSounds}>
        Звуки наведения, выбора и переходов
      </Toggle>
      <Field
        class="interface-range"
        label={
          <>
            Громкость интерфейса <output>{Math.round(settings.effectsVolume * 100)}%</output>
          </>
        }
      >
        <Input
          type="range"
          min="0"
          max="1"
          step=".05"
          aria-label="Громкость интерфейса"
          disabled={!settings.sounds}
          value={settings.effectsVolume}
          onInput={changeEffectsVolume}
        />
      </Field>
      <Toggle checked={settings.animations} onChange={changeAnimations}>
        Анимации переходов и боковых панелей
      </Toggle>
      <p class="fine-print">Системная настройка уменьшения движения имеет приоритет.</p>
      <Field class="interface-style" label="Оформление">
        <Select aria-label="Стиль интерфейса" value={settings.style} onChange={changeStyle}>
          <option value="classic">Классический</option>
          <option value="cinema">Кинозал</option>
          <option value="contrast">Контрастный</option>
        </Select>
      </Field>
      <div class="keyboard-reference">
        <h3>Управление с клавиатуры</h3>
        <p>
          <kbd>← ↑ ↓ →</kbd> выбор · <kbd>Enter</kbd> открыть · <kbd>Esc / Backspace</kbd> закрыть
          панель / назад · <kbd>/</kbd> или <kbd>Ctrl/⌘ K</kbd> поиск
        </p>
        <p>
          При просмотре: <kbd>Enter</kbd> управление · <kbd>Space / K</kbd> пауза · <kbd>J / L</kbd>{' '}
          ±10 с · <kbd>E</kbd> серии · <kbd>C</kbd> комментарии · <kbd>I</kbd> об аниме ·{' '}
          <kbd>F</kbd> полный экран · <kbd>M</kbd> звук.
        </p>
      </div>
    </SettingsCard>
  );
};
