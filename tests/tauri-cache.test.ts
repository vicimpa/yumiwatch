import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, link, stat, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error Build maintenance scripts are plain Node modules.
import { inspectTree, shouldClean } from '../scripts/clean-tauri.mjs';

const folders: string[] = [];

afterEach(async () => {
  for (const path of folders.splice(0)) await rm(path, { recursive: true, force: true });
});
describe('Tauri artifact retention', () => {
  it('cleans stale profiles or profiles over budget and retains recently used caches', () => {
    const now = Date.now(),
      day = 86_400_000;

    expect(shouldClean({ bytes: 100, modified: now - day }, now, 1000, 14)).toBe(false);
    expect(shouldClean({ bytes: 100, modified: now - 15 * day }, now, 1000, 14)).toBe(true);
    expect(shouldClean({ bytes: 1001, modified: now }, now, 1000, 14)).toBe(true);
    expect(shouldClean({ bytes: 0, modified: 0 }, now, 0, 14)).toBe(false);
  });
  it('ignores installers and symlinks when measuring compiler cache age and size', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yummywatch-cache-'));

    folders.push(root);
    await mkdir(join(root, 'deps'));
    await mkdir(join(root, 'bundle'));
    await writeFile(join(root, 'deps', 'old.rlib'), 'rust');

    const old = new Date(Date.now() - 20 * 86_400_000);

    await utimes(join(root, 'deps', 'old.rlib'), old, old);
    await link(join(root, 'deps', 'old.rlib'), join(root, 'duplicate.rlib'));
    await writeFile(join(root, 'bundle', 'installer.pkg'), 'keep installer');
    await symlink(join(root, 'bundle'), join(root, 'external'));

    const info = await inspectTree(root);
    const artifact = await stat(join(root, 'deps', 'old.rlib'));

    expect(info.bytes).toBe(artifact.blocks * 512);
    expect(info.modified).toBeCloseTo(old.getTime(), -1);
  });
});
