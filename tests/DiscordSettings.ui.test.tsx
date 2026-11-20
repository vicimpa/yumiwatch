// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { DiscordSettingsCard } from '~/components/DiscordSettings';
import { useDiscordPresence } from '~/hooks/useDiscordPresence';
import { useAppDiscordPresence } from '~/hooks/useAppDiscordPresence';
import { discordPresenceEnabled, saveDiscordPresence } from '~/lib/discord-presence';
import type { PresencePlayback } from '~/core/DiscordPresence';
import { anime, video } from './fixtures';

const native = vi.hoisted(() => ({
  desktopInvoke: vi.fn().mockResolvedValue(undefined),
  isDesktopWindow: vi.fn(() => true),
}));

vi.mock('~/lib/desktop', () => native);

beforeEach(() => {
  localStorage.clear();
  native.desktopInvoke.mockClear();
  native.isDesktopWindow.mockReturnValue(true);
  vi.stubEnv('VITE_DISCORD_APPLICATION_ID', '1571940571214520440');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it('starts enabled and persists an explicit opt-out', () => {
  const { unmount } = render(<DiscordSettingsCard />);

  const toggle = screen.getByRole('checkbox', {
    name: 'Показывать просмотр в Discord',
  }) as HTMLInputElement;

  expect(toggle.checked).toBe(true);
  fireEvent.click(toggle);
  expect(discordPresenceEnabled()).toBe(false);
  unmount();
  render(<DiscordSettingsCard />);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(discordPresenceEnabled()).toBe(true);
});

it('hides the setting outside a desktop window', () => {
  native.isDesktopWindow.mockReturnValue(false);

  const { container } = render(<DiscordSettingsCard />);

  expect(container.textContent).toBe('');
});

it('disables the setting if the application ID is missing', () => {
  vi.stubEnv('VITE_DISCORD_APPLICATION_ID', '');
  render(<DiscordSettingsCard />);

  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
});

function Watching({
  episode = '1',
  dubbing,
  playback,
}: {
  episode?: string;
  dubbing?: string;
  playback?: PresencePlayback;
}) {
  useAppDiscordPresence('/anime/10531?view=watch');
  useDiscordPresence(anime, video(episode, dubbing), playback);

  return null;
}

it('publishes loading through native IPC before the player has a playback snapshot', async () => {
  const { rerender } = render(<Watching />);
  await waitFor(() =>
    expect(native.desktopInvoke.mock.lastCall?.[1].activity).toMatchObject({
      details: `${anime.title} (AniLibria)`,
      state: 'Серия 1 · Загрузка',
    })
  );
  expect(native.desktopInvoke.mock.lastCall?.[1].activity).not.toHaveProperty('timestamps');
  native.desktopInvoke.mockClear();
  rerender(
    <Watching
      episode="2"
      dubbing="Субтитры Yummy"
      playback={{ position: 0, duration: 1400, playing: false, reason: 'loadedmetadata' }}
    />
  );
  await waitFor(() =>
    expect(native.desktopInvoke.mock.lastCall?.[1].activity).toMatchObject({
      details: `${anime.title} (Субтитры Yummy)`,
      state: 'Серия 2 · Загрузка',
    })
  );
  expect(native.desktopInvoke.mock.calls.map(([, args]) => args.activity)).toEqual([
    expect.objectContaining({ state: 'Серия 2 · Загрузка' }),
  ]);
  rerender(
    <Watching
      episode="2"
      dubbing="Субтитры Yummy"
      playback={{ position: 0, duration: 1400, playing: true, reason: 'playing' }}
    />
  );
  await waitFor(() =>
    expect(native.desktopInvoke.mock.lastCall?.[1].activity?.state).toBe(
      'Серия 2 · Воспроизводится'
    )
  );
});

it('updates native IPC on playback, settings changes, episode changes and unmount', async () => {
  const playback = { position: 60, duration: 1400, playing: true };

  const { rerender, unmount } = render(<Watching playback={playback} />);

  await waitFor(() =>
    expect(native.desktopInvoke).toHaveBeenLastCalledWith(
      'set_discord_presence',
      expect.objectContaining({
        applicationId: '1571940571214520440',
        activity: expect.objectContaining({ state: 'Серия 1 · Воспроизводится' }),
      })
    )
  );

  saveDiscordPresence(false);
  expect(native.desktopInvoke).toHaveBeenLastCalledWith(
    'set_discord_presence',
    expect.objectContaining({ activity: null })
  );
  saveDiscordPresence(true);
  expect(native.desktopInvoke.mock.lastCall?.[1].activity.state).toBe('Серия 1 · Воспроизводится');

  rerender(<Watching episode="2" playback={playback} />);
  await waitFor(() =>
    expect(native.desktopInvoke.mock.lastCall?.[1].activity?.state).toBe(
      'Серия 2 · Воспроизводится'
    )
  );
  unmount();
  expect(native.desktopInvoke.mock.lastCall?.[1].activity).toBe(null);
});

it('does not invoke desktop APIs in a browser or on mobile', async () => {
  native.isDesktopWindow.mockReturnValue(false);
  saveDiscordPresence(true);
  render(<Watching playback={{ position: 60, duration: 1400, playing: true }} />);
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(native.desktopInvoke).not.toHaveBeenCalled();
});
