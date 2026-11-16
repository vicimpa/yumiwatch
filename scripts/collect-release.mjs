import { readdir, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

const [platform, folder] = process.argv.slice(2);

if (!platform || !folder) throw new Error('Usage: collect-release.mjs platform folder');

const output = resolve('release-assets');

await mkdir(output, { recursive: true });

async function visit(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const file = resolve(path, entry.name);

    if (entry.isDirectory()) files.push(...(await visit(file)));
    else if (/\.(dmg|exe|msi|deb|rpm|AppImage|pkg\.tar\.zst|apk|aab|ipa|zip)$/.test(entry.name))
      files.push(file);
  }

  return files;
}

const files = await visit(resolve(folder));

if (!files.length) throw new Error(`No ${platform} installers found in ${folder}`);

const required = {
  'macos-arm64': ['dmg'],
  'macos-intel': ['dmg'],
  'windows-x64': ['exe', 'msi'],
  'linux-x64': ['deb', 'rpm', 'AppImage', 'pkg.tar.zst'],
  android: process.env.RELEASE_BUILD === 'true' ? ['apk', 'aab'] : ['apk'],
  ios: ['ipa'],
  'ios-simulator': ['zip'],
}[platform];

if (!required) throw new Error(`Unknown release platform: ${platform}`);
for (const extension of required)
  if (!files.some(file => file.endsWith(`.${extension}`)))
    throw new Error(`Missing ${platform} .${extension} installer`);
if (
  process.env.RELEASE_BUILD === 'true' &&
  platform === 'android' &&
  files.some(file => /unsigned\.apk$/.test(file))
)
  throw new Error('Refusing to publish unsigned Android APK');

const names = new Set(),
  sums = [];

for (const file of files) {
  const name = `${platform}-${basename(file)}`;

  if (names.has(name)) throw new Error(`Duplicate installer name: ${name}`);
  names.add(name);
  await copyFile(file, resolve(output, name));
  sums.push(
    `${createHash('sha256')
      .update(await readFile(file))
      .digest('hex')}  ${name}`
  );
}
await writeFile(resolve(output, `${platform}-SHA256SUMS.txt`), `${sums.sort().join('\n')}\n`);
console.log(`Collected ${files.length} ${platform} installers`);
