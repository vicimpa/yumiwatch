import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const capture = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (command, args, cwd = root, env = process.env) => execFileSync(command, args, { cwd, env, stdio: 'inherit' });
const remote = capture('git', ['remote', 'get-url', 'origin']);
const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
if (!match) throw new Error('The origin remote must point to a GitHub repository.');
const [, owner, repository] = match;
const base = process.env.BASE_PATH || (repository.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${repository}/`);
// Use the active GitHub CLI account for this operation; do not alter global Git credentials.
const gitAuth = ['-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential'];
capture('gh', ['api', 'user', '--jq', '.login']);
run('npm', ['test']);
run('npm', ['run', 'build'], root, { ...process.env, BASE_PATH: base });
const stage = mkdtempSync(join(tmpdir(), 'yumiwatch-pages-'));
try {
  run('git', ['init', '-b', 'gh-pages'], stage);
  run('git', ['remote', 'add', 'origin', remote], stage);
  const existing = capture('git', [...gitAuth, 'ls-remote', '--heads', 'origin', 'gh-pages'], stage);
  if (existing) {
    run('git', [...gitAuth, 'fetch', '--depth=1', 'origin', 'gh-pages'], stage);
    run('git', ['checkout', '-B', 'gh-pages', 'FETCH_HEAD'], stage);
    for (const file of readdirSync(stage)) if (file !== '.git') rmSync(join(stage, file), { recursive: true, force: true });
  }
  cpSync(join(root, 'dist'), stage, { recursive: true });
  writeFileSync(join(stage, '.nojekyll'), '');
  run('git', ['add', '--all'], stage);
  const dirty = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: stage });
  if (dirty.status !== 0) {
    run('git', ['-c', `user.name=${capture('git', ['log', '-1', '--format=%an'])}`, '-c', `user.email=${capture('git', ['log', '-1', '--format=%ae'])}`, 'commit', '-m', 'Deploy YumiWatch to GitHub Pages'], stage);
    run('git', [...gitAuth, 'push', 'origin', 'gh-pages'], stage);
  } else console.log('The published build is already up to date.');
  console.log(`Build published to gh-pages: https://${owner}.github.io${base}`);
  console.log('Pages source must be set to gh-pages / (root), or use the optional Actions template.');
} finally {
  rmSync(stage, { recursive: true, force: true });
}
