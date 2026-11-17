import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { chromium, webkit } from 'playwright';
import { sourceAlias } from '../shared/paths.mjs';

const built = await build({
  configFile: false,
  resolve: { alias: sourceAlias },
  plugins: [preact()],
  logLevel: 'error',
  build: {
    write: false,
    lib: { entry: 'scripts/comments-probe.tsx', formats: ['iife'], name: 'CommentsProbe' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const files = (Array.isArray(built) ? built[0] : built).output;
const bundle = files.find(file => file.type === 'chunk').code;
const styles = await Promise.all(
  [
    'styles.css',
    'yummy.css',
    'mobile.css',
    'gallery.css',
    'media-center.css',
    'desktop.css',
    'interaction.css',
    'touch.css',
    'profile.css',
    'scrollbars.css',
    'social.css',
  ].map(file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'))
);
const output = '/tmp/yumiwatch-comments-qa';
await mkdir(output, { recursive: true });
const comment = {
  id: 12,
  name: 'Первый зритель',
  text: 'Хорошая серия. [спойлер]Развязка истории[/спойлер]',
  children_count: 1,
  deleted_at: 0,
  time: 1708208755,
  user_id: 2,
  vote: 0,
  dislikes: 0,
  likes: 3,
  parent_id: 0,
};
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {});
  try {
    for (const width of [1280, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 820 } });
      const errors = [];
      const posts = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://comments.test/**', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body><div id="app"></div></body></html>',
        })
      );
      await page.route('https://api.yani.tv/**', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'POST') {
          posts.push(request.postDataJSON());
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              response: {
                ...comment,
                id: 100,
                name: 'Зритель',
                text: posts.at(-1).text,
                parent_id: 12,
                children_count: 0,
              },
            }),
          });
        }
        const comments = url.pathname.endsWith('/children')
          ? [
              {
                ...comment,
                id: 13,
                name: 'Второй зритель',
                text: 'Ответ в дереве',
                parent_id: 12,
                children_count: 0,
              },
            ]
          : Array.from({ length: 12 }, (_, i) => ({
              ...comment,
              id: 12 + i * 10,
              name: i ? `Зритель ${i}` : comment.name,
            }));
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ response: { comments } }),
        });
      });
      await page.goto('https://comments.test/');
      for (const file of files.filter(
        file => file.type === 'asset' && file.fileName.endsWith('.css')
      ))
        await page.addStyleTag({ content: String(file.source) });
      for (const content of styles) await page.addStyleTag({ content });
      await page.addScriptTag({ content: bundle });
      const input = page.getByRole('textbox', { name: 'Твой комментарий' });
      await input.waitFor();
      await page.getByRole('button', { name: 'Ответы (1)', exact: true }).first().click();
      await page.getByText('Ответ в дереве', { exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);
      await input.fill('Текст со спойлером');
      await page.getByRole('button', { name: '+ Спойлер', exact: true }).click();
      assert.equal(posts.length, 0);
      assert.ok((await input.inputValue()).includes('[спойлер]'));
      await page
        .getByRole('group', { name: `Ответы для ${comment.name}`, exact: true })
        .getByRole('button', { name: 'Ответить', exact: true })
        .click();
      assert.equal(await page.getByRole('textbox').count(), 1);
      assert.equal(await input.getAttribute('placeholder'), 'Ответ для Второй зритель…');
      await page.getByRole('button', { name: 'Отменить ответ' }).click();
      assert.equal(posts.length, 0);
      const before = await page.locator('.discussion-compose-bar').boundingBox();
      await page.locator('.discussion-content').evaluate(el => {
        el.scrollTop = el.scrollHeight;
      });
      const after = await page.locator('.discussion-compose-bar').boundingBox();
      assert.ok(
        Math.abs(before.y - after.y) < 1,
        'Composer must stay pinned while comments scroll'
      );
      assert.ok(
        after.y + after.height <= 821 && after.x >= 0 && after.x + after.width <= width + 1,
        'Composer stays inside viewport'
      );
      await page.locator('.discussion-content').evaluate(el => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: `${output}/${engine.name()}-${width}.png` });
      // Simulate the visual viewport occupied by an on-screen keyboard.
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--visual-height', '440px');
      });
      const keyboard = await page.locator('.discussion-compose-bar').boundingBox();
      assert.ok(keyboard.y + keyboard.height <= 441, 'Composer stays above the keyboard');
      await input.fill('Проверочный ответ');
      await page
        .getByRole('group', { name: `Ответы для ${comment.name}`, exact: true })
        .getByRole('button', { name: 'Ответить', exact: true })
        .click();
      await input.press('Enter');
      await page.getByText('Проверочный ответ', { exact: true }).waitFor();
      assert.deepEqual(posts, [
        { text: 'Проверочный ответ', parent_comment: 12, reply_to_comment: 13 },
      ]);
      assert.equal(await input.inputValue(), '');
      assert.deepEqual(errors, []);
      console.log(
        `${engine.name()} ${width}: tree, one form, spoiler, pinned footer, keyboard and reply OK`
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
