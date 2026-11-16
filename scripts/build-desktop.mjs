import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [target, bundles] = process.argv.slice(2);

if (!target || !bundles) throw new Error('Usage: build-desktop.mjs target bundles');

const env = { ...process.env };

// Empty optional secrets must be absent: Tauri distinguishes unset from empty.
for (const key of Object.keys(env)) if (key.startsWith('APPLE_') && !env[key]) delete env[key];

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)),
    'build',
    '--ci',
    '--target',
    target,
    '--bundles',
    bundles,
    '--',
    '--locked',
  ],
  { stdio: 'inherit', env }
);

process.exit(result.status ?? 1);
