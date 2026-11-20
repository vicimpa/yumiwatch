import { sourceAlias } from '../shared/paths.mjs';
import { build } from 'vite';
import preact from '@preact/preset-vite';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

let bundle;

export async function playerBundle() {
  if (!bundle)
    bundle = build({
      configFile: false,
      resolve: { alias: sourceAlias },
      plugins: [preact()],
      logLevel: 'error',
      build: {
        write: false,
        lib: { entry: 'scripts/player-surface-probe.tsx', formats: ['iife'], name: 'SurfaceProbe' },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    }).then(
      result =>
        (Array.isArray(result) ? result[0] : result).output.find(chunk => chunk.type === 'chunk')
          .code
    );

  return bundle;
}

export async function checkPlayerSurface(page, init, label) {
  const trace = step => {
    if (process.env.MEDIA_TRACE === '1') console.log(label, step);
  };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('https://media-probe.test/*.woff2', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);

    if (!['open-sans-cyrillic.woff2', 'open-sans-latin.woff2'].includes(name)) return route.abort();
    await route.fulfill({
      contentType: 'font/woff2',
      body: await readFile(new URL(`../public/${name}`, import.meta.url)),
    });
  });
  await page.evaluate(init => {
    document.body.innerHTML = '<div id="app"></div>';
    window.surfaceInit = init;
    window.isTauri = true;
    document.documentElement.dataset.desktop = 'macos';
    document.documentElement.dataset.screen = 'watch';
    localStorage.setItem(
      'yumiwatch:interface-settings',
      JSON.stringify({ volume: 0, sounds: false })
    );
  }, init);
  for (const file of [
    'ui/Dropdown.css',
    'styles.css',
    'yummy.css',
    'mobile.css',
    'gallery.css',
    'media-center.css',
    'desktop.css',
    'interaction.css',
    'touch.css',
  ])
    await page.addStyleTag({
      content: await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    });
  await page.addStyleTag({
    content:
      'html,body,#app{height:100%;overflow:hidden}.universal-frame{height:100dvh!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;border-radius:0!important}',
  });
  if (process.env.MEDIA_TRACE === '1')
    await page.evaluate(() => {
      window.mediaDiagnostics = [];
      for (const type of [
        'loadedmetadata',
        'emptied',
        'error',
        'seeking',
        'seeked',
        'yumiwatch:stream-error',
      ])
        document.addEventListener(
          type,
          event => {
            if (!(event.target instanceof HTMLVideoElement)) return;

            const v = event.target;

            window.mediaDiagnostics.push({
              type,
              time: v.currentTime,
              ready: v.readyState,
              source: v.currentSrc,
              error: v.error?.code,
              detail: event.detail,
            });
            if (window.mediaDiagnostics.length > 40) window.mediaDiagnostics.shift();
          },
          true
        );
    });
  await page.addScriptTag({ content: await playerBundle() });
  await page.waitForFunction(
    () =>
      window.surfaceProbe?.media()?.readyState >= 2 &&
      !document.querySelector('.playback-loader.is-error'),
    { timeout: 35000 }
  );
  await page.evaluate(() => {
    const v = window.surfaceProbe.media();

    v.muted = true;
    void v.play();
  });
  await page.waitForFunction(() => window.surfaceProbe.media().currentTime > 2, { timeout: 30000 });
  trace('decoded');

  const before = await page.evaluate(() => {
    const v = window.surfaceProbe.media();

    return { time: v.currentTime, width: v.videoWidth, height: v.videoHeight };
  });

  assert.ok(before.width > 0 && before.height > 0, 'No decoded frames');

  const clean = async () => {
    assert.equal(
      await page.locator('.playback-loader.is-error').count(),
      0,
      'Error overlay covers decoded video'
    );
    assert.equal(await page.locator('.playback-loader').count(), 0, 'Loader covers decoded video');
  };

  await clean();
  if (process.env.MEDIA_SKIP_FAULTS !== '1') {
    // A failed request while the buffer is progressing must not cover the picture.
    await page.evaluate(() =>
      window.surfaceProbe.media().dispatchEvent(new Event('yumiwatch:stream-error'))
    );
    await clean();
    // Inject a surface failure without sending a fabricated native MediaError to
    // Shaka itself: a real terminal decoder failure requires a new decoder.
    await page.evaluate(() => {
      const v = window.surfaceProbe.media();

      Object.defineProperty(v, 'error', { value: { code: 2 }, configurable: true });
      v.dispatchEvent(new Event('yumiwatch:stream-error'));
    });
    await page.waitForFunction(() => !!document.querySelector('.playback-loader.is-error'));
    await page.evaluate(() => {
      delete window.surfaceProbe.media().error;
    });
    await page.waitForFunction(
      () =>
        !document.querySelector('.playback-loader.is-error') &&
        window.surfaceProbe.media().currentTime > 3,
      { timeout: 10000 }
    );
    await clean();
  }

  const recovered = await page.evaluate(() => window.surfaceProbe.media().currentTime);

  trace('recovered');
  assert.ok(recovered >= before.time, 'Recovery rewound playback');
  await page.evaluate(() => {
    window.surfaceProbe.media().currentTime = 60;
  });
  await page.waitForFunction(
    () => {
      const v = window.surfaceProbe.media();

      return v.currentTime > 61 && !v.seeking && v.readyState >= 2;
    },
    { timeout: 30000 }
  );
  await clean();
  trace('seeked');

  const higher = init.streams
    .filter(stream => stream.quality > 360 && stream.quality <= 720)
    .sort((a, b) => b.quality - a.quality)[0];

  if (higher) {
    trace(`switching to ${higher.quality}`);
    await page.locator('.video-controls').dispatchEvent('pointermove');
    await page.getByRole('button', { name: 'Настройки плеера', exact: true }).click();
    await page.getByRole('combobox', { name: 'Качество видео' }).click();
    await page.getByRole('option', { name: `${higher.quality}p`, exact: true }).click();
    await page.getByRole('button', { name: 'Закрыть настройки' }).click();

    const switchingAt = await page.evaluate(() => window.surfaceProbe.media().currentTime);
    let timer;

    if (process.env.MEDIA_TRACE === '1')
      timer = setInterval(() => {
        void page
          .evaluate(() =>
            [...document.querySelectorAll('video')].map(v => ({
              active: v.dataset.active,
              time: v.currentTime,
              height: v.videoHeight,
              paused: v.paused,
              seeking: v.seeking,
            }))
          )
          .then(state => console.log(label, state))
          .catch(() => {});
      }, 4000);
    try {
      await page.waitForFunction(
        ({ height, time }) => {
          const v = window.surfaceProbe.media();

          return (
            !document.querySelector('.video-quality-switch') &&
            v.currentTime > time + 0.5 &&
            v.videoHeight > height
          );
        },
        { height: before.height, time: switchingAt },
        { timeout: 30000 }
      );
    } finally {
      clearInterval(timer);
    }
    await clean();
    trace('quality changed');

    const lower = init.streams.find(stream => stream.quality === 360);

    if (lower) {
      await page.evaluate(() => window.surfaceProbe.media().pause());

      const pausedAt = await page.evaluate(() => window.surfaceProbe.media().currentTime);

      const change = async (quality, up) => {
        const height = await page.evaluate(() => window.surfaceProbe.media().videoHeight);

        await page.locator('.video-controls').dispatchEvent('pointermove');
        await page.getByRole('button', { name: 'Настройки плеера', exact: true }).click();
        await page.getByRole('combobox', { name: 'Качество видео' }).click();
        await page.getByRole('option', { name: `${quality}p`, exact: true }).click();
        await page.getByRole('button', { name: 'Закрыть настройки' }).click();
        await page.waitForFunction(
          ({ height, up }) => {
            const v = window.surfaceProbe.media();

            return (
              !document.querySelector('.video-quality-switch') &&
              v.readyState >= 2 &&
              (up ? v.videoHeight > height : v.videoHeight < height)
            );
          },
          { height, up },
          { timeout: 30000 }
        );
      };

      await change(lower.quality, false);

      const paused = await page.evaluate(() => ({
        paused: window.surfaceProbe.media().paused,
        time: window.surfaceProbe.media().currentTime,
      }));

      assert.ok(
        paused.paused && Math.abs(paused.time - pausedAt) < 0.3,
        'Quality change lost pause or position'
      );
      await page.evaluate(() => window.surfaceProbe.media().play());
      await change(higher.quality, true);
      await page.waitForFunction(
        time => window.surfaceProbe.media().currentTime > time + 0.5,
        pausedAt,
        { timeout: 10000 }
      );
      await clean();
      trace('repeated and paused switches');
    }
  }

  // A failed standby decoder must leave the live layer and controls usable.
  const qualityFailures = await page.evaluate(() => window.surfaceProbe.qualityFailures.length);

  await page.route('https://yumiwatch-media.localhost/unavailable-quality.m3u8', route =>
    route.fulfill({ status: 404, body: 'Unavailable test quality' })
  );
  await page.evaluate(() =>
    window.surfaceProbe.setStream({
      quality: 2160,
      type: 'hls',
      url: 'https://yumiwatch-media.localhost/unavailable-quality.m3u8',
    })
  );
  await page.waitForFunction(
    count => window.surfaceProbe.qualityFailures.length > count,
    qualityFailures,
    { timeout: 20000 }
  );
  await clean();

  const overlaps = await page.evaluate(() => {
    const a = document.querySelector('.native-skip-notice')?.getBoundingClientRect(),
      b = document.querySelector('.video-heading strong')?.getBoundingClientRect();

    return (
      !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );
  });

  assert.equal(overlaps, false, 'Quality notice overlaps the title');

  const pos = await page.evaluate(() => window.surfaceProbe.media().currentTime);

  await page.waitForFunction(pos => window.surfaceProbe.media().currentTime > pos + 0.5, pos, {
    timeout: 10000,
  });
  // Exercise settings and narrow-window control geometry on the actual UI.
  await page.locator('.video-controls').dispatchEvent('pointermove');
  await page.getByRole('button', { name: 'Настройки плеера', exact: true }).click();
  assert.ok(await page.getByRole('dialog', { name: 'Настройки плеера' }).isVisible());
  await page.getByRole('button', { name: 'Закрыть настройки' }).click();
  await page.getByRole('button', { name: 'Полный экран', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
  assert.equal(
    await page.locator('.video-fullscreen-error').count(),
    0,
    'Fullscreen reported an error'
  );
  await clean();
  await page.setViewportSize({ width: 720, height: 480 });
  await page.locator('.video-controls').dispatchEvent('pointermove');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  assert.equal(overflow, false, 'Player overflows narrow window');

  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.video-toolbar button:not(:disabled)')].some(button => {
      const r = button.getBoundingClientRect();

      return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight;
    })
  );

  assert.equal(clipped, false, 'Playback controls are clipped at the minimum window size');
  await mkdir('/private/tmp/yumiwatch-player-qa', { recursive: true });

  const filename = label.replace(/[^a-z0-9-]/gi, '_');

  await page.evaluate(() => window.surfaceProbe.media().pause());
  await page.screenshot({
    path: `/private/tmp/yumiwatch-player-qa/${filename}.png`,
    animations: 'disabled',
    timeout: 15000,
  });
  console.log(
    `${label}: UI recovery, failed quality switch, seek and narrow layout OK (${before.width}×${before.height})`
  );
}
