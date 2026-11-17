// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerStatusCard } from '~/components/ServerStatusCard';
import { ConnectionSettings } from '~/components/ConnectionSettings';
import { activeApiUrl, rememberApiEndpoint } from '~/lib/api-endpoints';
import {
  parseServerStatus,
  SERVER_STATUS_INTERVAL,
  SERVER_STATUS_STALE_MS,
} from '~/lib/server-status';
import fixture from './fixtures/yummy-status.json';

const status = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('~/lib/server-status', async original => ({
  ...(await original<typeof import('~/lib/server-status')>()),
  fetchServerStatus: status.fetch,
}));
const initial = parseServerStatus(fixture);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(fixture.updatedAt));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  status.fetch.mockReset().mockResolvedValue(initial);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const mount = async (page = <ServerStatusCard />) => {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(page);
  });
  await act(async () => {});
  return view;
};

describe('server status in connection settings', () => {
  it('shows monitored services and the selected mirror on the actual settings page', async () => {
    rememberApiEndpoint('https://old.yummyani.me/api');
    await mount(<ConnectionSettings />);
    expect(screen.getByRole('heading', { name: 'Состояние серверов Yummy' })).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Состояние серверов' })).getAllByRole(
      'listitem'
    );
    expect(rows[0].textContent).toContain('Недоступен');
    expect(rows[1].textContent).toContain('Выбран');
    expect(rows[1].textContent).toContain('Работает');
    expect(screen.getByText(/вернёмся к нему автоматически/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'YummyStatus' }).getAttribute('href')).toBe(
      'https://yummystatus.me/'
    );
  });

  it('reflects recovery to the primary API without reloading settings', async () => {
    rememberApiEndpoint('https://old.yummyani.me/api');
    await mount();
    await act(async () => {
      rememberApiEndpoint('https://api.yani.tv');
    });
    expect(activeApiUrl.value).toBe('https://api.yani.tv');
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Выбран');
    expect(rows[1].textContent).not.toContain('Выбран');
    expect(screen.queryByText(/вернёмся к нему автоматически/)).toBeNull();
  });

  it('keeps the last snapshot on a monitoring error and allows a manual retry', async () => {
    await mount();
    status.fetch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Обновить статус' }));
    });
    expect(screen.getByText(/Не удалось обновить статус серверов/)).toBeTruthy();
    expect(screen.getAllByText('Работает')).toHaveLength(2);
    status.fetch.mockResolvedValueOnce(initial);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Обновить статус' }));
    });
    expect(screen.queryByText(/Не удалось обновить статус серверов/)).toBeNull();
  });

  it('never labels old measurements as healthy', async () => {
    vi.setSystemTime(Date.parse(fixture.updatedAt) + SERVER_STATUS_STALE_MS + 1);
    await mount();
    expect(screen.getAllByText('Данные устарели')).toHaveLength(3);
    expect(screen.queryByText('Работает')).toBeNull();
  });

  it('polls once per minute while visible, resumes after hiding, and aborts on unmount', async () => {
    const view = await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_STATUS_INTERVAL);
    });
    expect(status.fetch).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_STATUS_INTERVAL);
    });
    expect(status.fetch).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(status.fetch).toHaveBeenCalledTimes(3);
    const signal = status.fetch.mock.calls[0][0] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(SERVER_STATUS_INTERVAL);
    expect(status.fetch).toHaveBeenCalledTimes(3);
  });
});
