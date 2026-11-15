import { readdir, stat, lstat, mkdir, rename, rm, realpath, open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const project = fileURLToPath(new URL('../', import.meta.url));
// Deliberately do not follow CARGO_TARGET_DIR: it may be shared by other projects.
export async function inspectTree(path, seen = new Set()) {
  let bytes = 0, modified = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === 'bundle' || entry.name.startsWith('.yummywatch')) continue;
    const file = join(path, entry.name);
    if (entry.isDirectory()) {
      const child = await inspectTree(file, seen);
      bytes += child.bytes; modified = Math.max(modified, child.modified);
    } else if (entry.isFile()) {
      const info = await stat(file);
      modified = Math.max(modified, info.mtimeMs);
      const inode = info.ino ? `${info.dev}:${info.ino}` : file;
      // Cargo hardlinks binaries into deps/; count their disk usage only once.
      if (!seen.has(inode)) {
        seen.add(inode);
        bytes += typeof info.blocks === 'number' ? info.blocks * 512 : info.size;
      }
    }
  }
  return { bytes, modified };
}
export function shouldClean({ bytes, modified }, now, maxBytes, maxDays) {
  // Size bounds apply at the next build; age bounds apply even to small caches.
  return bytes > 0 && (bytes > maxBytes || now - modified > maxDays * DAY);
}
function buildsRunning() {
  const command = process.platform === 'win32' ? 'tasklist' : 'ps';
  const args = process.platform === 'win32' ? ['/FO', 'CSV', '/NH'] : ['-A', '-o', 'comm='];
  const result = spawnSync(command, args, { encoding: 'utf8' });
  // Fail closed if process inspection is unavailable.
  return result.status !== 0 || /(?:^|[\/\\\s"])(?:cargo|rustc|rustup)(?:\.exe)?(?:[\s",]|$)/im.test(result.stdout);
}
export async function cleanTauri({ dryRun = false, root = project } = {}) {
  if (process.env.CI || process.env.YUMMYWATCH_CLEAN_DISABLED === '1') return;
  const configured = process.env.CARGO_TARGET_DIR;
  const target = resolve(root, 'src-tauri/target');
  if (configured && resolve(root, configured) !== target) {
    console.log('[tauri cache] Shared/custom CARGO_TARGET_DIR: automatic cleanup skipped.'); return;
  }
  try {
    if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== target) return;
  } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (buildsRunning()) { console.log('[tauri cache] Rust process active or process list unavailable; cleanup skipped.'); return; }
  const maxGB = Number(process.env.YUMMYWATCH_CACHE_MAX_GB ?? 12);
  const maxDays = Number(process.env.YUMMYWATCH_CACHE_DAYS ?? 14);
  if (!Number.isFinite(maxGB) || maxGB <= 0 || !Number.isFinite(maxDays) || maxDays <= 0) throw new Error('Cache limits must be positive numbers');
  // Serializes simultaneous npm invocations; Cargo itself locks during clean.
  const lockPath = join(target, '.yummywatch-clean.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (Date.now() - (await stat(lockPath)).mtimeMs > DAY) {
      await rm(lockPath, { force: true });
      return cleanTauri({ dryRun, root });
    }
    return;
  }
  try {
    const profiles = [];
    const candidates = [target];
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.isDirectory() && /^(?:aarch64|armv7|i686|x86_64)-/.test(entry.name)) candidates.push(join(target, entry.name));
    }
    for (const base of candidates) for (const name of ['debug', 'release']) {
      const path = join(base, name);
      try {
        if ((await lstat(path)).isSymbolicLink()) continue;
        profiles.push({ path, name, base, ...await inspectTree(path) });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    let total = profiles.reduce((sum, profile) => sum + profile.bytes, 0);
    // Reclaim the least recently changed profiles first until under the total budget.
    for (const profile of profiles.sort((a, b) => a.modified - b.modified)) {
      if (!shouldClean(profile, Date.now(), total > maxGB * 1024 ** 3 ? 0 : Infinity, maxDays)) continue;
      console.log(`[tauri cache] ${dryRun ? 'Would clean' : 'Cleaning'} ${profile.path}: ${(profile.bytes / 1024 ** 3).toFixed(2)} GiB`);
      if (!dryRun) {
        if (buildsRunning()) break;
        // Cargo owns cache invalidation. Preserve distributable installers outside
        // the target tree while cargo clean removes compiler artifacts.
        const bundle = join(profile.path, 'bundle');
        const saved = join(target, `.yummywatch-bundle-${process.pid}`);
        let preserved = false;
        try {
          try { await rename(bundle, saved); preserved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
          const args = ['clean', '--manifest-path', join(root, 'src-tauri/Cargo.toml'), '--profile', profile.name === 'debug' ? 'dev' : 'release'];
          if (profile.base !== target) args.push('--target', profile.base.slice(target.length + 1));
          const result = spawnSync('cargo', args, { cwd: root, stdio: 'inherit' });
          if (result.status !== 0) throw new Error('cargo clean failed');
        } finally {
          if (preserved) { await mkdir(dirname(bundle), { recursive: true }); await rename(saved, bundle); }
        }
      }
      total -= profile.bytes;
    }
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await cleanTauri({ dryRun: process.argv.includes('--dry-run') });
}
