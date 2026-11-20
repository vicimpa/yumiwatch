// Real production screens against a synthetic account; no writes to YummyAnime.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright';

const output = '/tmp/yumiwatch-personal-ratings-qa';
await mkdir(output, { recursive: true });
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [],
        writes = [];
      let rating = 8;
      const anime = {
        anime_id: 10531,
        anime_url: 'personal-rating-test',
        title: 'Мой личный фаворит',
        year: 2026,
        rating: { average: 6, counters: 100 },
        episodes: { aired: 12, count: 12 },
        type: { name: 'ТВ-сериал' },
      };
      const profile = { id: 42, nickname: 'Зритель', lists_privacy: 'public' };
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() =>
        sessionStorage.setItem(
          'yumiwatch:session:v1',
          JSON.stringify({
            token: 'test-personal-ratings',
            user: { id: 42, nickname: 'Зритель' },
            remember: false,
            refreshedAt: Date.now(),
          })
        )
      );
      await page.routeWebSocket(/wss:\/\/socket/, socket => socket.close());
      await page.route('https://api.github.com/**', route =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ tag_name: 'v0.0.7' }),
        })
      );
      await page.route('https://personal-rating.test/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/sw.js') return route.abort();
        try {
          const file = resolve('dist', path === '/' ? 'index.html' : path.slice(1));
          await route.fulfill({
            body: await readFile(file),
            contentType:
              {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.woff2': 'font/woff2',
                '.svg': 'image/svg+xml',
                '.webmanifest': 'application/manifest+json',
              }[extname(file)] || 'application/octet-stream',
          });
        } catch {
          await route.fulfill({ status: 404, body: '' });
        }
      });
      await page.route('https://api.yani.tv/**', async route => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        let response = [];
        if (path === `/anime/${anime.anime_id}/rate`) {
          const body = request.postDataJSON();
          writes.push({ method: request.method(), body });
          if (body?.rate === 3) response = false;
          else {
            rating = request.method() === 'DELETE' ? 0 : body.rate;
            response = { rating: 6.1, votes: 100 };
          }
        } else if (path === '/profile' || path === '/users/id42') response = profile;
        else if (path === '/users/42/lists')
          response = [
            { ...anime, user: { rating, list: { list: { id: 2 } } } },
            {
              ...anime,
              anime_id: 2,
              title: 'Другой личный выбор',
              rating: 10,
              user: { rating: 7, list: { list: null } },
            },
            {
              ...anime,
              anime_id: 3,
              title: 'Пока без оценки',
              rating: 10,
              user: { rating: 0, list: { list: { id: 2 } } },
            },
          ];
        else if (path === `/anime/${anime.anime_id}`) response = { ...anime, user: { rating } };
        else if (path.endsWith('/rates'))
          response = [
            { rating: 9, count: 75 },
            { rating: 8, count: 25 },
          ];
        else if (path.startsWith('/dialogs')) response = { dialogs: [] };
        else if (path.includes('/notifications')) response = { notifications: [] };
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ response }),
        });
      });
      await page.goto(`https://personal-rating.test/#/anime/${anime.anime_id}`);
      const control = page.getByRole('region', { name: 'Моя оценка', exact: true });
      await control.getByRole('button', { name: 'Оценить на 8 из 10', exact: true }).waitFor();
      const layout = await page.locator('.overview-heading').evaluate(heading => {
        const poster = heading.querySelector('.watch-poster').getBoundingClientRect();
        const title = heading.querySelector('h1').getBoundingClientRect();
        const resume = document.querySelector('.anime-resume-row').getBoundingClientRect();
        const description = document.querySelector('.about-description').getBoundingClientRect();
        return {
          posterOffset: poster.top - title.top,
          resumeTop: resume.top,
          descriptionTop: description.top,
        };
      });
      assert.ok(Math.abs(layout.posterOffset) <= 1, JSON.stringify(layout));
      assert.ok(layout.resumeTop < layout.descriptionTop, JSON.stringify(layout));
      if (width === 1280) {
        const active = page.locator('.media-navigation > a.active').first();
        const colors = () =>
          active.evaluate(link => {
            const style = getComputedStyle(link);
            return [style.color, style.backgroundColor, style.boxShadow];
          });
        const selected = await colors();
        await active.hover();
        assert.deepEqual(await colors(), selected);
      }
      assert.equal(
        await control
          .getByRole('button', { name: 'Оценить на 8 из 10', exact: true })
          .getAttribute('aria-pressed'),
        'true'
      );
      await control.getByRole('button', { name: 'Оценить на 10 из 10', exact: true }).click();
      await control.getByRole('status').filter({ hasText: '10 / 10' }).waitFor();
      await control.getByRole('button', { name: 'Оценить на 3 из 10', exact: true }).click();
      await control.getByRole('alert').waitFor();
      assert.equal(await control.getByRole('status').textContent(), '10 / 10');
      await control.getByRole('button', { name: 'Оценить на 9 из 10', exact: true }).click();
      await control.getByRole('status').filter({ hasText: '9 / 10' }).waitFor();
      await control.getByRole('button', { name: 'Снять оценку', exact: true }).click();
      await control.getByRole('status').filter({ hasText: 'Пока не оценено' }).waitFor();
      await control.getByRole('button', { name: 'Оценить на 10 из 10', exact: true }).click();
      await control.getByRole('status').filter({ hasText: '10 / 10' }).waitFor();
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      assert.ok(box.width >= Math.min(280, width - 40), 'Rating control uses the available width');
      await page.screenshot({ path: `${output}/${engine.name()}-${width}-rating.png` });
      await control.getByRole('link', { name: 'Мой топ', exact: true }).click();
      await page.getByRole('link', { name: 'Другой личный выбор', exact: true }).waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document.getAnimations().map(animation => animation.finished.catch(() => {}))
        );
      });
      assert.deepEqual(await page.locator('.profile-collection .card-title').allTextContents(), [
        anime.title,
        'Другой личный выбор',
      ]);
      assert.deepEqual(await page.locator('.profile-collection .rank').allTextContents(), [
        '01',
        '02',
      ]);
      assert.equal(
        await page.getByRole('combobox', { name: 'Порядок аниме' }).getAttribute('value'),
        'user_rating'
      );
      await page.screenshot({ path: `${output}/${engine.name()}-${width}-top.png` });
      await page
        .locator('.profile-collection')
        .screenshot({ path: `${output}/${engine.name()}-${width}-top-collection.png` });
      const geometry = await page.locator('.profile-collection').evaluate(el => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        overflowing: [...el.querySelectorAll('*')]
          .filter(
            node =>
              !node.closest('.profile-list-filters') &&
              node.getBoundingClientRect().right > innerWidth + 1
          )
          .map(node => ({
            tag: node.tagName,
            class: node.className,
            width: node.getBoundingClientRect().width,
            right: node.getBoundingClientRect().right,
          }))
          .slice(0, 12),
      }));
      assert.ok(geometry.scroll <= geometry.width, JSON.stringify(geometry));
      assert.deepEqual(
        writes.map(write => [write.method, write.body?.rate]),
        [
          ['PUT', 10],
          ['PUT', 3],
          ['PUT', 9],
          ['DELETE', undefined],
          ['PUT', 10],
        ]
      );
      assert.deepEqual(errors, []);
      if (width === 1280) {
        await page.evaluate(() => {
          location.hash = '/profile';
        });
        const highlights = page.locator('.profile-highlights > a');
        await highlights.first().waitFor();
        const offsets = await highlights.evaluateAll(links =>
          links.map(link => {
            const cell = link.getBoundingClientRect();
            const parts = [...link.children].map(part => part.getBoundingClientRect());
            const left = Math.min(...parts.map(part => part.left));
            const right = Math.max(...parts.map(part => part.right));
            return (left + right) / 2 - (cell.left + cell.right) / 2;
          })
        );
        assert.ok(
          offsets.every(offset => Math.abs(offset) <= 1),
          JSON.stringify(offsets)
        );
        await page.screenshot({ path: `${output}/${engine.name()}-profile-centering.png` });
      }
      console.log(
        `${engine.name()} ${width}: personal score, retry, delete, rated-only top and layout OK`
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
