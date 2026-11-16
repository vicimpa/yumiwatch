// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
import { useLayoutEffect } from 'preact/hooks';
import { useLibrary, useSession } from '~/lib/hooks';
import { clearSession, saveSession } from '~/lib/session';
import { recordWatch } from '~/lib/storage';
import { anime, video } from './fixtures';

beforeEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
});
describe('changes between rendering and subscribing', () => {
  it('picks up an account verified before the session effect subscribes', async () => {
    function RestoredPlayer() {
      const session = useSession();

      useLayoutEffect(() => {
        saveSession({
          token: 'test',
          user: { id: 42, nickname: 'Test' },
          verified: true,
          remember: false,
          refreshedAt: Date.now(),
        });
      }, []);

      return <p>{session?.verified ? 'Готово' : 'Проверяем аккаунт'}</p>;
    }

    render(<RestoredPlayer />);
    expect(await screen.findByText('Готово')).toBeTruthy();
  });
  it('picks up progress saved before the library effect subscribes', async () => {
    function History() {
      const library = useLibrary();

      useLayoutEffect(() => {
        recordWatch(anime, video('1'), 'group', 315, 1400);
      }, []);

      return <p>{library.history[0]?.position || 0}</p>;
    }

    render(<History />);
    expect(await screen.findByText('315')).toBeTruthy();
  });
});
