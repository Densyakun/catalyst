import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return env;
}

export function loadTestEnv(): Record<string, string> {
  const fileEnv = loadEnvFile(resolve(process.cwd(), '.env.test'));
  const env: Record<string, string> = {};
  for (const key of Object.keys(fileEnv)) {
    env[key] = process.env[key] ?? fileEnv[key];
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SUPABASE_TEST_') && value != null) env[key] = value;
  }
  return env;
}
