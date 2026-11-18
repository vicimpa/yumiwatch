// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLink } from '~/ui/AppLink';

afterEach(() => {
  cleanup();
  getSelection()?.removeAllRanges();
  location.hash = '';
  vi.useRealTimers();
});

it('exposes a portable address for dragging and routes ordinary clicks inside the app', () => {
  render(
    <AppLink
      href="#/anime/42?view=watch&episode=2"
      publicHref="https://ru.yummyani.me/catalog/item/title"
    >
      Аниме
    </AppLink>
  );
  const link = screen.getByRole('link') as HTMLAnchorElement;
  expect(link.href).toBe('https://ru.yummyani.me/catalog/item/title');
  expect(link.draggable).toBe(true);
  fireEvent.click(link);
  expect(location.hash).toBe('#/anime/42?view=watch&episode=2');
});

it('leaves modified clicks on the public address and disables menu dragging', () => {
  render(<AppLink href="#/catalog">Все аниме</AppLink>);
  const link = screen.getByRole('link') as HTMLAnchorElement;
  expect(link.draggable).toBe(false);
  expect(link.href).toBe('https://ru.yummyani.me/catalog');
  let intercepted = true;
  link.parentElement!.addEventListener(
    'click',
    event => {
      intercepted = event.defaultPrevented;
      event.preventDefault(); // Avoid JSDOM's unsupported document navigation.
    },
    { once: true }
  );
  fireEvent.click(link, { metaKey: true });
  expect(intercepted).toBe(false);
  expect(location.hash).toBe('');
});

it('lets double click select a word without navigating or invoking the open action', () => {
  vi.useFakeTimers();
  const open = vi.fn();
  render(
    <AppLink class="card-title" href="#/anime/42" onClick={open}>
      Название аниме
    </AppLink>
  );
  const link = screen.getByRole('link');
  const address = link.getAttribute('href');
  fireEvent.click(link, { detail: 1 });
  fireEvent.mouseDown(link, { detail: 2 });
  expect(link.hasAttribute('href')).toBe(false);
  const range = document.createRange();
  range.setStart(link.firstChild!, 0);
  range.setEnd(link.firstChild!, 8);
  getSelection()!.addRange(range);
  fireEvent.mouseUp(document);
  expect(link.getAttribute('href')).toBe(address);
  fireEvent.click(link, { detail: 2 });
  vi.advanceTimersByTime(1000);
  expect(getSelection()!.toString()).toBe('Название');
  expect(location.hash).toBe('');
  expect(open).not.toHaveBeenCalled();
});

it('does not override a newer navigation while a title click is pending', () => {
  vi.useFakeTimers();
  render(
    <AppLink class="card-title" href="#/anime/42">
      Название
    </AppLink>
  );
  fireEvent.click(screen.getByRole('link'), { detail: 1 });
  location.hash = '/catalog';
  vi.advanceTimersByTime(1000);
  expect(location.hash).toBe('#/catalog');
});

it('opens a title on a single click and respects cancellation by its caller', () => {
  vi.useFakeTimers();
  render(
    <AppLink class="card-title" href="#/anime/42">
      Название
    </AppLink>
  );
  fireEvent.click(screen.getByRole('link'), { detail: 1 });
  expect(location.hash).toBe('');
  vi.advanceTimersByTime(401);
  expect(location.hash).toBe('#/anime/42');
  cleanup();
  render(
    <AppLink href="#/anime/43" onClick={event => event.preventDefault()}>
      Другое
    </AppLink>
  );
  fireEvent.click(screen.getByRole('link'));
  expect(location.hash).toBe('#/anime/42');
});
