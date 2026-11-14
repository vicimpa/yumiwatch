// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Comments, CommentText } from '../src/components/Comments';
import { clearSession, saveSession } from '../src/lib/session';
const comment = { id: 12, name: 'Viewer', text: 'Хорошая серия [спойлер]секрет[/спойлер]', children_count: 1, deleted_at: 0, time: 1708208755, user_id: 2, vote: 0, dislikes: 1, likes: 3, parent_id: 0 };
const reply = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => { clearSession(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); clearSession(); vi.unstubAllGlobals(); });
describe('YummyAnime discussion', () => {
  it('renders untrusted comment markup as text and keeps spoilers collapsed', () => {
    const { container } = render(<CommentText text={'<script>alert(1)</script>[спойлер]секрет[/спойлер]'}/>);
    expect(container.querySelector('script')).toBeNull(); expect(container.textContent).toContain('<script>');
    expect(container.querySelector('details')?.open).toBe(false);
  });
  it('loads public comments and real replies while asking guests to sign in to write', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ comments: [comment] })).mockResolvedValueOnce(reply({ comments: [{ ...comment, id: 13, text: 'Ответ', parent_id: 12, children_count: 0 }] })); vi.stubGlobal('fetch', fetcher);
    render(<Comments animeId={10531}/>);
    await screen.findByText('Viewer'); expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ответы (1)' }));
    await screen.findByText('Ответ'); expect(fetcher.mock.calls[1][0]).toContain('/comments/12/children');
  });
  it('posts through the account API only after the user presses send', async () => {
    saveSession({ token: 'user-test', user: { id: 42, nickname: 'Me' }, remember: false, verified: true, refreshedAt: Date.now() });
    const fetcher = vi.fn().mockImplementation((_url, options) => Promise.resolve(options.method === 'POST' ? reply({ ...comment, id: 14 }) : reply({ comments: [] }))); vi.stubGlobal('fetch', fetcher);
    render(<Comments animeId={10531}/>);
    await screen.findByText('Комментариев пока нет. Начни обсуждение.');
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Мой комментарий' } });
    expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1));
    const options = fetcher.mock.calls.find(call => call[1].method === 'POST')![1];
    expect(options.headers.Authorization).toBe('Yummy user-test'); expect(JSON.parse(options.body)).toEqual({ text: 'Мой комментарий' });
  });
});
