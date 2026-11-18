// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { ChoiceTabs } from '~/ui/ChoiceTabs';

const choices = [
  ['', 'Все'],
  ['ongoing', 'Онгоинги'],
  ['released', 'Вышедшие'],
] as const;

afterEach(cleanup);

it('shows the selected state before the parent callback runs, without acting on pointerdown', () => {
  const change = vi.fn(() => {
    expect(screen.getByRole('button', { name: 'Онгоинги' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('false');
  });
  render(<ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />);
  const ongoing = screen.getByRole('button', { name: 'Онгоинги' });
  fireEvent.pointerDown(ongoing);
  expect(change).not.toHaveBeenCalled();
  expect(ongoing.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(ongoing);
  expect(change).toHaveBeenCalledExactlyOnceWith('ongoing');
});

it('keeps an optimistic choice during unrelated renders and follows confirmed navigation', () => {
  const change = vi.fn();
  const { rerender } = render(
    <ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Онгоинги' }));
  rerender(<ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />);
  expect(screen.getByRole('button', { name: 'Онгоинги' }).getAttribute('aria-pressed')).toBe(
    'true'
  );
  rerender(<ChoiceTabs value="ongoing" choices={choices} onChange={change} label="Статус" />);
  rerender(<ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />);
  expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
});

it('does not repeat the same choice and accepts keyboard-style clicks normally', () => {
  const change = vi.fn();
  render(<ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />);
  fireEvent.click(screen.getByRole('button', { name: 'Все' }), { detail: 0 });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Вышедшие' }), { detail: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Вышедшие' }));
  expect(change).toHaveBeenCalledExactlyOnceWith('released');
});

it('resets an unconfirmed choice when a retained screen is hidden', () => {
  const change = vi.fn();
  const { rerender } = render(
    <ChoiceTabs value="" choices={choices} onChange={change} label="Статус" />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Онгоинги' }));
  rerender(
    <ChoiceTabs value="" choices={choices} onChange={change} label="Статус" active={false} />
  );
  rerender(<ChoiceTabs value="" choices={choices} onChange={change} label="Статус" active />);
  expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
});
