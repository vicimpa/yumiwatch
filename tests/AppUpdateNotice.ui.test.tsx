// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';

import { AppUpdateNotice } from '~/components/AppUpdateNotice';
import { MediaNavigation } from '~/components/MediaNavigation';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const release = {
  version: '0.0.8',
  name: 'YummyWatch 0.0.8',
  url: 'https://github.com/vicimpa/yummywatch/releases/tag/v0.0.8',
};

it('opens update details at the navigation indicator and dismisses them with Escape', () => {
  const dismiss = vi.fn();
  render(
    <MediaNavigation
      path="/"
      selected="/"
      updateNotice={<AppUpdateNotice release={release} dismiss={dismiss} />}
    />
  );

  const trigger = screen.getByRole('button', { name: 'Доступно обновление YummyWatch' });
  expect(
    within(trigger.parentElement!.parentElement!).getByRole('link', { name: 'Настройки' })
  ).toBeTruthy();
  expect(screen.queryByText('Доступна версия 0.0.8')).toBeNull();
  trigger.focus();
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Доступна версия 0.0.8')).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Что нового и скачать' });
  expect(link.getAttribute('href')).toBe(release.url);
  link.focus();
  fireEvent.keyDown(link, { key: 'Escape' });
  expect(screen.queryByRole('link', { name: 'Что нового и скачать' })).toBeNull();
  expect(document.activeElement).toBe(trigger);

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление до следующего запуска' }));
  expect(dismiss).toHaveBeenCalledOnce();
});

it('keeps the install action reachable from the mobile menu', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const apply = vi.fn();
  render(
    <MediaNavigation path="/" selected="/" updateNotice={<AppUpdateNotice apply={apply} />} />
  );

  const menu = screen.getByRole('button', { name: 'Открыть меню · доступно обновление' });
  expect(menu.hasAttribute('data-update-available')).toBe(true);
  fireEvent.click(menu);
  const drawer = screen.getByRole('dialog', { name: 'Меню' });
  const trigger = within(drawer).getByRole('button', { name: 'Доступно обновление YummyWatch' });
  fireEvent.click(trigger);
  const applyButton = within(drawer).getByRole('button', { name: 'Обновить' });
  fireEvent.click(applyButton);
  expect(apply).toHaveBeenCalledOnce();

  fireEvent.keyDown(applyButton, { key: 'Escape' });
  expect(within(drawer).queryByRole('button', { name: 'Обновить' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Меню' })).toBe(drawer);
});
