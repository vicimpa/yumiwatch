// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/preact';

import { Toast } from '~/ui';
import { notify, toastMessage } from '~/lib/notifications';

afterEach(() => {
  cleanup();
  toastMessage.value = '';
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('shows the latest notification and renews the lifetime of repeated messages', async () => {
  vi.useFakeTimers();
  render(<Toast />);
  await act(() => notify('Сохранено'));
  expect(screen.getByRole('status').textContent).toBe('Сохранено');
  await act(() => {
    vi.advanceTimersByTime(3000);
  });
  await act(() => notify('Сохранено'));
  await act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByRole('status').textContent).toBe('Сохранено');
  await act(() => notify('Обновлено'));
  await act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByRole('status').textContent).toBe('Обновлено');
  await act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByRole('status').textContent).toBe('');
});
