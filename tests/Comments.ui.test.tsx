// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
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
  it('automatically loads the next page once inside the comment scroller and stops at the end', async () => {
    let intersect!: IntersectionObserverCallback;
    let root: Element | Document | null | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
          intersect = callback;
          root = options.root;
        }
        observe() {}
        disconnect() {}
      }
    );
    const first = Array.from({ length: 20 }, (_, index) => ({ ...comment, id: 100 + index }));
    const fetcher = vi.fn(async (raw: string) =>
      reply({
        comments:
          new URL(raw).searchParams.get('skip') === '20'
            ? [{ ...comment, id: 200, text: 'Автоматически загруженный комментарий' }]
            : first,
      })
    );
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(
      <div class="sidebar-scroll">
        <Comments animeId={10531} />
      </div>
    );
    await waitFor(() => expect(container.querySelector('.auto-load-marker')).toBeTruthy());
    await waitFor(() => expect(root === container.querySelector('.discussion-content')).toBe(true));
    const callback = intersect;
    act(() => {
      callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      );
      callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      );
    });
    await screen.findByText('Автоматически загруженный комментарий');
    expect(
      fetcher.mock.calls.filter(([url]) => new URL(url).searchParams.get('skip') === '20')
    ).toHaveLength(1);
    expect(container.querySelector('.auto-load-marker')).toBeNull();
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
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
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Ответы для Viewer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть ответы' }));
    expect(screen.queryByText('Ответ')).toBeNull();
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
    const { unmount } = render(<Comments animeId={10531} />);
    await screen.findByText('Пока тихо');
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Личный черновик' } });
    unmount();
    expect(sessionStorage.getItem('yumiwatch:draft:42:10531')).toContain('Личный черновик');
    render(<Comments animeId={10531} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Личный черновик');
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
    const { unmount } = render(<Comments animeId={10531} />);
    await screen.findByText('Пока тихо');
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Мой комментарий' } });
    expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
    render(<Comments animeId={10531} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Мой комментарий');
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
    );

    const options = fetcher.mock.calls.find(call => call[1].method === 'POST')![1];

    expect(options.headers.Authorization).toBe('Yummy user-test');
    expect(JSON.parse(options.body)).toEqual({ text: 'Мой комментарий' });
  });
});

function signIn() {
  saveSession({
    token: 'tree-user',
    user: { id: 42, nickname: 'Me' },
    remember: false,
    verified: true,
    refreshedAt: Date.now(),
  });
}
const answer = {
  ...comment,
  id: 13,
  name: 'Друг',
  text: 'Ответ в ветке',
  parent_id: 12,
  children_count: 0,
};

it('keeps one bottom form and its text while selecting and cancelling replies', async () => {
  signIn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string) =>
      reply({ comments: raw.includes('/children') ? [answer] : [comment] })
    )
  );
  const { container } = render(<Comments animeId={10531} />);
  await screen.findByText('Viewer');
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.input(input, { target: { value: 'Не терять текст' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));
  expect(screen.getByText('Ответ для')).toBeTruthy();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('Не терять текст');
  fireEvent.click(screen.getByRole('button', { name: 'Ответы (1)' }));
  const branch = await screen.findByRole('group', { name: 'Ответы для Viewer' });
  await within(branch).findByText('Ответ в ветке');
  fireEvent.click(within(branch).getByRole('button', { name: 'Ответить' }));
  expect(input.placeholder).toBe('Ответ для Друг…');
  expect(screen.getAllByRole('textbox')).toEqual([input]);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelectorAll('form')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Отменить ответ' }));
  expect(input.placeholder).toBe('Написать комментарий…');
  expect(input.value).toBe('Не терять текст');
});

it('adds spoiler tags around selection and cancels a reply without submitting the form', async () => {
  signIn();
  const fetcher = vi.fn(async () => reply({ comments: [comment] }));
  vi.stubGlobal('fetch', fetcher);
  render(<Comments animeId={10531} />);
  await screen.findByText('Viewer');
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.input(input, { target: { value: 'До секрет после' } });
  input.setSelectionRange(3, 9);
  fireEvent.click(screen.getByRole('button', { name: '+ Спойлер' }));
  expect(input.value).toBe('До [спойлер]секрет[/спойлер] после');
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отменить ответ' }));
  await act(async () => {});
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('sends a reply to a nested author through the root and keeps the same form ready for a new comment', async () => {
  signIn();
  const published = { ...answer, id: 14, name: 'Me', text: 'Мой ответ' };
  const fetcher = vi.fn(async (raw: string, options: RequestInit) =>
    reply(
      options.method === 'POST'
        ? published
        : { comments: raw.includes('/children') ? [answer] : [comment] }
    )
  );
  vi.stubGlobal('fetch', fetcher);
  render(<Comments animeId={10531} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ответы (1)' }));
  const branch = screen.getByRole('group', { name: 'Ответы для Viewer' });
  fireEvent.click(await within(branch).findByRole('button', { name: 'Ответить' }));
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.input(input, { target: { value: 'Мой ответ' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  fireEvent.keyDown(input, { key: 'Enter' });
  await within(branch).findByText('Мой ответ');
  const posts = fetcher.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1].body as string)).toEqual({
    text: 'Мой ответ',
    parent_comment: 12,
    reply_to_comment: 13,
  });
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input.value).toBe('');
  expect(input.disabled).toBe(false);
  expect(input.placeholder).toBe('Написать комментарий…');
  expect(screen.queryByRole('button', { name: 'Отменить ответ' })).toBeNull();
  expect(sessionStorage.getItem('yumiwatch:draft:42:10531')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the replied-to branch after sending even when the root had no answers', async () => {
  signIn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string, options: RequestInit) =>
      reply(
        options.method === 'POST'
          ? { ...answer, text: 'Первый ответ' }
          : { comments: raw.includes('/children') ? [] : [{ ...comment, children_count: 0 }] }
      )
    )
  );
  render(<Comments animeId={10531} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ответить' }));
  fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Первый ответ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  const branch = await screen.findByRole('group', { name: 'Ответы для Viewer' });
  await within(branch).findByText('Первый ответ');
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть ответы' }));
  expect(screen.queryByText('Первый ответ')).toBeNull();
});

it('retains a failed reply and its target, then clears only after a confirmed retry', async () => {
  signIn();
  let fail = true;
  const fetcher = vi.fn(async (_raw: string, options: RequestInit) =>
    options.method === 'POST'
      ? fail
        ? new Response(JSON.stringify({ error: true }), { status: 429 })
        : reply({ ...answer, text: 'Сохранить ответ' })
      : reply({ comments: [comment] })
  );
  vi.stubGlobal('fetch', fetcher);
  render(<Comments animeId={10531} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ответить' }));
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.input(input, { target: { value: 'Сохранить ответ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('alert');
  expect(input.value).toBe('Сохранить ответ');
  expect(input.placeholder).toBe('Ответ для Viewer…');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByText('Сохранить ответ');
  expect(input.value).toBe('');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('restores draft text and reply target after leaving the discussion', async () => {
  signIn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ comments: [comment] }))
  );
  const { unmount } = render(<Comments animeId={10531} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ответить' }));
  fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Черновик ответа' } });
  unmount();
  render(<Comments animeId={10531} />);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(input.value).toBe('Черновик ответа');
  expect(input.placeholder).toBe('Ответ для Viewer…');
});

it('expands nested branches independently without creating dialogs or looping over ancestor IDs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string) =>
      reply({
        comments: raw.includes('/13/children')
          ? [
              comment,
              { ...answer, id: 14, text: 'Глубокий ответ', parent_id: 13, children_count: 0 },
            ]
          : raw.includes('/12/children')
            ? [{ ...answer, children_count: 1 }]
            : [comment],
      })
    )
  );
  render(<Comments animeId={10531} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ответы (1)' }));
  const branch = screen.getByRole('group', { name: 'Ответы для Viewer' });
  fireEvent.click(await within(branch).findByRole('button', { name: 'Ответы (1)' }));
  const nested = screen.getByRole('group', { name: 'Ответы для Друг' });
  await within(nested).findByText('Глубокий ответ');
  expect(within(nested).queryByText('Viewer')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});
