import { sourceAlias } from '../shared/paths.mjs';
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { webkit, chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Playwright already uses this PNG decoder for its screenshot comparisons.
const require = createRequire(import.meta.url);
const { PNG } = require('../node_modules/playwright-core/lib/utilsBundle.js');
const output = await build({
  configFile: false,
  resolve: { alias: sourceAlias },
  plugins: [preact()],
  logLevel: 'error',
  build: {
    write: false,
    lib: { entry: 'scripts/layout-probe.tsx', formats: ['iife'], name: 'LayoutProbe' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const bundle = (Array.isArray(output) ? output[0] : output).output.find(
  chunk => chunk.type === 'chunk'
).code;
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
  ].map(file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'))
);

for (const engine of process.env.LAYOUT_BROWSER === 'chrome' ? [chromium] : [webkit, chromium]) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {});

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    page.setDefaultTimeout(10000);
    await page.route('https://layout.test/**', async route => {
      const name = new URL(route.request().url()).pathname.slice(1);

      if (name.endsWith('.woff2'))
        return route.fulfill({
          body: await readFile(new URL(`../public/${name}`, import.meta.url)),
          contentType: 'font/woff2',
        });
      if (name) return route.abort();

      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html data-desktop="macos"><body><div id="app"></div></body></html>',
      });
    });
    await page.goto('https://layout.test/#/catalog');
    for (const content of styles) await page.addStyleTag({ content });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => document.fonts.ready);

    const pixels = async () => {
      const png = PNG.sync.read(await page.screenshot({ omitBackground: true }));

      return [
        [1200, 650],
        [190, 650],
      ].map(([x, y]) => [
        ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4),
      ]);
    };

    const baseline = await pixels();

    await page.evaluate(() => {
      location.hash = '/search';
    });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.pageTransition === 'active' &&
        document.getAnimations().some(a => a.effect?.pseudoElement)
    );
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 150;
      }
    });

    const during = await pixels();

    console.log(engine.name(), 'translucency before/during', baseline, during);
    assert.deepEqual(during, baseline, 'Background or navigation opacity changed during the slide');
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.waitForFunction(() => !document.documentElement.dataset.pageTransition);
    console.log(engine.name(), 'slide finished');

    const geometry = () =>
      page.evaluate(() => ({
        root: window.scrollY,
        nav: document.querySelector('.media-nav').getBoundingClientRect().top,
        main: document.getElementById('main').getBoundingClientRect().top,
        scroll: document.getElementById('main').scrollTop,
      }));

    const before = await geometry();

    await page.mouse.move(100, 350);
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(200);
    assert.deepEqual(await geometry(), before, 'Scrolling a fitting menu moves the page');
    console.log(engine.name(), 'fitting menu OK');
    await page.mouse.move(900, 350);
    await page.mouse.wheel(0, 650);
    await page.waitForFunction(() => document.getElementById('main').scrollTop > 0);
    await page.evaluate(() => {
      const main = document.getElementById('main');

      main.scrollTop = main.scrollHeight;
    });

    const bottom = await geometry();

    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(200);
    assert.deepEqual(
      await geometry(),
      bottom,
      'Overscrolling content moves the navigation or viewport'
    );
    await page.evaluate(() => {
      document.getElementById('main').scrollTop = 0;
    });

    const top = await geometry();

    await page.mouse.wheel(0, -1000);
    await page.waitForTimeout(200);
    assert.deepEqual(
      await geometry(),
      top,
      'Overscrolling the top moves the navigation or viewport'
    );
    console.log(engine.name(), 'content boundary OK');
    await page.evaluate(() => {
      location.hash = '/anime/1?view=watch';
    });
    await page.waitForFunction(
      () =>
        document.querySelector('.is-playback') && !document.documentElement.dataset.pageTransition
    );

    const player = await geometry();

    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(200);
    assert.deepEqual(await geometry(), player, 'Scrolling the player moves its viewport');
    console.log(engine.name(), 'player OK');
    await page.getByRole('button', { name: 'Открыть серии' }).click();
    await page.locator('.sidebar-scroll').hover();
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => document.querySelector('.sidebar-scroll')?.scrollTop > 0);
    assert.deepEqual(await geometry(), player, 'Scrolling episodes moves the player');
    await page.getByRole('button', { name: 'Закрыть панель' }).click();
    await page.evaluate(() => {
      location.hash = '/search';
    });
    await page.waitForFunction(
      () =>
        !document.querySelector('.is-playback') && !document.documentElement.dataset.pageTransition
    );
    // Older WebViews use the same live backdrop with a Web Animations slide.
    await page.evaluate(() => {
      document.startViewTransition = undefined;
      location.hash = '/catalog';
    });
    await page.waitForFunction(() => document.documentElement.dataset.pageFallback === 'active');
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 140;
      }
    });
    assert.deepEqual(await pixels(), baseline, 'Fallback slide changes window transparency');
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.waitForFunction(() => !document.documentElement.dataset.pageFallback);
    await page.setViewportSize({ width: 900, height: 480 });
    const menuNeedsScroll = await page
      .locator('.media-nav')
      .evaluate(element => element.scrollHeight > element.clientHeight);

    if (menuNeedsScroll) {
      await page.mouse.move(100, 350);
      await page.mouse.wheel(0, 650);
      await page.waitForFunction(() => document.querySelector('.media-nav').scrollTop > 0);
    }

    const account = await page.getByRole('link', { name: 'Твой профиль' }).boundingBox();

    assert.ok(
      account && account.y >= 0 && account.y + account.height <= 480,
      'Short-window menu cannot reach account'
    );
    console.log(engine.name(), 'menu, content boundaries, player, episodes and short window OK');
    // Narrow native windows use the phone header but still own desktop chrome.
    // Model the native fullscreen dataset; actual OS controls are outside the DOM.
    await mkdir('test-results/layout', { recursive: true });
    for (const platform of ['macos', 'windows'])
      for (const width of [720, 760, 761])
        for (const fullscreen of [false, true]) {
          await page.evaluate(
            ({ platform, fullscreen }) => {
              document.documentElement.dataset.desktop = platform;
              document.documentElement.dataset.desktopFullscreen = String(fullscreen);
            },
            { platform, fullscreen }
          );
          await page.setViewportSize({ width, height: 480 });
          await page.waitForFunction(
            narrow => !!document.querySelector('.phone-header') === narrow,
            width <= 760
          );

          const inset = fullscreen ? 0 : 44;
          const history = page
            .locator('.media-sidebar-chrome .navigation-history > button')
            .first();
          await history.waitFor({ state: 'visible' });
          const historyBounds = await history.boundingBox();
          assert.equal(
            historyBounds?.x,
            platform === 'macos' && !fullscreen ? 84 : 16,
            `${platform}: history reserves space only for visible macOS traffic lights`
          );

          if (width <= 760) {
            const header = await page.locator('.phone-header').boundingBox();
            const brand = await page.locator('.phone-brand').boundingBox();
            const account = await page.locator('.phone-account').boundingBox();
            const main = await page.locator('.media-scroll').boundingBox();

            assert.ok(header && brand && account && main, 'Narrow native header missing');
            assert.ok(
              brand.y >= inset && account.y >= inset,
              `${platform}: header overlaps native window controls`
            );
            assert.equal(
              header.height,
              60 + (fullscreen ? 32 : inset),
              `${platform}: native inset does not follow fullscreen`
            );
            assert.ok(
              main.y >= header.y + header.height,
              `${platform}: content starts underneath header`
            );
            if (platform === 'macos' && !fullscreen)
              await page.locator('.phone-header').screenshot({
                path: `test-results/layout/${engine.name()}-${width}-macos-header.png`,
              });
          } else {
            const brand = await page.locator('.media-nav>.media-brand').boundingBox();

            assert.ok(brand && brand.y >= inset, 'Wide navigation overlaps native window controls');
          }
        }
    console.log(engine.name(), 'native narrow headers, breakpoint and fullscreen insets OK');
  } finally {
    await browser.close();
  }
}
