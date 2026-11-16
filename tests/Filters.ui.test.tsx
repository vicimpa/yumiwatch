// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { FilterSheet } from '~/components/Filters';
import { clearSession } from '~/lib/session';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  location.hash = '/catalog';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            genres: [
              { title: 'Фэнтези', href: 'fentezi', value: 42, group_id: -1 },
              { title: 'Ужасы', href: 'ugasy', value: 35, group_id: -1 },
            ],
          },
        })
      )
    )
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('mobile filter sheet', () => {
  it('uses explicit include and exclude modes and allows clearing a genre', async () => {
    render(<FilterSheet query="" close={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Жанры' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Фэнтези: не выбран' }));
    expect(
      screen.getByRole('button', { name: 'Фэнтези: включён' }).getAttribute('aria-pressed')
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Исключить жанры' }));
    fireEvent.click(screen.getByRole('button', { name: 'Фэнтези: включён' }));
    expect(
      screen.getByRole('button', { name: 'Фэнтези: исключён' }).getAttribute('aria-pressed')
    ).toBe('mixed');
    fireEvent.click(screen.getByRole('button', { name: 'Фэнтези: исключён' }));
    expect(screen.getByRole('button', { name: 'Фэнтези: не выбран' })).toBeTruthy();
  });
  it('applies filters together and rejects an invalid range first', async () => {
    const close = vi.fn();

    render(<FilterSheet query="q=anime" close={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Жанры' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Фэнтези: не выбран' }));
    fireEvent.click(screen.getByRole('button', { name: 'Основное' }));
    fireEvent.click(screen.getByRole('button', { name: 'Субтитры' }));
    fireEvent.input(screen.getByLabelText('Год выхода от'), { target: { value: '2026' } });
    fireEvent.input(screen.getByLabelText('Год выхода до'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать аниме' }));
    expect(screen.getByRole('alert').textContent).toContain('меньше или равно');
    expect(close).not.toHaveBeenCalled();
    fireEvent.input(screen.getByLabelText('Год выхода до'), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать аниме' }));
    expect(location.hash).toContain('genres=fentezi');
    expect(location.hash).toContain('translates=subtitles');
    expect(location.hash).toContain('q=anime');
    expect(close).toHaveBeenCalledOnce();
  });
});
