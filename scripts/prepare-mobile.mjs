import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Usage: node scripts/prepare-mobile.mjs android|ios');
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, platform, 'init', '--ci', '--skip-targets-install'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
if (platform === 'android') {
  const file = new URL('../src-tauri/gen/android/app/build.gradle.kts', import.meta.url);
  let source = await readFile(file, 'utf8');
  if (!source.includes('// YummyWatch release signing')) {
    if (!source.includes('    buildTypes {') || !source.includes('        getByName("release") {')) throw new Error('Tauri Android template changed: review release signing');
    source = source.replace('    buildTypes {', `    // YummyWatch release signing. Debug builds never need the upload key.
    signingConfigs {
        create("release") {
            val keyPath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (!keyPath.isNullOrBlank()) {
                storeFile = file(keyPath)
                storePassword = System.getenv("ANDROID_STORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`).replace('        getByName("release") {', '        getByName("release") {\n            signingConfig = signingConfigs.getByName("release")');
    await writeFile(file, source);
  }
}
