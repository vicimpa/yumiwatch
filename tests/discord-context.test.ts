import { expect, it, vi } from 'vitest';

import { DiscordPresenceRegistry } from '~/core/DiscordPresenceRegistry';
import { routePresence, searchPresence } from '~/lib/discord-context';

it('shows the route and puts the current search in the member-list details', () => {
  expect(routePresence('/library')).toEqual({
    type: 0,
    details: 'Выбирает аниме',
    state: 'В коллекции',
  });
  expect(routePresence('/search?q=One+Piece')).toEqual({
    type: 0,
    details: 'Ищет «One Piece»',
    state: 'В поиске',
  });
  expect(routePresence('/account?q=private&token=secret').details).toBe('Выбирает аниме');
  expect(searchPresence('  атака\n  титанов  ').details).toBe('Ищет «атака титанов»');
  expect(searchPresence('🐱'.repeat(81)).details).toBe(`Ищет «${'🐱'.repeat(80)}»`);
});

it('restores playback after a picker closes and browsing after playback closes', () => {
  const send = vi.fn();
  const registry = new DiscordPresenceRegistry(send, () => true);
  const browse = searchPresence('');
  const playing = { details: 'One Piece', state: 'Серия 12 · Воспроизводится' };
  const picker = { ...playing, state: 'Выбирает озвучку' };

  registry.register(0, () => browse);
  const stopPlaying = registry.register(100, () => playing);
  const closePicker = registry.register(200, () => picker);

  expect(send).toHaveBeenLastCalledWith(picker);
  closePicker();
  expect(send).toHaveBeenLastCalledWith(playing);
  stopPlaying();
  expect(send).toHaveBeenLastCalledWith(browse);
});

it('ignores inactive retained pages and lets an expired player clear the activity', () => {
  const send = vi.fn();
  const registry = new DiscordPresenceRegistry(send, () => true);

  registry.register(0, () => routePresence('/library'));
  registry.register(10, () => undefined);
  expect(send.mock.lastCall?.[0].state).toBe('В коллекции');
  const stop = registry.register(100, () => null);

  expect(send).toHaveBeenLastCalledWith(null);
  stop();
  expect(send.mock.lastCall?.[0].state).toBe('В коллекции');
});

it('clears on opt-out and page hide, resumes fresh state and sends heartbeats', () => {
  const send = vi.fn();
  let enabled = true;
  let activity = searchPresence('Наруто');
  const registry = new DiscordPresenceRegistry(send, () => enabled);

  registry.register(0, () => activity);
  send.mockClear();
  registry.publish();
  expect(send).not.toHaveBeenCalled();
  registry.refresh();
  expect(send).toHaveBeenLastCalledWith(activity);
  enabled = false;
  registry.refresh();
  expect(send).toHaveBeenLastCalledWith(null);
  enabled = true;
  registry.refresh();
  registry.suspend();
  expect(send).toHaveBeenLastCalledWith(null);
  activity = routePresence('/schedule');
  registry.refresh();
  expect(send).toHaveBeenLastCalledWith(null);
  registry.resume();
  expect(send).toHaveBeenLastCalledWith(activity);
});
