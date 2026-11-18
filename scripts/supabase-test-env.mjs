#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function flatten(value, prefix = '', out = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else if (value != null) {
    out.set(prefix.toLowerCase().replace(/[^a-z0-9]/g, ''), String(value));
  }
  return out;
}

function pick(values, names) {
  for (const name of names) {
    const value = values.get(name);
    if (value) return value;
  }
  return '';
}

function runStatus() {
  try {
    return execFileSync(npx, ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: projectDir,
    });
  } catch {
    if (process.platform !== 'win32') {
      throw new Error('ローカル Supabase を起動してください（npm run db:start）。');
    }
    const script = toWslPath(path.join(projectDir, 'scripts', 'wsl-supabase.sh'));
    try {
      return execFileSync('wsl', ['-d', distro, '-u', 'root', '--', 'bash', script, 'status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        cwd: projectDir,
      });
    } catch {
      throw new Error(
        `ローカル Supabase を起動できません。npm run db:start を実行してください（WSL: ${distro}）。`,
      );
    }
  }
}

export function getSupabaseTestEnv() {
  const raw = runStatus();
  const values = flatten(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
  const url = pick(values, ['apiurl', 'url', 'supabaseurl']);
  const anon = pick(values, ['anonkey', 'authanonkey', 'publishablekey']);
  const service = pick(values, ['servicerolekey', 'authservicerolekey', 'secretkey']);

  if (!url || !anon || !service) {
    throw new Error(
      `Supabase の URL / anon key / service_role key を特定できませんでした。利用可能なキー: ${Array.from(values.keys()).join(', ')}`,
    );
  }

  return {
    SUPABASE_TEST_URL: url,
    SUPABASE_TEST_ANON_KEY: anon,
    SUPABASE_TEST_SERVICE_ROLE_KEY: service,
  };
}

function main() {
  const env = getSupabaseTestEnv();
  for (const [key, value] of Object.entries(env)) {
    console.log(`${key}=${value}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
