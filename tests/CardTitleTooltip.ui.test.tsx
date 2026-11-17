// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { CardTitleTooltip } from '~/ui/CardTitleTooltip';

afterEach(cleanup);

it('keeps a selectable title inside its scrolling region so the wheel can reach that region', () => {
  const { container } = render(
    <>
      <main class="media-scroll">
        <article data-gallery-item>
          <a class="card-title" href="#/anime/1">
            Полное длинное название аниме
          </a>
        </article>
      </main>
      <CardTitleTooltip />
    </>
  );
  const link = container.querySelector('a')!;
  Object.defineProperty(link, 'scrollHeight', { value: 60 });
  Object.defineProperty(link, 'clientHeight', { value: 30 });
  fireEvent.pointerOver(link);
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.closest('.media-scroll')).toBe(container.querySelector('main'));
  expect(tooltip.hasAttribute('data-selectable')).toBe(true);
  fireEvent.wheel(tooltip, { deltaY: 120 });
  expect(container.querySelector('main')!.scrollTop).toBe(120);
  fireEvent(window, new Event('hashchange'));
  expect(screen.queryByRole('tooltip')).toBeNull();
});
