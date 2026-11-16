// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { Sheet } from '~/ui';

afterEach(cleanup);
describe('single modal scroll area', () => {
  it('keeps the page locked until all nested screens close and restores previous styles', () => {
    document.body.style.overflow = 'clip';

    const close = vi.fn();
    const { container, rerender } = render(
      <>
        <Sheet title="Ответы" close={close}>
          <p>Ветка</p>
        </Sheet>
        <Sheet title="Комментарий" close={close} footer={<button>Отправить</button>}>
          <textarea />
        </Sheet>
      </>
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(container.querySelectorAll('.modal-scroll')).toHaveLength(2);
    expect(container.querySelector('.mobile-sheet-footer')?.closest('.modal-scroll')).toBeNull();
    rerender(
      <Sheet title="Ответы" close={close}>
        <p>Ветка</p>
      </Sheet>
    );
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(close).toHaveBeenCalledOnce();
    cleanup();
    expect(document.body.style.overflow).toBe('clip');
    expect(document.documentElement.style.overflow).toBe('');
    document.body.style.overflow = '';
  });
});
