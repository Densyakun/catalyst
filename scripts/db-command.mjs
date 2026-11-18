#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const distro = process.env.SUPABASE_WSL_DISTRO || 'Ubuntu-26.04';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function toWslPath(value) {
  const resolved = path.resolve(value);
  const match = resolved.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return resolved.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function wslReady() {
  if (process.platform !== 'win32') return false;
  const result = spawnSync(
    'wsl',
    ['-d', distro, '-u', 'root', '--', 'test', '-x', '/usr/local/bin/supabase'],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: projectDir });
  process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('使い方: node scripts/db-command.mjs <supabase のサブコマンド...>');
  process.exit(1);
}

if (wslReady()) {
  const script = toWslPath(path.join(projectDir, 'scripts', 'wsl-supabase.sh'));
  run('wsl', ['-d', distro, '-u', 'root', '--', 'bash', script, ...args]);
} else {
  if (!existsSync(path.join(projectDir, 'node_modules', '.bin'))) {
    console.error('依存関係がありません。npm install を実行してください。');
    process.exit(1);
  }
  run(npx, ['supabase', ...args]);
}
