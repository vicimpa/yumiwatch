import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const token = process.env.VITE_YANI_APPLICATION_TOKEN;
if (!token || /\s/.test(token)) throw new Error('Configure a non-empty YANI_APPLICATION_TOKEN secret without whitespace before releasing');

if (process.argv[2]) {
  const assets = join(resolve(process.argv[2]), 'assets');
  const files = (await readdir(assets)).filter(name => name.endsWith('.js'));
  const sources = await Promise.all(files.map(name => readFile(join(assets, name), 'utf8')));
  if (!sources.some(source => source.includes(token))) throw new Error('Application token is missing from the built frontend; refusing to release');
  console.log('Application token verified in the built frontend');
} else {
  console.log('Application token configured for release');
}
