// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { Poster } from '~/components/Poster';
import { anime } from './fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('poster artwork loading', () => {
  it('uses a light poster normally and preserves resolution on Retina displays', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    const source = {
      ...anime,
      poster: {
        medium: 'https://static.yani.tv/medium.webp',
        big: 'https://static.yani.tv/big.webp',
        huge: 'https://static.yani.tv/huge.avif',
      },
    };

    try {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

      const { rerender } = render(<Poster anime={source} />);

      expect(screen.getByAltText(anime.title).getAttribute('src')).toContain('medium.webp');
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
      rerender(<Poster anime={{ ...source }} />);
      expect(screen.getByAltText(anime.title).getAttribute('src')).toContain('big.webp');
    } finally {
      if (descriptor) Object.defineProperty(window, 'devicePixelRatio', descriptor);
    }
  });
  it('shows artwork until image decoding finishes and resets it for a new title', () => {
    vi.stubGlobal('indexedDB', undefined);

    const first = { ...anime, poster: { big: 'https://static.yani.tv/first.jpg' } };
    const { container, rerender } = render(<Poster anime={first} />);
    const artwork = container.querySelector('.poster-artwork')!;

    expect(artwork.classList.contains('is-loaded')).toBe(false);
    fireEvent.load(screen.getByAltText(anime.title));
    expect(artwork.classList.contains('is-loaded')).toBe(true);
    rerender(
      <Poster
        anime={{
          ...first,
          anime_id: 2,
          title: 'Другая история',
          poster: { big: 'https://static.yani.tv/second.jpg' },
        }}
      />
    );
    expect(artwork.classList.contains('is-loaded')).toBe(false);
    fireEvent.load(screen.getByAltText('Другая история'));
    expect(artwork.classList.contains('is-loaded')).toBe(true);
  });
  it('keeps the placeholder after a failed image and retries a changed URL', () => {
    vi.stubGlobal('indexedDB', undefined);

    const { container, rerender } = render(
      <Poster anime={{ ...anime, poster: { big: 'https://static.yani.tv/broken.jpg' } }} />
    );

    fireEvent.error(screen.getByAltText(anime.title));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.poster-placeholder')).toBeTruthy();
    rerender(<Poster anime={{ ...anime, poster: { big: 'https://static.yani.tv/retry.jpg' } }} />);
    expect(screen.getByAltText(anime.title).getAttribute('src')).toContain('retry.jpg');
  });
});
