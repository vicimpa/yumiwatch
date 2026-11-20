// Deterministic real decoder regression: also run with WebKit/GStreamer on Linux.
// No API key, third-party video host or mocked media clock is involved.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { playerBundle } from './check-player-surface.mjs';

const directory = await mkdtemp(join(tmpdir(), 'yummywatch-speed-'));
let browser;
const server = createServer(async (request, response) => {
  try {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);

    if (!name) {
      response.setHeader('Content-Type', 'text/html');
      response.end('<div id="app"></div>');

      return;
    }
    if (!/^(video\.mp4|video\.m3u8|segment\d+\.ts)$/.test(name)) {
      response.writeHead(404);
      response.end();

      return;
    }

    const bytes = await readFile(join(directory, name));

    response.setHeader(
      'Content-Type',
      name.endsWith('.mp4')
        ? 'video/mp4'
        : name.endsWith('.ts')
          ? 'video/mp2t'
          : 'application/vnd.apple.mpegurl'
    );

    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);

    if (range) {
      const start = Number(range[1]),
        end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;

      response.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      response.end(bytes.subarray(start, end + 1));
    } else response.end(bytes);
  } catch {
    response.writeHead(500);
    response.end();
  }
});

try {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '90',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '48',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    join(directory, 'video.mp4'),
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    join(directory, 'video.mp4'),
    '-c',
    'copy',
    '-hls_time',
    '2',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    join(directory, 'segment%03d.ts'),
    join(directory, 'video.m3u8'),
  ]);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const bundle = await playerBundle();

  for (const engine of [chromium, webkit]) {
    if (process.env.RATE_BROWSER && process.env.RATE_BROWSER !== engine.name()) continue;
    browser = await engine.launch(
      engine === chromium && !process.env.CI ? { channel: 'chrome' } : {}
    );
    for (const type of ['mp4', 'hls']) {
      if (process.env.RATE_TYPE && process.env.RATE_TYPE !== type) continue;

      const page = await browser.newPage();
      const errors = [];

      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('404'))
          console.error(engine.name(), type, message.text());
      });
      await page.goto(origin);
      await page.addStyleTag({
        content: await readFile(new URL('../src/ui/Dropdown.css', import.meta.url), 'utf8'),
      });
      await page.evaluate(
        ({ origin, type }) => {
          window.surfaceInit = {
            streams: [
              { quality: 360, type, url: `${origin}/video.${type === 'hls' ? 'm3u8' : 'mp4'}` },
            ],
            provider: type === 'hls' ? 'Kodik' : 'CVH',
            title: 'Speed regression',
            start: 10,
          };
        },
        { origin, type }
      );
      await page.addScriptTag({ content: bundle });
      await page.waitForFunction(() => window.surfaceProbe?.media()?.readyState >= 1);
      await page.evaluate(() => {
        const video = window.surfaceProbe.media();

        video.muted = true;
        void video.play().catch(() => {});
      });
      try {
        await page.waitForFunction(() => window.surfaceProbe?.media()?.readyState >= 2);
      } catch (error) {
        console.error(
          await page.evaluate(() => ({
            error: document.querySelector('.playback-loader.is-error')?.textContent,
            video: window.surfaceProbe?.media()?.outerHTML,
            updates: window.surfaceProbe?.updates,
          }))
        );
        throw error;
      }
      await page.evaluate(() => {
        const video = window.surfaceProbe.media();

        video.muted = true;
        void video.play();
      });
      await page.waitForFunction(() => window.surfaceProbe.media().currentTime > 11);
      await page.locator('.video-controls').dispatchEvent('pointermove');
      await page.getByRole('button', { name: 'Настройки плеера', exact: true }).click();
      await page.getByRole('combobox', { name: 'Скорость воспроизведения' }).click();
      await page.getByRole('option', { name: '2×', exact: true }).click();
      await page.evaluate(() => {
        window.speedTrace = [];
        window.speedTimer = setInterval(() => {
          const video = window.surfaceProbe.media();

          window.speedTrace.push({
            time: video.currentTime,
            rate: video.playbackRate,
            wall: performance.now(),
          });
        }, 50);
      });
      await page.waitForFunction(() => window.speedTrace.length >= 120); // Six seconds across several HLS segments.

      const trace = await page.evaluate(() => {
        clearInterval(window.speedTimer);

        return window.speedTrace;
      });

      for (let i = 1; i < trace.length; i++)
        assert.ok(
          trace[i].time >= trace[i - 1].time - 0.05,
          `${engine.name()} ${type} rewound at 2x: ${JSON.stringify(trace.slice(Math.max(0, i - 2), i + 2))}`
        );

      const elapsed = (trace.at(-1).wall - trace[0].wall) / 1000,
        advanced = trace.at(-1).time - trace[0].time;

      assert.ok(
        advanced / elapsed > 1.7 && advanced / elapsed < 2.3,
        `${engine.name()} ${type}: effective speed ${advanced / elapsed}`
      );
      assert.equal(
        await page
          .getByRole('combobox', { name: 'Скорость воспроизведения' })
          .getAttribute('value'),
        '2'
      );
      await page.evaluate(() => {
        const video = window.surfaceProbe.media();

        video.currentTime = 45;
      });
      await page.waitForFunction(() => {
        const video = window.surfaceProbe.media();

        return !video.seeking && video.currentTime > 46 && video.playbackRate === 2;
      });

      const position = await page.evaluate(() => {
        const video = window.surfaceProbe.media();
        const before = video.currentTime;

        video.dispatchEvent(new Event('loadedmetadata'));

        return { before, after: video.currentTime };
      });

      assert.ok(
        position.after >= position.before - 0.01,
        'Repeated metadata rewound accelerated playback'
      );
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${type}: stable 2x, seek and repeated metadata OK`);
      await page.close();
    }
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
