import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const port = 4178;
const base = process.env.SCREENSHOT_BASE || `http://127.0.0.1:${port}/`;
const server = process.env.SCREENSHOT_BASE ? undefined : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser; let page;
try {
  for (let attempt = 0; attempt < 40; attempt++) { try { const response = await fetch(base); if (response.ok) break; } catch {} if (attempt === 39) throw new Error('Preview did not start'); await delay(250); }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.SCREENSHOT_BROWSER === 'chromium' ? {} : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', colorScheme: 'dark', reducedMotion: 'reduce' });
  page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (request.url().startsWith(base)) console.log('Local request failed:', request.url(), request.failure()?.errorText); });
  await mkdir(resolve('docs/screenshots'), { recursive: true });
  const checkScroll = async (modal = false) => {
    const result = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      scrollers: [...document.querySelectorAll('body *')].filter(element => {
        if (!(element instanceof HTMLElement) || !element.getClientRects().length) return false;
        const style = getComputedStyle(element);
        return /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      }).map(element => element.className),
      locked: document.body.style.overflow === 'hidden',
    }));
    assert.ok(result.width <= result.viewport + 2, `Horizontal overflow: ${JSON.stringify(result)}`);
    assert.equal(result.locked, modal, `Unexpected document lock: ${JSON.stringify(result)}`);
    assert.ok(result.scrollers.every(name => modal && name.includes('modal-scroll')), `Nested scroll: ${JSON.stringify(result)}`);
  };
  const capture = async name => {
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(img => img.getBoundingClientRect().top < innerHeight && img.getBoundingClientRect().bottom > 0).map(img => Promise.race([img.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))]))); });
    await page.screenshot({ path: resolve(`docs/screenshots/${name}.png`) }); console.log(`Captured ${name}`);
  };
  await page.goto(`${base}#/catalog?min_rating=8&sort=views`);
  await page.locator('.anime-card').first().waitFor({ timeout: 45000 });
  await checkScroll(); await capture('catalog');
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  await page.getByRole('button', { name: 'Жанры', exact: true }).click();
  await page.getByRole('button', { name: 'Фэнтези: не выбран', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Фэнтези: не выбран', exact: true }).click();
  await page.getByRole('button', { name: 'Исключить жанры' }).click();
  await page.getByRole('button', { name: 'Ужасы: не выбран', exact: true }).click();
  await page.locator('.modal-scroll').evaluate(element => { element.scrollTop = 0; });
  await checkScroll(true); await capture('filters');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true); await page.reload();
  await page.locator('.cached-notice').waitFor();
  assert.ok(await page.locator('.anime-card').count() > 0, 'Cached catalog should remain visible offline');
  await context.setOffline(false);
  await page.locator('.cached-notice').waitFor({ state: 'hidden', timeout: 45000 });
  console.log('Cached catalog remained available offline and refreshed after reconnecting.');
  await page.goto(`${base}#/search`);
  await page.getByRole('searchbox', { name: 'Поиск аниме', exact: true }).fill('Монолог');
  await page.locator('.anime-result-row').first().waitFor({ timeout: 45000 });
  await checkScroll(); await capture('search');
  const sample = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('yumiwatch:api:v1') || '{}');
    return Object.values(cache).flatMap(entry => Array.isArray(entry.data) ? entry.data : []).filter(value => value?.anime_id && value?.title).filter((value, index, all) => all.findIndex(other => other.anime_id === value.anime_id) === index).slice(0, 8);
  });
  assert.ok(sample.length >= 3, 'Not enough real catalog data for a guest collection');
  await page.evaluate(animes => { localStorage.setItem('yumiwatch:library:v1', JSON.stringify({ favorites: animes.slice(0,3), history: [], lists: { 0: animes.slice(0,2), 1: animes.slice(2,5), 2: animes.slice(5,6), 3: [], 5: animes.slice(6,8) } })); }, sample);
  await page.goto(`${base}#/library`); await page.reload();
  await page.getByRole('heading', { name: 'Моя коллекция', exact: true }).waitFor();
  await checkScroll(); await capture('collection');
  await page.goto(`${base}#/anime/10531`);
  await page.getByRole('button', { name: /Все серии/ }).waitFor({ timeout: 45000 });
  try {
    const iframe = await page.locator('iframe').elementHandle();
    const frame = await iframe.contentFrame();
    await frame.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await frame.locator('video, button').first().waitFor({ timeout: 10000 });
    console.log('Provider loaded:', frame.url());
  } catch { console.log('Provider did not finish loading in headless Chrome; episode previews remain available.'); }
  await checkScroll(); await capture('watch');
  await page.getByRole('button', { name: /Все серии/ }).click();
  await page.locator('.episode-card').first().waitFor();
  await checkScroll(true); await capture('episodes');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('link', { name: 'Комментарии', exact: true }).click();
  await page.locator('.comment-item, .discussion-empty').first().waitFor({ timeout: 45000 });
  assert.equal(await page.locator('iframe').count(), 0, 'Player should unmount when leaving watch');
  await checkScroll(); await capture('comments');
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  console.log('Mobile screens passed: no horizontal overflow, no nested vertical scrolling, modal locks restored.');
} catch (error) { if (page) { console.error((await page.locator('body').innerText()).slice(0, 2200)); console.error('Document:', (await page.content()).slice(0, 1800)); await page.screenshot({ path: '/tmp/yumi-screenshot-error.png' }); } throw error; } finally { await browser?.close(); server?.kill(); }
