#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSupabaseTestEnv } from './supabase-test-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');

let testEnv;
try {
  testEnv = getSupabaseTestEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const vitest = path.join(projectDir, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.integration.config.mts'],
  {
    stdio: 'inherit',
    cwd: projectDir,
    env: {
      ...process.env,
      ...testEnv,
      SUPABASE_TEST_INTEGRATION: '1',
    },
  },
);

process.exit(result.status ?? 1);
