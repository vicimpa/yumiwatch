import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';

import { isDesktopWindow } from '~/lib/desktop';
import {
  discordPresenceAvailable,
  discordPresenceEnabled,
  saveDiscordPresence,
} from '~/lib/discord-presence';
import { notify } from '~/lib/notifications';

import { Icon, SettingsCard, Toggle } from '~/ui';

export const DiscordSettingsCard: FC = () => {
  const [enabled, setEnabled] = useState(discordPresenceEnabled);

  const changeEnabled = useCallback((event: JSX.TargetedEvent<HTMLInputElement>) => {
    try {
      saveDiscordPresence(event.currentTarget.checked);
      setEnabled(event.currentTarget.checked);
    } catch (error) {
      notify((error as Error).message);
    }
  }, []);

  if (!isDesktopWindow()) return null;

  const available = discordPresenceAvailable();

  return (
    <SettingsCard
      title="Discord"
      description="Показывай друзьям, какое аниме смотришь или ищешь и где находишься в приложении."
      icon={<Icon name="play" size={25} />}
    >
      <Toggle checked={enabled} disabled={!available} onChange={changeEnabled}>
        Показывать просмотр в Discord
      </Toggle>
      <p class="fine-print">
        {available
          ? 'Discord должен быть запущен, а отображение активности — разрешено в его настройках. После пяти минут паузы статус скрывается.'
          : 'В этой сборке подключение к Discord не настроено.'}
      </p>
    </SettingsCard>
  );
};
