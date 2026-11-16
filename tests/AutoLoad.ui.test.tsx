// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { AutoLoad } from '~/components/AutoLoad';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('automatic pagination', () => {
  it('loads once near the end, shows skeletons, pauses on errors and retries explicitly', () => {
    let intersect!: IntersectionObserverCallback;

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }

        observe() {}

        disconnect() {}
      }
    );

    const load = vi.fn(),
      view = (loading = false, error = '') => (
        <AutoLoad enabled loading={loading} error={error} load={load}>
          <div role="status">Скелеты</div>
        </AutoLoad>
      );

    const { rerender } = render(view());

    act(() => {
      intersect(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      );
      intersect(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      );
    });
    expect(load).toHaveBeenCalledOnce();
    rerender(view(true));
    expect(screen.getByRole('status').textContent).toBe('Скелеты');
    rerender(view(false, 'Нет сети'));
    expect(screen.getByRole('alert').textContent).toContain('Нет сети');
    expect(load).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('does not observe a hidden or inactive catalog', () => {
    const observe = vi.fn();

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe;

        disconnect() {}
      }
    );
    render(
      <AutoLoad enabled={false} loading={false} error="" load={vi.fn()}>
        {null}
      </AutoLoad>
    );
    expect(observe).not.toHaveBeenCalled();
  });
});
