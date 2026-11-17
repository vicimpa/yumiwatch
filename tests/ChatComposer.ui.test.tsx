// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { ChatComposer } from '~/ui/ChatComposer';

afterEach(cleanup);

function Composer({ send }: { send: () => Promise<void> }) {
  const [value, setValue] = useState('Готовый текст');
  return (
    <ChatComposer
      value={value}
      onValueChange={setValue}
      onSubmit={send}
      sending={false}
      label="Текст"
      placeholder="Написать…"
    />
  );
}

it('sends on Enter, preserves Shift+Enter and ignores IME confirmation', async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  render(<Composer send={send} />);
  const input = screen.getByRole('textbox');
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true);
  expect(send).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  expect(send).toHaveBeenCalledOnce();
});

it('blocks repeated submits while the first send is pending, including before rerender', async () => {
  let finish!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  render(<Composer send={send} />);
  const input = screen.getByRole('textbox');
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(send).toHaveBeenCalledOnce();
  await act(async () => finish());
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledTimes(2);
});

it('does not submit blank text and resizes restored drafts before input', () => {
  const send = vi.fn().mockResolvedValue(undefined);
  render(<Composer send={send} />);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(input.style.height).not.toBe('');
  fireEvent.input(input, { target: { value: '   ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement).disabled).toBe(
    true
  );
});
