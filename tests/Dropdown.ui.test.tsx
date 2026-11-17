// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { PlaybackSettingsCard } from '~/components/PlaybackSettings';
import { playbackSettings } from '~/lib/playback-settings';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('selects and persists quality using an app menu instead of a native select', () => {
  const { container } = render(<PlaybackSettingsCard />);
  const trigger = screen.getByRole('combobox', { name: 'Предпочитаемое качество' });
  expect(container.querySelector('select')).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole('listbox').parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('option', { name: '720p' }));
  expect(playbackSettings().quality).toBe('720');
  expect(trigger.textContent).toContain('720p');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('supports keyboard selection, cancel, Tab and outside clicks', () => {
  render(<PlaybackSettingsCard />);
  const trigger = screen.getByRole('combobox', { name: 'Предпочитаемое качество' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(trigger, { key: 'End' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(playbackSettings().quality).toBe('auto');
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'Home' });
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(playbackSettings().quality).toBe('auto');
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'Tab' });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
});
