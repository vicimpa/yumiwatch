import { useEffect, useRef } from 'preact/hooks';

import type { DiscordActivity } from '~/core/DiscordPresence';
import { discordPresence } from '~/lib/discord-presence';

export function useDiscordContext(activity: DiscordActivity | undefined, priority = 10) {
  const current = useRef(activity);

  current.current = activity;

  useEffect(() => discordPresence.register(priority, () => current.current), [priority]);
  useEffect(() => discordPresence.publish(), [activity]);
}
