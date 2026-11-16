import type { DiscordActivity } from '~/core/DiscordPresence';
import { DiscordPresenceRegistry } from '~/core/DiscordPresenceRegistry';

import { desktopInvoke, isDesktopWindow } from './desktop';
import { readJSON, writeJSON } from './storage';

const SETTINGS_KEY = 'yumiwatch:discord-presence';

export const DISCORD_SETTINGS_EVENT = 'yumiwatch:discord-presence-settings';

export function discordPresenceEnabled() {
  return readJSON<unknown>(SETTINGS_KEY, true) !== false;
}

export function saveDiscordPresence(enabled: boolean) {
  if (!writeJSON(SETTINGS_KEY, enabled)) throw new Error('Не удалось сохранить настройку Discord.');

  window.dispatchEvent(new Event(DISCORD_SETTINGS_EVENT));
}

export function discordPresenceAvailable() {
  return isDesktopWindow() && /^\d{17,20}$/.test(import.meta.env.VITE_DISCORD_APPLICATION_ID || '');
}

export async function sendDiscordPresence(activity: DiscordActivity | null) {
  await desktopInvoke('set_discord_presence', {
    applicationId: import.meta.env.VITE_DISCORD_APPLICATION_ID,
    activity,
  });
}

export const discordPresence = new DiscordPresenceRegistry(activity => {
  if (discordPresenceAvailable()) void sendDiscordPresence(activity).catch(() => {});
}, discordPresenceEnabled);
