import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const cargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = cargo.match(/^version = "([^"]+)"/m)?.[1];

if (version !== pkg.version)
  throw new Error(`Cargo version ${version} differs from package.json ${pkg.version}`);
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version)
  throw new Error('package-lock.json version differs from package.json');
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${pkg.version}`)
  throw new Error(`Tag must be v${pkg.version}, got ${process.env.RELEASE_TAG}`);
console.log(`Release version: ${pkg.version}`);
