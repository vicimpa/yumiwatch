import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordPresence, PAUSE_TIMEOUT } from '~/core/DiscordPresence';
import { anime, video } from './fixtures';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => vi.useRealTimers());

function setup(enabled = true) {
  const send = vi.fn();
  const allowed = { value: enabled };
  const presence = new DiscordPresence(
    anime,
    video('2'),
    'https://static.yani.tv/poster.webp',
    send,
    () => allowed.value
  );
  const playing = {
    position: 100,
    duration: 1400,
    playing: true,
    playbackRate: 1,
    reason: 'playing' as const,
  };

  return { send, allowed, presence, playing };
}

describe('Discord playback presence', () => {
  it('waits for playback and respects the sharing preference', () => {
    const { presence, send, allowed, playing } = setup(false);

    presence.update({ ...playing, playing: false, reason: 'loadedmetadata' });
    presence.update(playing);
    expect(send.mock.calls.every(([activity]) => activity === null)).toBe(true);

    allowed.value = true;
    presence.refresh();
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ details: anime.title, state: 'Серия 2 · Воспроизводится' })
    );
  });

  it('includes the poster, anime link and remaining time adjusted for playback speed', () => {
    const { presence, send, playing } = setup();

    presence.update({ ...playing, playbackRate: 2 });
    expect(send).toHaveBeenLastCalledWith({
      details: anime.title,
      state: 'Серия 2 · Воспроизводится',
      animeUrl: `https://ru.yummyani.me/catalog/item/${anime.anime_url}`,
      largeImage: 'https://static.yani.tv/poster.webp',
      timestamps: { start: 950, end: 1650 },
    });

    vi.advanceTimersByTime(15_000);
    presence.refresh();
    expect(send.mock.lastCall?.[0].timestamps).toEqual({ start: 950, end: 1650 });
  });

  it('throttles progress but updates seeks and playback speed immediately', () => {
    const { presence, send, playing } = setup();

    presence.update(playing);
    vi.advanceTimersByTime(500);
    presence.update({ ...playing, position: 100.5, reason: 'timeupdate' });
    expect(send).toHaveBeenCalledTimes(1);

    presence.update({ ...playing, position: 900, reason: 'seeked' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.lastCall?.[0].timestamps.end).toBe(1500);
    expect(send.mock.lastCall?.[0].timestamps.start).toBe(100);

    presence.update({ ...playing, position: 900, playbackRate: 2, reason: 'ratechange' });
    expect(send.mock.lastCall?.[0].timestamps.end).toBe(1250);
    expect(send.mock.lastCall?.[0].timestamps.start).toBe(550);
  });

  it('freezes the timer on pause, expires after five minutes and resumes', () => {
    const { presence, send, playing } = setup();

    presence.update(playing);
    presence.update({ ...playing, playing: false, reason: 'pause' });
    expect(send.mock.lastCall?.[0].state).toBe('Серия 2 · На паузе');
    expect(send.mock.lastCall?.[0]).not.toHaveProperty('timestamps');

    vi.advanceTimersByTime(PAUSE_TIMEOUT);
    presence.refresh();
    expect(send).toHaveBeenLastCalledWith(null);

    presence.update(playing);
    expect(send.mock.lastCall?.[0].state).toBe('Серия 2 · Воспроизводится');
  });

  it.each(['buffering', 'offline'] as const)('does not show a running timer while %s', reason => {
    const { presence, send, playing } = setup();

    presence.update(playing);
    presence.update({ ...playing, playing: false, reason });
    expect(send.mock.lastCall?.[0]).not.toHaveProperty('timestamps');
    expect(send.mock.lastCall?.[0].state).toContain(
      reason === 'buffering' ? 'Загрузка' : 'Нет сети'
    );
  });

  it.each(['ended', 'dispose', 'error'] as const)('clears activity on %s', reason => {
    const { presence, send, playing } = setup();

    presence.update(playing);
    presence.update({ ...playing, playing: false, reason });
    presence.refresh();
    expect(send).toHaveBeenLastCalledWith(null);
  });

  it('clears activity when disabled and ignores late callbacks after disposal', () => {
    const { presence, send, allowed, playing } = setup();

    presence.update(playing);
    allowed.value = false;
    presence.refresh();
    expect(send).toHaveBeenLastCalledWith(null);

    presence.dispose();

    const count = send.mock.calls.length;

    allowed.value = true;
    presence.update(playing);
    presence.refresh();
    presence.dispose();
    expect(send).toHaveBeenCalledTimes(count);
  });

  it('omits the timer when duration is unknown', () => {
    const { presence, send, playing } = setup();

    presence.update({ ...playing, duration: 0 });
    expect(send.mock.lastCall?.[0]).not.toHaveProperty('timestamps');
  });
});
