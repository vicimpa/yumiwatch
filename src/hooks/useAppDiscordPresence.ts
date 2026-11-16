import { useEffect, useMemo } from 'preact/hooks';

import { PRESENCE_INTERVAL } from '~/core/DiscordPresence';
import { routePresence } from '~/lib/discord-context';
import {
  DISCORD_SETTINGS_EVENT,
  discordPresence,
  discordPresenceAvailable,
} from '~/lib/discord-presence';

import { useDiscordContext } from './useDiscordContext';

export function useAppDiscordPresence(path: string) {
  const activity = useMemo(() => routePresence(path), [path]);

  useDiscordContext(activity, 0);

  useEffect(() => {
    if (!discordPresenceAvailable()) return;

    const timer = setInterval(discordPresence.refresh, PRESENCE_INTERVAL);

    discordPresence.resume();
    window.addEventListener(DISCORD_SETTINGS_EVENT, discordPresence.refresh);
    window.addEventListener('pagehide', discordPresence.suspend);
    window.addEventListener('pageshow', discordPresence.resume);

    return () => {
      clearInterval(timer);
      window.removeEventListener(DISCORD_SETTINGS_EVENT, discordPresence.refresh);
      window.removeEventListener('pagehide', discordPresence.suspend);
      window.removeEventListener('pageshow', discordPresence.resume);
      discordPresence.suspend();
    };
  }, []);
}
