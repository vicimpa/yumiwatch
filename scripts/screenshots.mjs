// Production UI + the real Rust backend; isolated guest data, read-only API calls.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const output = resolve('docs/screenshots'),
  animeId = process.env.SCREENSHOT_ANIME || '10531';

await mkdir(output, { recursive: true });

const probe = spawn(
  fileURLToPath(
    new URL(
      `../src-tauri/target/debug/examples/media_probe${process.platform === 'win32' ? '.exe' : ''}`,
      import.meta.url
    )
  ),
  [],
  { stdio: ['pipe', 'pipe', 'inherit'] }
);
const pending = new Map(),
  apiCache = new Map();
let sequence = 0;
const lines = createInterface({ input: probe.stdout });

lines.on('line', line => {
  const reply = JSON.parse(line),
    task = pending.get(reply.id);

  if (!task) return;
  pending.delete(reply.id);
  clearTimeout(task.timer);
  reply.error ? task.reject(new Error(reply.error)) : task.resolve(reply.result);
});
probe.on('exit', () => {
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(new Error('Native preview exited'));
  }
  pending.clear();
});

function native(action, values) {
  return new Promise((resolve, reject) => {
    const id = ++sequence,
      timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native ${action} timed out`));
      }, 45000);

    pending.set(id, { resolve, reject, timer });
    probe.stdin.write(`${JSON.stringify({ id, action, ...values })}\n`);
  });
}

let browser;

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : process.env.SCREENSHOT_BROWSER === 'chromium'
        ? {}
        : { channel: 'chrome' }),
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      locale: 'ru-RU',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage(),
      errors = [];

    page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('previewInvoke', async (command, args) => {
      if (command === 'load_account_session') return null;
      if (command === 'set_window_cursor_visible' || command === 'set_window_controls_visible')
        return;
      if (command === 'fetch_image') return native('image', { url: args.url });
      if (command === 'resolve_candidates')
        return native('resolve', { candidates: args.candidates });
      if (command === 'yummy_request') {
        const request = args.request;

        assert.equal(request.method, 'GET', 'Screenshots must not change account data');
        if (!apiCache.has(request.path))
          apiCache.set(
            request.path,
            fetch(`https://api.yani.tv${request.path}`, {
              headers: request.headers,
              signal: AbortSignal.timeout(25000),
            }).then(async response => ({ status: response.status, body: await response.text() }))
          );

        return apiCache.get(request.path);
      }
      throw new Error(`Unsupported preview command: ${command}`);
    });
    await page.addInitScript(mobile => {
      window.isTauri = true;

      let id = 0,
        fullscreen = false;

      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        convertFileSrc: (path, scheme) => `https://${scheme}.localhost/${path}`,
        transformCallback: () => ++id,
        unregisterCallback() {},
        invoke: async (command, args = {}) => {
          if (command === 'desktop_info') return { platform: mobile ? 'android' : 'linux' };
          if (command === 'plugin:event|listen') return ++id;
          if (command === 'plugin:event|unlisten') return;
          if (command === 'plugin:window|is_focused') return true;
          if (command === 'plugin:window|is_maximized') return false;
          if (command === 'plugin:window|is_fullscreen') return fullscreen;
          if (command === 'plugin:window|set_fullscreen') {
            fullscreen = args.value;

            return;
          }

          return window.previewInvoke(command, args);
        },
      };
      localStorage.setItem(
        'yumiwatch:interface-settings',
        JSON.stringify({ volume: 0, sounds: false, animations: false })
      );
    }, mobile);
    await page.route('https://screenshots.test/**', async route => {
      const path = new URL(route.request().url()).pathname,
        file = resolve('dist', `.${path === '/' ? '/index.html' : path}`);

      assert.ok(file.startsWith(`${resolve('dist')}/`));

      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      };

      try {
        await route.fulfill({
          body: await readFile(file),
          contentType: types[extname(file)] || 'application/octet-stream',
        });
      } catch {
        await route.abort();
      }
    });
    await page.route('https://yumiwatch-media.localhost/**', async route => {
      try {
        const request = route.request(),
          reply = await native('media', {
            uri: `yumiwatch-media://localhost${new URL(request.url()).pathname}`,
            method: request.method(),
            range: request.headers().range,
          });
        const headers = { ...reply.headers, 'access-control-allow-origin': '*' };

        delete headers['content-length'];
        delete headers.vary;
        await route.fulfill({
          status: reply.status,
          headers,
          body: Buffer.from(reply.body, 'base64'),
        });
      } catch {
        await route.abort();
      }
    });

    const transition = () =>
      page.waitForFunction(
        () =>
          !document.documentElement.dataset.pageTransition &&
          !document.documentElement.dataset.pageFallback
      );

    const go = async path => {
      await page.evaluate(path => {
        location.hash = path;
      }, path);
      await transition();
    };

    const capture = async name => {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll('img')]
          .filter(image => {
            const r = image.getBoundingClientRect();

            return (
              r.width &&
              r.height &&
              r.top < innerHeight &&
              r.bottom > 0 &&
              r.left < innerWidth &&
              r.right > 0
            );
          })
          .every(image => image.complete && image.naturalWidth > 0)
      );
      assert.deepEqual(errors, [], 'Screenshot page has JavaScript errors');
      assert.equal(
        await page
          .locator('.toast.visible,[role=alert]:visible,.playback-loader.is-error:visible')
          .count(),
        0,
        'Screenshot contains an error'
      );
      await page.screenshot({
        path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-${name}.png`),
      });
      console.log(`Captured ${mobile ? 'mobile' : 'desktop'}-${name}`);
    };

    try {
      await page.goto('https://screenshots.test/#/');
      await page.locator('.gallery-feature h2').waitFor();
      await page.locator('.gallery-rail .anime-card').first().waitFor();
      await capture('home');
      await go('/catalog?sort=top');
      await page.locator('.catalog-gallery .anime-card').first().waitFor();
      await capture('catalog');
      await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await capture('filters');
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await go('/search');
      await page.getByRole('searchbox', { name: 'Поиск аниме', exact: true }).fill('Монолог');
      await page.locator('.search-results .anime-card').first().waitFor();
      await page.getByRole('searchbox', { name: 'Поиск аниме', exact: true }).blur();
      await capture('search');
      await go(`/anime/${animeId}`);
      await page.locator('.watch-title h1').waitFor();
      await page.locator('.voice-tile').first().waitFor();
      await capture('detail');
      await page.evaluate(() => {
        const main = document.querySelector('.media-scroll');

        main.scrollTop = 0;
      });
      await page.getByRole('button', { name: 'Серии', exact: true }).click();
      await page.locator('.episode-card').first().waitFor();
      await capture('episodes');
      await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
      await go(`/anime/${animeId}?view=watch&play=1`);
      await page.waitForFunction(() => {
        const video = document.querySelector('video[data-active=true]');

        return video?.readyState >= 2 && video.videoWidth > 0;
      });
      await page.evaluate(() => {
        const video = document.querySelector('video[data-active=true]');

        video.muted = true;
        void video.play();
      });
      await page.waitForFunction(
        () => document.querySelector('video[data-active=true]')?.currentTime > 2
      );

      const frameTime = Number(process.env.SCREENSHOT_TIME || 180);

      await page.locator('video[data-active=true]').evaluate((video, time) => {
        video.currentTime = time;
        void video.play();
      }, frameTime);
      await page.waitForFunction(time => {
        const video = document.querySelector('video[data-active=true]');

        return video && !video.seeking && video.readyState >= 2 && video.currentTime > time + 0.3;
      }, frameTime);
      await page.locator('video[data-active=true]').evaluate(video => {
        video.pause();
      });
      await page.locator('.video-controls').dispatchEvent('pointermove');
      await capture('player');

      // Seed only the isolated guest library using the public title already fetched.
      const entry = [...apiCache].find(([path]) => path.split('?')[0] === `/anime/${animeId}`);
      const metadata = entry ? await entry[1] : null;
      const detail = metadata ? JSON.parse(metadata.body).response : null;

      if (detail) {
        await page.evaluate(anime => {
          const library = JSON.parse(localStorage.getItem('yumiwatch:library:v1') || '{}');

          localStorage.setItem(
            'yumiwatch:library:v1',
            JSON.stringify({
              ...library,
              favorites: [anime],
              lists: { 0: [anime], 1: [], 2: [], 3: [], 5: [] },
            })
          );
          window.dispatchEvent(new Event('yumiwatch:library'));
        }, detail);
      } else throw new Error('Public title metadata missing for guest collection');
      await go('/profile?tab=collection');
      await page.locator('.profile-collection').waitFor();
      await capture('collection');
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(0, 1600));
      await page.screenshot({ path: resolve(output, 'capture-error.png') });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  probe.stdin.end();
  probe.kill();
  lines.close();
}
