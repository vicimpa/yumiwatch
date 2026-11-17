// Production frontend; synthetic account/API and durable bridge. No real credentials or account writes.
import { webkit, chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

for (const engine of [webkit, chromium]) {
  let saved = null,
    profileBlocked = false,
    failPage = true,
    loginCount = 0;
  const offsets = [];

  const open = async () => {
    const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {}),
      page = await browser.newPage({ viewport: { width: 1280, height: 820 } }),
      errors = [];

    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('testInvoke', async (command, args) => {
      if (command === 'desktop_info') return { platform: engine === webkit ? 'macos' : 'windows' };
      if (command === 'load_account_session') return saved;
      if (command === 'save_account_session') {
        saved = structuredClone(args.session);

        return;
      }
      if (command === 'set_window_controls_visible') return;
      if (command === 'set_window_cursor_visible') return;
      if (command.startsWith('plugin:event|')) return 1;
      if (command === 'plugin:window|is_focused') return true;
      if (command === 'plugin:window|is_maximized' || command === 'plugin:window|is_fullscreen')
        return false;
      if (command !== 'yummy_request') throw new Error(`Unexpected command ${command}`);

      const request = args.request,
        url = new URL(request.path, 'https://api.yani.tv');
      let response = [];

      if (url.pathname === '/profile/login') {
        loginCount++;
        response = { success: true, token: 'synthetic-session-token' };
      } else if (url.pathname === '/profile') {
        if (profileBlocked) return { status: 503, body: JSON.stringify({ error: 'test offline' }) };
        response = { id: 42, nickname: 'Test Viewer' };
      } else if (url.pathname === '/profile/token')
        response = { token: 'synthetic-refreshed-token' };
      else if (url.pathname === '/profile/logout') response = { success: true };
      else if (url.pathname === '/anime') {
        const offset = Number(url.searchParams.get('offset') || 0);

        offsets.push(offset);
        if (offset) await new Promise(resolve => setTimeout(resolve, 250));
        if (offset === 72 && failPage) {
          failPage = false;

          return { status: 503, body: JSON.stringify({ error: 'test failure' }) };
        }
        response = Array.from({ length: Math.max(0, Math.min(24, 120 - offset)) }, (_, index) => ({
          anime_id: offset + index + 1,
          anime_url: `test-${offset + index}`,
          title: `Аниме ${offset + index}`,
          year: 2026,
          type: { name: 'Сериал', shortname: 'ТВ' },
        }));
      }

      return { status: 200, body: JSON.stringify({ response }) };
    });
    await page.addInitScript(() => {
      window.isTauri = true;

      let id = 0;

      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => ++id,
        unregisterCallback() {},
        convertFileSrc: (path, scheme) => `https://${scheme}.localhost/${path}`,
        invoke: (command, args = {}) => window.testInvoke(command, args),
      };
    });
    await page.route('https://state.test/**', async route => {
      const path = new URL(route.request().url()).pathname,
        file = resolve('dist', `.${path === '/' ? '/index.html' : path}`);

      assert.ok(file.startsWith(resolve('dist') + '/'));

      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };

      await route.fulfill({
        contentType: types[extname(file)] || 'application/octet-stream',
        body: await readFile(file),
      });
    });
    await page.goto('https://state.test/#/account');

    return { browser, page, errors };
  };

  let app = await open();

  try {
    await app.page.getByLabel('Почта на YummyAnime').fill('synthetic@example.test');
    await app.page.getByLabel('Пароль', { exact: true }).fill('synthetic-password');
    await app.page.getByLabel('Почта на YummyAnime').focus();
    await app.page.keyboard.press('ArrowDown');
    assert.equal(
      await app.page.evaluate(() => document.activeElement.id),
      'account-password',
      'ArrowDown did not leave the email input'
    );
    await app.page.keyboard.press('ArrowUp');
    assert.equal(await app.page.evaluate(() => document.activeElement.id), 'account-email');
    assert.equal(
      await app.page.getByLabel('Почта на YummyAnime').inputValue(),
      'synthetic@example.test'
    );
    assert.equal(await app.page.locator('.media-brand').evaluate(node => node.tabIndex), -1);
    assert.equal(await app.page.locator('.skip-link').count(), 0);
    await app.page
      .getByRole('checkbox', { name: 'Оставаться в аккаунте на этом устройстве' })
      .check();
    await app.page.getByRole('button', { name: 'Войти', exact: true }).click();
    await app.page.waitForFunction(() => location.hash.startsWith('#/profile'));
    assert.ok(saved?.token);
    assert.equal(await app.page.evaluate(() => localStorage.getItem('yumiwatch:session:v1')), null);
    await app.page
      .locator('.media-nav')
      .getByRole('link', { name: 'Все аниме', exact: true })
      .click();
    await app.page.waitForFunction(
      () => document.querySelector('[data-total-items]')?.dataset.totalItems === '24'
    );
    for (const count of [48, 72, 96, 120]) {
      await app.page.locator('#main').evaluate(node => {
        node.scrollTop = node.scrollHeight;
      });
      if (count === 96) {
        await app.page.getByRole('button', { name: 'Повторить загрузку', exact: true }).waitFor();
        assert.equal(
          offsets.filter(value => value === 72).length,
          1,
          'Error caused automatic retry loop'
        );
        await app.page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
      } else await app.page.getByRole('status', { name: 'Загрузка аниме', exact: true }).waitFor();
      await app.page.waitForFunction(
        count => Number(document.querySelector('[data-total-items]')?.dataset.totalItems) >= count,
        count
      );
    }
    assert.ok((await app.page.locator('.anime-card').count()) < 80);
    assert.equal(
      await app.page.getByRole('button', { name: 'Показать ещё', exact: true }).count(),
      0
    );
    assert.deepEqual(app.errors, []);
    console.log(
      engine.name(),
      'automatic pages, skeletons, retry and virtualized production catalog OK'
    );
  } finally {
    await app.browser.close();
  }
  saved.refreshedAt = 0;
  profileBlocked = true;
  app = await open();
  try {
    await app.page.getByRole('button', { name: 'Повторить проверку', exact: true }).waitFor();
    await app.page
      .getByText('Сервис Yummy временно недоступен. Попробуй ещё раз.', { exact: true })
      .waitFor();
    assert.ok(saved?.token);
    profileBlocked = false;
    await app.page.getByRole('button', { name: 'Повторить проверку', exact: true }).click();
    await app.page.getByRole('heading', { name: 'Привет, Test Viewer', exact: true }).waitFor();
    assert.equal(saved.token, 'synthetic-refreshed-token');
    assert.equal(loginCount, 1);
    await app.page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await app.page.getByLabel('Почта на YummyAnime').waitFor();
    await app.page.waitForTimeout(100);
    assert.equal(saved, null);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.browser.close();
  }
  app = await open();
  try {
    await app.page.getByLabel('Почта на YummyAnime').waitFor();
    assert.equal(saved, null);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.browser.close();
  }
  console.log(
    engine.name(),
    'fresh browser process restore, offline retry, token rotation and durable logout OK'
  );
}
