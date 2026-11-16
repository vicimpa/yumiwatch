// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { Avatar } from '~/ui';

afterEach(cleanup);
describe('account avatar', () => {
  it('falls back to an initial on image failure and loads a changed avatar URL', () => {
    const { container, rerender } = render(
      <Avatar url="//static.yani.tv/users/small/42.webp?v=1" name="Viewer" />
    );

    fireEvent.error(container.querySelector('img')!);
    expect(container.textContent).toBe('V');
    expect(container.querySelector('img')).toBeNull();
    rerender(<Avatar url="//static.yani.tv/users/small/42.webp?v=2" name="Viewer" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('v=2');
  });
});
