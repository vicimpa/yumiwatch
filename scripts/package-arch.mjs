import { readFile, readdir, mkdir, mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const bundle = resolve(
  process.argv[2] || 'src-tauri/target/x86_64-unknown-linux-gnu/release/bundle'
);
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const input = join(bundle, 'deb', `YummyWatch_${version}_amd64.deb`);
const output = join(bundle, 'archlinux');

await mkdir(output, { recursive: true });

const work = await mkdtemp(join(tmpdir(), 'yummywatch-arch-'));

try {
  const files = [
    [input, 'yummywatch.deb', '@DEB_SHA256@'],
    [new URL('../public/OFL.txt', import.meta.url), 'OpenSans-OFL.txt', '@FONT_SHA256@'],
    [
      new URL('../public/licenses/shaka-player.txt', import.meta.url),
      'Shaka-Apache-2.0.txt',
      '@PLAYER_SHA256@',
    ],
  ];
  let recipe = (
    await readFile(new URL('../packaging/archlinux/PKGBUILD.in', import.meta.url), 'utf8')
  ).replace('@VERSION@', version.replaceAll('-', '_'));

  for (const [source, name, placeholder] of files) {
    const bytes = await readFile(source);

    await writeFile(join(work, name), bytes);
    recipe = recipe.replace(placeholder, createHash('sha256').update(bytes).digest('hex'));
  }
  await writeFile(join(work, 'PKGBUILD'), recipe);
  await copyFile(
    new URL('../packaging/archlinux/build.sh', import.meta.url),
    join(work, 'build.sh')
  );

  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '--mount',
      `type=bind,src=${work},dst=/input,readonly`,
      '--mount',
      `type=bind,src=${output},dst=/output`,
      'archlinux:base-devel',
      'bash',
      '/input/build.sh',
    ],
    { stdio: 'inherit' }
  );

  if (result.status !== 0)
    throw new Error(`Arch Linux packaging failed: ${result.error?.message || result.status}`);

  const packages = (await readdir(output)).filter(file => file.endsWith('.pkg.tar.zst'));

  if (packages.length !== 1) throw new Error('Expected exactly one verified Arch Linux package');
  console.log(`Verified Arch Linux package: ${packages[0]}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
