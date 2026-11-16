// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { CommentText } from '~/components/CommentText';
import { Comments } from '~/components/Comments';
import { clearSession, saveSession } from '~/lib/session';

const comment = {
  id: 12,
  name: 'Viewer',
  text: 'Хорошая серия [спойлер]секрет[/спойлер]',
  children_count: 1,
  deleted_at: 0,
  time: 1708208755,
  user_id: 2,
  vote: 0,
  dislikes: 1,
  likes: 3,
  parent_id: 0,
};

const reply = (response: unknown) => new Response(JSON.stringify({ response }));

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
});
describe('YummyAnime discussion', () => {
  it('drops loaded replies and extra comments when switching to another anime', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...comment,
      id: 100 + index,
      text: `Первое аниме ${index}`,
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn((raw: string) => {
        const url = new URL(raw);
        const comments = url.pathname.endsWith('/10532')
          ? [{ ...comment, id: 300, text: 'Другое аниме' }]
          : url.searchParams.get('skip') === '20'
            ? [{ ...comment, id: 200, text: 'Дополнительный комментарий' }]
            : firstPage;

        return Promise.resolve(reply({ comments }));
      })
    );

    const { rerender } = render(<Comments animeId={10531} />);

    await screen.findByText('Первое аниме 0');
    fireEvent.click(screen.getByRole('button', { name: 'Ещё комментарии' }));
    await screen.findByText('Дополнительный комментарий');
    rerender(<Comments animeId={10532} />);
    await screen.findByText('Другое аниме');
    expect(screen.queryByText('Дополнительный комментарий')).toBeNull();
    expect(screen.queryByText('Первое аниме 0')).toBeNull();
  });
  it('renders untrusted comment markup as text and keeps spoilers collapsed', () => {
    const { container } = render(
      <CommentText text={'<script>alert(1)</script>[спойлер]секрет[/спойлер]'} />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
    expect(screen.queryByText('секрет')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать спойлер' }));
    expect(screen.getByText('секрет')).toBeTruthy();
    expect(container.querySelector('details')).toBeNull();
  });
  it('loads public comments and real replies while asking guests to sign in to write', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ comments: [comment] }))
      .mockResolvedValueOnce(
        reply({
          comments: [{ ...comment, id: 13, text: 'Ответ', parent_id: 12, children_count: 0 }],
        })
      );

    vi.stubGlobal('fetch', fetcher);
    render(<Comments animeId={10531} />);
    await screen.findByText('Viewer');
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ответы (1)' }));
    await screen.findByText('Ответ');
    expect(fetcher.mock.calls[1][0]).toContain('/comments/12/children');
  });
  it('clears account drafts on logout without saving them again during unmount', async () => {
    saveSession({
      token: 'draft-user',
      user: { id: 42, nickname: 'Me' },
      remember: false,
      verified: true,
      refreshedAt: Date.now(),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ comments: [] })));
    render(<Comments animeId={10531} />);
    await screen.findByText('Пока тихо');
    fireEvent.click(screen.getByRole('button', { name: /Написать комментарий/ }));
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Личный черновик' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(sessionStorage.getItem('yumiwatch:draft:42:10531')).toContain('Личный черновик');
    fireEvent.click(screen.getByRole('button', { name: /Написать комментарий/ }));
    clearSession();
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(sessionStorage.getItem('yumiwatch:draft:42:10531')).toBeNull();
  });
  it('posts through the account API only after the user presses send', async () => {
    saveSession({
      token: 'user-test',
      user: { id: 42, nickname: 'Me' },
      remember: false,
      verified: true,
      refreshedAt: Date.now(),
    });

    const fetcher = vi
      .fn()
      .mockImplementation((_url, options) =>
        Promise.resolve(
          options.method === 'POST' ? reply({ ...comment, id: 14 }) : reply({ comments: [] })
        )
      );

    vi.stubGlobal('fetch', fetcher);
    render(<Comments animeId={10531} />);
    await screen.findByText('Пока тихо');
    fireEvent.click(screen.getByRole('button', { name: /Написать комментарий/ }));
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Мой комментарий' } });
    expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(document.body.style.overflow).not.toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: /Написать комментарий/ }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Мой комментарий');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
    );

    const options = fetcher.mock.calls.find(call => call[1].method === 'POST')![1];

    expect(options.headers.Authorization).toBe('Yummy user-test');
    expect(JSON.parse(options.body)).toEqual({ text: 'Мой комментарий' });
  });
});
