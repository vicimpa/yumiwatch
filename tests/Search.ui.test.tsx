// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Search } from '~/components/Search';
import { recentSearches, rememberSearch } from '~/lib/search';
import { anime } from './fixtures';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('dedicated search screen', () => {
  it('deduplicates recent queries without saving every keystroke', () => {
    rememberSearch('  Naruto  ');
    rememberSearch('Наруто');
    rememberSearch('naruto');
    expect(recentSearches()).toEqual(['naruto', 'Наруто']);
    for (let i = 0; i < 10; i++) rememberSearch(`Anime ${i}`);
    expect(recentSearches()).toHaveLength(8);
  });
  it('debounces requests and hides old results as soon as the query changes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: [anime] })));

    vi.stubGlobal('fetch', fetcher);
    render(<Search query="" />);

    const input = screen.getByRole('searchbox');

    fireEvent.input(input, { target: { value: 'фарм' } });
    expect(fetcher).not.toHaveBeenCalled();
    await screen.findByRole('heading', { name: anime.title });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(recentSearches()).toEqual([]);
    fireEvent.input(input, { target: { value: 'другое' } });
    expect(screen.queryByRole('heading', { name: anime.title })).toBeNull();
    expect(screen.getByRole('status', { name: 'Поиск аниме' })).toBeTruthy();
    fireEvent.input(input, { target: { value: 'фарм' } });
    await screen.findByRole('heading', { name: anime.title });
    fireEvent.click(screen.getByRole('link', { name: /Монолог фармацевта/ }));
    await waitFor(() => expect(recentSearches()).toEqual(['фарм']));
  });
});
