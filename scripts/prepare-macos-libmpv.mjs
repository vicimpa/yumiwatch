import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (
  process.platform !== 'darwin' ||
  (process.argv.includes('--dev') && process.env.YUMIWATCH_LIBMPV)
)
  process.exit(0);

const root = fileURLToPath(new URL('../', import.meta.url));
const built = join(root, 'src-tauri/native-libs/macos');
const recipeDirectory = join(root, 'packaging/macos');
const script = join(recipeDirectory, 'build-libmpv.sh');
const hash = createHash('sha256');
for (const file of ['build-libmpv.sh', 'yumiwatch_protocol.c', 'yumiwatch_protocol.h']) {
  hash.update(readFileSync(join(recipeDirectory, file)));
}
const recipe = hash.digest('hex');
const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  (process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin');
const targets =
  target === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(built, { recursive: true });
const libraries = targets.map(architecture => {
  const directory = join(built, architecture);
  const binary = join(directory, 'libmpv.2.dylib');
  const stamp = join(directory, 'recipe');
  if (!existsSync(binary) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== recipe) {
    run('bash', [script, architecture, directory]);
    writeFileSync(stamp, recipe);
  }
  return binary;
});

const library = join(built, 'libmpv.2.dylib');
if (libraries.length === 1) cpSync(libraries[0], library);
else run('lipo', ['-create', ...libraries, '-output', library]);
cpSync(join(built, targets[0], 'libmpv-licenses'), join(built, 'libmpv-licenses'), {
  recursive: true,
});
